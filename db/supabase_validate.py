"""Validate the baseline migration + RLS isolation against a real Supabase Postgres.

Driven by ``db/supabase_validate.sh`` (run via ``uv run`` so psycopg/alembic are on the
path). Reads the admin connection from ``services/api/.env.cloud`` (gitignored) — parsed,
not shell-sourced, so stray characters can't execute. SYNTHETIC DATA ONLY: the pytest
suite seeds throwaway orgs/candidates to prove cross-tenant isolation on the cloud DB. Do
NOT point this at real candidate PII until the ⚖️ counsel sign-offs (DECISIONS D2/D3/D5) +
region/DPA are cleared.

Steps: parse + normalize the admin URL → ``alembic upgrade head`` (owner) → generate &
set the ``manfriday_app`` password → derive the app URL → assert the app role is
non-BYPASSRLS and sees 0 rows without ``app.current_org`` → write ``.env.cloud.app`` →
run the full pytest suite against Supabase.
"""

from __future__ import annotations

import os
import re
import secrets
import subprocess
import sys
from pathlib import Path
from urllib.parse import parse_qsl, quote, urlencode, urlsplit, urlunsplit

ROOT = Path(__file__).resolve().parents[1]
API_DIR = ROOT / "services" / "api"
ENV_FILE = API_DIR / ".env.cloud"
APP_ENV_OUT = API_DIR / ".env.cloud.app"

_ADMIN_KEYS = ("SUPABASE_ADMIN_URL", "DATABASE_ADMIN_URL", "DATABASE_URL")
_LINE = re.compile(r"^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$")


def _mask(url: str) -> str:
    return re.sub(r"(//[^:]+:)[^@]+@", r"\1********@", url)


def _parse_env(path: Path) -> dict[str, str]:
    if not path.exists():
        sys.exit(f"ERROR: {path} not found. See docs/SUPABASE.md.")
    out: dict[str, str] = {}
    for line in path.read_text().splitlines():
        m = _LINE.match(line)
        if not m:
            continue  # skip blanks, comments, stray ``` fences
        val = m.group(2).strip()
        if len(val) >= 2 and val[0] == val[-1] and val[0] in "\"'":
            val = val[1:-1]
        out[m.group(1)] = val
    return out


def _normalize_admin_url(raw: str) -> str:
    raw = raw.strip()
    if "[YOUR-PASSWORD]" in raw or "<DB_PASSWORD>" in raw:
        sys.exit(
            "ERROR: the password placeholder is still in services/api/.env.cloud — fill it in."
        )
    if raw.startswith("postgresql+psycopg://"):
        pass
    elif raw.startswith("postgresql://"):
        raw = "postgresql+psycopg://" + raw[len("postgresql://") :]
    elif raw.startswith("postgres://"):
        raw = "postgresql+psycopg://" + raw[len("postgres://") :]
    else:
        scheme = raw.split("://", 1)[0] if "://" in raw else raw[:12]
        sys.exit(f"ERROR: unexpected scheme in connection URL: {scheme}…")
    parts = urlsplit(raw)
    q = dict(parse_qsl(parts.query))
    q.setdefault("sslmode", "require")  # Supabase requires TLS
    return urlunsplit((parts.scheme, parts.netloc, parts.path, urlencode(q), parts.fragment))


def _derive_app_url(admin_url: str, app_pw: str) -> str:
    parts = urlsplit(admin_url)
    admin_user = parts.username or "postgres"
    # Supabase's pooler uses "<role>.<project_ref>" usernames — keep any ".<ref>" suffix.
    suffix = "." + admin_user.split(".", 1)[1] if "." in admin_user else ""
    app_user = "manfriday_app" + suffix
    host = parts.hostname or ""
    port = f":{parts.port}" if parts.port else ""
    netloc = f"{quote(app_user)}:{quote(app_pw)}@{host}{port}"
    return urlunsplit((parts.scheme, netloc, parts.path, parts.query, parts.fragment))


def _run(cmd: list[str], env: dict[str, str], cwd: Path = API_DIR) -> None:
    proc = subprocess.run(cmd, cwd=cwd, env={**os.environ, **env})
    if proc.returncode != 0:
        sys.exit(proc.returncode)


def main() -> None:
    import psycopg

    env = _parse_env(ENV_FILE)
    raw = next((env[k] for k in _ADMIN_KEYS if env.get(k)), None)
    if not raw:
        sys.exit(f"ERROR: no connection URL in {ENV_FILE} (expected one of {_ADMIN_KEYS}).")
    admin_url = _normalize_admin_url(raw)
    print(f"==> admin URL: {_mask(admin_url)}")

    print("==> 1/4  Applying the baseline migration (as owner)…")
    _run(["uv", "run", "alembic", "upgrade", "head"], {"DATABASE_ADMIN_URL": admin_url})

    print("==> 2/4  Generating + setting the manfriday_app password; deriving the app URL…")
    app_pw = secrets.token_urlsafe(24)
    raw_admin = admin_url.replace("postgresql+psycopg://", "postgresql://", 1)
    with psycopg.connect(raw_admin, autocommit=True) as conn:
        conn.execute("ALTER ROLE manfriday_app WITH LOGIN PASSWORD %s", (app_pw,))
    app_url = _derive_app_url(admin_url, app_pw)
    print(f"    app URL: {_mask(app_url)}")

    print("==> 3/4  Sanity: app role connects, non-BYPASSRLS, 0 rows without the GUC…")
    raw_app = app_url.replace("postgresql+psycopg://", "postgresql://", 1)
    with psycopg.connect(raw_app) as conn:
        who, bypass = conn.execute(
            "select current_user, rolbypassrls from pg_roles where rolname = current_user"
        ).fetchone()
        visible = conn.execute("select count(*) from candidate").fetchone()[0]
    print(f"    connected as {who}; bypassrls={bypass}; candidate rows visible w/o GUC={visible}")
    if bypass is not False:
        sys.exit("FAIL: manfriday_app must NOT have BYPASSRLS")
    if visible != 0:
        sys.exit("FAIL: RLS leak — rows visible without app.current_org set")
    print("    OK — RLS is in force for the app role")

    APP_ENV_OUT.write_text(
        "# Auto-generated by db/supabase_validate.py — gitignored. The manfriday_app\n"
        "# app-role connection (non-BYPASSRLS). Regenerate by re-running the validator.\n"
        f"DATABASE_URL={app_url}\n"
    )
    APP_ENV_OUT.chmod(0o600)
    print("    wrote services/api/.env.cloud.app")

    print("==> 4/4  Running the full pytest suite against Supabase…")
    # Run from the repo root (as CI does) so the whole suite is collected — running from
    # services/api mis-resolves the rootdir and deselects most tests.
    _run(
        ["uv", "run", "pytest", "-q"],
        {"DATABASE_ADMIN_URL": admin_url, "DATABASE_URL": app_url},
        cwd=ROOT,
    )

    print("==> DONE — baseline + RLS + product API validated on Supabase (synthetic data).")


if __name__ == "__main__":
    main()
