# Local setup

Phase 0 scaffold. This gets the monorepo building and the test/lint/typecheck
gates green locally. The **cloud-provisioning half** (Neon, Vercel, AWS Fargate,
KMS) is gated on your accounts — see [Cloud provisioning](#cloud-provisioning).

## Toolchain

| Tool | Version | Install |
|---|---|---|
| Node | ≥ 20 (CI uses 22) | https://nodejs.org or `nvm install` (`.nvmrc` pins 22) |
| pnpm | 11.x | `npm install -g pnpm` |
| uv | latest | `curl -LsSf https://astral.sh/uv/install.sh \| sh` |
| Python | 3.12 | `uv python install 3.12` (`.python-version` pins 3.12) |

> Optional, only for the deploy/IaC half: **Docker** (build the api image) and
> **Terraform ≥ 1.9** (`infra/`). Not needed to build or test the app.

## JS/TS workspace (`web`, `packages/*`)

```bash
pnpm install                              # installs web + packages, writes pnpm-lock.yaml
pnpm --filter @manfriday/contracts gen    # OpenAPI 3.1 → src/generated/schema.ts
pnpm -r typecheck                         # tsc --noEmit across packages
pnpm -r lint                              # next lint
pnpm --filter @manfriday/web build        # production Next.js build
pnpm --filter @manfriday/web dev          # dev server → http://localhost:3000
```

Health check: `GET http://localhost:3000/api/health` → `{"status":"ok","service":"web-bff","phase":0}`.

## Python workspace (`services/*`)

```bash
uv sync --all-packages                    # creates .venv, installs all members + dev tools, writes uv.lock
uv run ruff check . && uv run ruff format --check .
uv run mypy
uv run pytest
uv run uvicorn app.main:app --reload --app-dir services/api   # → http://localhost:8000/health
```

Health check: `GET http://localhost:8000/health` → `{"status":"ok","service":"api","phase":0}`.

## CI

`.github/workflows/ci.yml` runs three jobs on push/PR: **js** (typecheck · lint ·
contract-drift · build), **python** (ruff · mypy · pytest), **container** (build
the FastAPI image, no push). Lockfiles (`pnpm-lock.yaml`, `uv.lock`) are committed
so `--frozen` installs are reproducible.

## Cloud provisioning

Not done in WP 0.1 — it needs **your** credentials and is gated by
[`docs/DECISIONS.md` D8](docs/DECISIONS.md) (no real candidate PII until DPA +
US-region + envelope encryption are confirmed). The checklist (AWS OIDC role,
Neon project, Vercel project, remote Terraform state) lives in
[`infra/README.md`](infra/README.md). Until then: **synthetic data only.**

## What is a placeholder in Phase 0

Empty, WP-tagged stubs (no logic yet): `services/api/app/{db,router,redaction,audit,provenance}`,
`web/lib/{auth,api}`, `packages/prompts`, `infra/` modules, `db/fixtures`. Each
names the work package that fills it (0.2–0.13). No employment-decision logic
ships in Phase 0.
