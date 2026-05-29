"""Shared fixtures for the integration tests (WP 0.2 RLS + WP 0.3 leak probe).

These need the local Postgres (``manfriday_dev`` with migration 0001 applied) and
SKIP cleanly when no migrated database is reachable, so the unit suite stays
green without infra.
"""

from __future__ import annotations

import getpass
import os
import uuid
from collections.abc import Iterator

import pytest
from sqlalchemy import Engine, create_engine, text
from sqlalchemy.exc import OperationalError, ProgrammingError

ADMIN_URL = os.environ.get(
    "DATABASE_ADMIN_URL",
    f"postgresql+psycopg://{getpass.getuser()}@localhost:5432/manfriday_dev",
)
APP_URL = os.environ.get(
    "DATABASE_URL",
    "postgresql+psycopg://manfriday_app@localhost:5432/manfriday_dev",
)


def onehot(idx: int, dim: int = 1024) -> str:
    """A one-hot embedding as a pgvector text literal (cast with ``::vector`` in SQL)."""
    return "[" + ",".join("1" if i == idx else "0" for i in range(dim)) + "]"


@pytest.fixture(scope="session")
def admin_engine() -> Iterator[Engine]:
    """Superuser engine (bypasses RLS) for seeding. Skips the suite if no migrated DB."""
    engine = create_engine(ADMIN_URL)
    try:
        with engine.connect() as conn:
            conn.execute(text("select 1 from candidate limit 1"))
    except (OperationalError, ProgrammingError) as exc:
        engine.dispose()
        pytest.skip(f"no migrated database available: {exc}")
    yield engine
    engine.dispose()


@pytest.fixture
def app_engine() -> Iterator[Engine]:
    """Application engine, connected as the non-BYPASSRLS role ``manfriday_app``."""
    engine = create_engine(APP_URL)
    yield engine
    engine.dispose()


@pytest.fixture
def seed(admin_engine: Engine) -> Iterator[dict[str, uuid.UUID]]:
    """Two orgs, each with a candidate and a one-hot embedding (seeded as superuser).

    Org A's embedding is at index 0 and Org B's at index 1, so a probe that queries
    with Org A's vector would surface A's row first *if* RLS failed.
    """
    org_a, org_b = uuid.uuid4(), uuid.uuid4()
    cand_a, cand_b = uuid.uuid4(), uuid.uuid4()
    insert_emb = text(
        "insert into embedding (org_id, owner_type, owner_id, model_id, dim, vector) "
        "values (:o, 'candidate', :owner, 'test-model', 1024, (:vec)::vector)"
    )
    with admin_engine.begin() as conn:
        for org, kind, name in ((org_a, "agency", "Org A"), (org_b, "direct", "Org B")):
            conn.execute(
                text("insert into organization (id, type, name) values (:id, :t, :n)"),
                {"id": org, "t": kind, "n": name},
            )
        for cand, org in ((cand_a, org_a), (cand_b, org_b)):
            conn.execute(
                text("insert into candidate (id, org_id, external_ref) values (:id, :o, 'ref')"),
                {"id": cand, "o": org},
            )
        conn.execute(insert_emb, {"o": org_a, "owner": cand_a, "vec": onehot(0)})
        conn.execute(insert_emb, {"o": org_b, "owner": cand_b, "vec": onehot(1)})
    yield {"org_a": org_a, "org_b": org_b, "cand_a": cand_a, "cand_b": cand_b}
    with admin_engine.begin() as conn:
        conn.execute(
            text("delete from embedding where org_id in (:a, :b)"), {"a": org_a, "b": org_b}
        )
        conn.execute(
            text("delete from candidate where org_id in (:a, :b)"), {"a": org_a, "b": org_b}
        )
        conn.execute(
            text("delete from organization where id in (:a, :b)"), {"a": org_a, "b": org_b}
        )


@pytest.fixture
def anyio_backend() -> str:
    return "asyncio"
