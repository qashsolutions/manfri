"""Cross-tenant isolation tests for the WP 0.2 RLS spine.

Fixtures (``seed``, ``app_engine``, ``anyio_backend``) live in ``conftest.py`` and
skip cleanly without a migrated database.
"""

from __future__ import annotations

import uuid

import pytest
from sqlalchemy import Engine, text
from sqlalchemy.exc import ProgrammingError

from app.db.session import tenant_transaction

Seed = dict[str, uuid.UUID]


def _candidate_orgs(engine: Engine, org: uuid.UUID) -> list[uuid.UUID]:
    """Select candidate org_ids as manfriday_app with the tenant GUC set.

    Deliberately omits a ``WHERE org_id`` filter — RLS must do the filtering.
    """
    with engine.connect() as conn, conn.begin():
        conn.execute(text("select set_config('app.current_org', :v, true)"), {"v": str(org)})
        return list(conn.execute(text("select org_id from candidate")).scalars().all())


def test_rls_select_isolates_tenants(app_engine: Engine, seed: Seed) -> None:
    seen_a = _candidate_orgs(app_engine, seed["org_a"])
    seen_b = _candidate_orgs(app_engine, seed["org_b"])
    assert seen_a and all(o == seed["org_a"] for o in seen_a)
    assert seen_b and all(o == seed["org_b"] for o in seen_b)
    assert seed["org_b"] not in seen_a
    assert seed["org_a"] not in seen_b


def test_rls_denies_without_tenant_context(app_engine: Engine, seed: Seed) -> None:
    # No set_config -> unset GUC -> deny-by-default (zero rows), not an error.
    with app_engine.connect() as conn, conn.begin():
        rows = conn.execute(text("select org_id from candidate")).scalars().all()
    assert list(rows) == []


def test_rls_with_check_blocks_cross_tenant_insert(app_engine: Engine, seed: Seed) -> None:
    # Scoped to A, attempt to write a B-owned row -> RLS WITH CHECK violation.
    with pytest.raises(ProgrammingError):  # noqa: PT012 (multi-stmt block is intentional)
        with app_engine.connect() as conn, conn.begin():
            conn.execute(
                text("select set_config('app.current_org', :v, true)"), {"v": str(seed["org_a"])}
            )
            conn.execute(
                text("insert into candidate (org_id, external_ref) values (:o, 'evil')"),
                {"o": str(seed["org_b"])},
            )


@pytest.mark.anyio
async def test_tenant_transaction_scopes_async_path(seed: Seed) -> None:
    async with tenant_transaction(org_id=seed["org_a"]) as session:
        result = await session.execute(text("select org_id from candidate"))
        rows = result.scalars().all()
    assert rows and all(o == seed["org_a"] for o in rows)
