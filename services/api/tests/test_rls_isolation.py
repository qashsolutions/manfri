"""Cross-tenant isolation tests for the WP 0.2 RLS spine.

Integration tests: they need the local Postgres (``manfriday_dev``) with migration
0001 applied, and they **skip cleanly** when no migrated database is reachable, so
the unit suite stays green without infra. The full leak probe (pgvector KNN,
worker path, PgBouncer transaction pooling) becomes a CI gate in WP 0.3.
"""

from __future__ import annotations

import getpass
import os
import uuid
from collections.abc import Iterator

import pytest
from sqlalchemy import Engine, create_engine, text
from sqlalchemy.exc import OperationalError, ProgrammingError

from app.db.session import tenant_transaction

OrgPair = tuple[uuid.UUID, uuid.UUID]

ADMIN_URL = os.environ.get(
    "DATABASE_ADMIN_URL",
    f"postgresql+psycopg://{getpass.getuser()}@localhost:5432/manfriday_dev",
)
APP_URL = os.environ.get(
    "DATABASE_URL",
    "postgresql+psycopg://manfriday_app@localhost:5432/manfriday_dev",
)


@pytest.fixture(scope="module")
def admin_engine() -> Iterator[Engine]:
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
    engine = create_engine(APP_URL)
    yield engine
    engine.dispose()


@pytest.fixture
def two_orgs(admin_engine: Engine) -> Iterator[OrgPair]:
    """Seed two organizations + a candidate each (as superuser, bypassing RLS)."""
    org_a, org_b = uuid.uuid4(), uuid.uuid4()
    with admin_engine.begin() as conn:
        for org, kind, name in ((org_a, "agency", "Org A"), (org_b, "direct", "Org B")):
            conn.execute(
                text("insert into organization (id, type, name) values (:id, :t, :n)"),
                {"id": org, "t": kind, "n": name},
            )
        conn.execute(
            text("insert into candidate (org_id, external_ref) values (:o, 'a-1')"), {"o": org_a}
        )
        conn.execute(
            text("insert into candidate (org_id, external_ref) values (:o, 'b-1')"), {"o": org_b}
        )
    yield org_a, org_b
    with admin_engine.begin() as conn:
        conn.execute(
            text("delete from candidate where org_id in (:a, :b)"), {"a": org_a, "b": org_b}
        )
        conn.execute(
            text("delete from organization where id in (:a, :b)"), {"a": org_a, "b": org_b}
        )


def _candidate_orgs(engine: Engine, org: uuid.UUID) -> list[uuid.UUID]:
    """Select candidate org_ids as manfriday_app with the tenant GUC set.

    Deliberately omits a ``WHERE org_id`` filter — RLS must do the filtering.
    """
    with engine.connect() as conn, conn.begin():
        conn.execute(text("select set_config('app.current_org', :v, true)"), {"v": str(org)})
        return list(conn.execute(text("select org_id from candidate")).scalars().all())


def test_rls_select_isolates_tenants(app_engine: Engine, two_orgs: OrgPair) -> None:
    org_a, org_b = two_orgs
    seen_a = _candidate_orgs(app_engine, org_a)
    seen_b = _candidate_orgs(app_engine, org_b)
    assert seen_a and all(o == org_a for o in seen_a)
    assert seen_b and all(o == org_b for o in seen_b)
    assert org_b not in seen_a
    assert org_a not in seen_b


def test_rls_denies_without_tenant_context(app_engine: Engine, two_orgs: OrgPair) -> None:
    # No set_config -> unset GUC -> deny-by-default (zero rows), not an error.
    with app_engine.connect() as conn, conn.begin():
        rows = conn.execute(text("select org_id from candidate")).scalars().all()
    assert list(rows) == []


def test_rls_with_check_blocks_cross_tenant_insert(app_engine: Engine, two_orgs: OrgPair) -> None:
    org_a, org_b = two_orgs
    # Scoped to A, attempt to write a B-owned row -> RLS WITH CHECK violation.
    with pytest.raises(ProgrammingError):  # noqa: PT012 (multi-stmt block is intentional)
        with app_engine.connect() as conn, conn.begin():
            conn.execute(text("select set_config('app.current_org', :v, true)"), {"v": str(org_a)})
            conn.execute(
                text("insert into candidate (org_id, external_ref) values (:o, 'evil')"),
                {"o": str(org_b)},
            )


@pytest.fixture
def anyio_backend() -> str:
    return "asyncio"


@pytest.mark.anyio
async def test_tenant_transaction_scopes_async_path(two_orgs: OrgPair) -> None:
    org_a, _ = two_orgs
    async with tenant_transaction(org_id=org_a) as session:
        result = await session.execute(text("select org_id from candidate"))
        rows = result.scalars().all()
    assert rows and all(o == org_a for o in rows)
