"""Cross-tenant leak probe — the Phase 0 de-risking spike (WP 0.3).

Proves RLS isolation holds across every path an AI/agent or a forgotten ``WHERE``
could leak another tenant's rows:

  1. plain SQL          — SELECT with no org filter returns only the current tenant.
  2. pgvector KNN       — ANN over the shared embedding table is RLS-filtered.
  3. worker code path   — a job scoped from its immutable org_id claim cannot read others.
  4. PgBouncer pooling  — SET LOCAL context never bleeds across pooled transactions.

Fixtures live in ``conftest.py``; all tests skip without a migrated DB, and the
PgBouncer test self-skips when pgbouncer is not running on :6432. (The provenance
bare-insert path of the probe arrives with the ``score`` table in WP 0.4.)
"""

from __future__ import annotations

import os
import uuid

import psycopg
import pytest
from sqlalchemy import Engine, text

from app.db.session import tenant_transaction

Seed = dict[str, uuid.UUID]

PGBOUNCER_DSN = os.environ.get(
    "PGBOUNCER_DSN", "host=127.0.0.1 port=6432 dbname=manfriday_dev user=manfriday_app"
)


def _query_vector() -> str:
    """Org A's exact embedding — a leak would surface A's row first by cosine distance."""
    return "[" + ",".join("1" if i == 0 else "0" for i in range(1024)) + "]"


def test_leak_probe_sql_path(app_engine: Engine, seed: Seed) -> None:
    # As Org B, omit any org filter; RLS must filter candidate AND embedding.
    with app_engine.connect() as conn, conn.begin():
        conn.execute(
            text("select set_config('app.current_org', :v, true)"), {"v": str(seed["org_b"])}
        )
        cand = list(conn.execute(text("select org_id from candidate")).scalars().all())
        emb = list(conn.execute(text("select org_id from embedding")).scalars().all())
    assert cand and all(o == seed["org_b"] for o in cand)
    assert emb and all(o == seed["org_b"] for o in emb)
    assert seed["org_a"] not in cand
    assert seed["org_a"] not in emb


def test_leak_probe_pgvector_knn(app_engine: Engine, seed: Seed) -> None:
    # KNN with NO org_id predicate, querying with Org A's vector. RLS must still
    # exclude A's (otherwise-closest) row when scoped to Org B.
    with app_engine.connect() as conn, conn.begin():
        conn.execute(
            text("select set_config('app.current_org', :v, true)"), {"v": str(seed["org_b"])}
        )
        rows = list(
            conn.execute(
                text("select org_id from embedding order by vector <=> (:q)::vector limit 10"),
                {"q": _query_vector()},
            )
            .scalars()
            .all()
        )
    assert rows and all(o == seed["org_b"] for o in rows)
    assert seed["org_a"] not in rows


@pytest.mark.anyio
async def test_leak_probe_worker_path(seed: Seed) -> None:
    # Mimics the WP 0.11 worker: tenant scope derives from the job's immutable
    # org_id claim. A B-scoped job cannot read Org A — not even A's known id.
    job = {"org_id": str(seed["org_b"])}
    async with tenant_transaction(org_id=uuid.UUID(job["org_id"])) as session:
        targeted = await session.execute(
            text("select org_id from candidate where id = :id"), {"id": seed["cand_a"]}
        )
        visible = await session.execute(text("select org_id from candidate"))
    assert list(targeted.scalars().all()) == []
    visible_orgs = list(visible.scalars().all())
    assert visible_orgs and all(o == seed["org_b"] for o in visible_orgs)


def _pgbouncer_reachable() -> bool:
    try:
        with psycopg.connect(PGBOUNCER_DSN, connect_timeout=2) as conn:
            conn.execute("select 1")
    except Exception:  # noqa: BLE001 (probe guard: any failure means "not available")
        return False
    return True


@pytest.mark.skipif(not _pgbouncer_reachable(), reason="pgbouncer not running on :6432")
def test_leak_probe_pgbouncer_pooling(seed: Seed) -> None:
    # Transaction pooling (default_pool_size=1) multiplexes both client connections
    # onto ONE server connection. Tx1 sets Org A locally and reads A; Tx2 sets no
    # context and must see NOTHING — proving SET LOCAL was cleared at COMMIT and did
    # not bleed onto the reused server connection.
    with psycopg.connect(PGBOUNCER_DSN) as c1, c1.transaction():
        c1.execute("select set_config('app.current_org', %s, true)", (str(seed["org_a"]),))
        seen = c1.execute("select org_id from candidate").fetchall()
    assert seen and all(row[0] == seed["org_a"] for row in seen)

    with psycopg.connect(PGBOUNCER_DSN) as c2, c2.transaction():
        leaked = c2.execute("select org_id from candidate").fetchall()
    assert leaked == []
