"""Provenance enforcement tests (WP 0.4) — invariant #2.

The bare-insert-rejection is leak-probe path 5: a ``score`` row with no
``scoring_run_id`` is rejected by the NOT-NULL FK. Plus a round-trip through the
provenance helpers. Fixtures live in ``conftest.py``; skips without a migrated DB.
"""

from __future__ import annotations

import uuid
from decimal import Decimal

import pytest
from sqlalchemy import Engine, text
from sqlalchemy.exc import IntegrityError

from app.db.session import tenant_transaction
from app.provenance import add_score, create_scoring_run

Seed = dict[str, uuid.UUID]


def test_bare_score_insert_without_run_id_is_rejected(app_engine: Engine, seed: Seed) -> None:
    # Valid tenant context, but no scoring_run_id -> NOT NULL FK violation (invariant #2).
    with pytest.raises(IntegrityError):  # noqa: PT012 (multi-stmt block is intentional)
        with app_engine.connect() as conn, conn.begin():
            conn.execute(
                text("select set_config('app.current_org', :v, true)"), {"v": str(seed["org_a"])}
            )
            conn.execute(
                text(
                    "insert into score (org_id, parameter, value, \"max\") values (:o, 'x', 1, 1)"
                ),
                {"o": str(seed["org_a"])},
            )


@pytest.mark.anyio
async def test_provenance_roundtrip(seed: Seed) -> None:
    # The helper path: create a scoring_run, then a score that references it.
    async with tenant_transaction(org_id=seed["org_a"]) as session:
        run_id = await create_scoring_run(
            session,
            org_id=seed["org_a"],
            model_id="claude-test",
            prompt_version="score/v1",
            input_snapshot_hash="deadbeef",
            weight_set={"core_skill_coverage": 0.7},
        )
        score_id = await add_score(
            session,
            org_id=seed["org_a"],
            scoring_run_id=run_id,
            parameter="core_skill_coverage",
            value=Decimal("0.80"),
            max_value=Decimal("1.00"),
            rationale_text="3 of 4 core skills evidenced",
        )

    async with tenant_transaction(org_id=seed["org_a"]) as session:
        linked = await session.execute(
            text("select scoring_run_id from score where id = :id"), {"id": score_id}
        )
        assert list(linked.scalars().all()) == [run_id]
