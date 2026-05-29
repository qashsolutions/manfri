"""Append-only hash-chained audit tests (WP 0.5) — invariant #5.

Fixtures live in conftest.py; skip without a migrated DB.
"""

from __future__ import annotations

import uuid

import pytest
from sqlalchemy import Engine, text
from sqlalchemy.exc import ProgrammingError

from app.audit import append_audit_event, verify_audit_chain
from app.db.session import tenant_transaction

Seed = dict[str, uuid.UUID]


@pytest.mark.anyio
async def test_audit_chain_appends_and_verifies(seed: Seed) -> None:
    org = seed["org_a"]
    async with tenant_transaction(org_id=org) as session:
        await append_audit_event(session, org_id=org, action="resume.uploaded", after={"v": 1})
        await append_audit_event(
            session, org_id=org, action="triage.suggested", after={"state": "AMBER"}
        )
        await append_audit_event(
            session,
            org_id=org,
            action="triage.set",
            before={"state": "AMBER"},
            after={"state": "GREEN"},
        )
    async with tenant_transaction(org_id=org) as session:
        results = await verify_audit_chain(session, org_id=org)
    assert results == [(org, True, None)]


@pytest.mark.anyio
async def test_audit_chain_detects_tampering(seed: Seed, admin_engine: Engine) -> None:
    org = seed["org_a"]
    async with tenant_transaction(org_id=org) as session:
        await append_audit_event(session, org_id=org, action="a", after={"n": 1})
        await append_audit_event(session, org_id=org, action="b", after={"n": 2})

    # Break-glass tamper: a superuser edits a row (the app role cannot — see below).
    with admin_engine.begin() as conn:
        conn.execute(
            text(
                "update audit_event set after_jsonb = '{\"n\": 999}' where org_id = :o "
                "and action = 'a'"
            ),
            {"o": org},
        )

    async with tenant_transaction(org_id=org) as session:
        results = await verify_audit_chain(session, org_id=org)
    assert results[0].ok is False
    assert results[0].broken_at_seq is not None


def test_audit_event_is_append_only_for_app_role(app_engine: Engine, seed: Seed) -> None:
    # manfriday_app has SELECT + INSERT but NOT UPDATE on audit_event -> permission denied.
    org = seed["org_a"]
    with pytest.raises(ProgrammingError):  # noqa: PT012 (multi-stmt block is intentional)
        with app_engine.connect() as conn, conn.begin():
            conn.execute(text("select set_config('app.current_org', :v, true)"), {"v": str(org)})
            conn.execute(
                text("update audit_event set action = 'x' where org_id = :o"), {"o": str(org)}
            )
