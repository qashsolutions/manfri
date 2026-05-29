"""Phase 1 — RLS isolation for the shared candidate pool (invariant #3).

The shared pool links the same person across orgs via a GLOBAL, no-PII
``candidate_identity`` row, while each org keeps its OWN org-scoped ``candidate``
row. These tests prove the identity link does NOT become a cross-tenant read
path: org B, scoped by RLS, must never see org A's candidate / requisition /
proposal rows even when the two orgs share a candidate identity.

They run as the non-BYPASSRLS ``manfriday_app`` role through the same
``SET LOCAL`` GUC mechanism the app uses, and skip cleanly when no migrated
database is reachable.
"""

from __future__ import annotations

import uuid
from collections.abc import Iterator

import pytest
from sqlalchemy import Engine, text


def _set_org(conn: object, org_id: uuid.UUID) -> None:
    """Set the tenant GUC on a connection (transaction-local)."""
    conn.execute(  # type: ignore[attr-defined]
        text("select set_config('app.current_org', :v, true)"), {"v": str(org_id)}
    )


@pytest.fixture
def shared_pool(admin_engine: Engine) -> Iterator[dict[str, uuid.UUID]]:
    """One shared identity; a candidate row in each of two orgs; a requisition +
    proposal in org A only. Seeded as superuser (BYPASSRLS)."""
    org_a = uuid.uuid4()
    org_b = uuid.uuid4()
    identity = uuid.uuid4()
    cand_a = uuid.uuid4()
    cand_b = uuid.uuid4()
    req_a = uuid.uuid4()
    prop_a = uuid.uuid4()

    with admin_engine.begin() as conn:
        for org in (org_a, org_b):
            conn.execute(
                text("insert into organization (id, type, name) values (:id, 'agency', :n)"),
                {"id": str(org), "n": f"Org {org}"},
            )
        # One global identity links the same person across both orgs.
        conn.execute(
            text("insert into candidate_identity (id, email_hash) values (:id, :h)"),
            {"id": str(identity), "h": uuid.uuid4().hex},
        )
        # Each org has its OWN candidate row, both pointing at the shared identity.
        for cand, org in ((cand_a, org_a), (cand_b, org_b)):
            conn.execute(
                text(
                    "insert into candidate (id, org_id, identity_id, redaction_status) "
                    "values (:id, :org, :ident, 'pending')"
                ),
                {"id": str(cand), "org": str(org), "ident": str(identity)},
            )
        # A requisition and a proposal exist only in org A.
        conn.execute(
            text(
                "insert into requisition (id, org_id, title) values (:id, :org, 'Backend Eng')"
            ),
            {"id": str(req_a), "org": str(org_a)},
        )
        conn.execute(
            text(
                "insert into proposal (id, org_id, candidate_id, requisition_id, outcome) "
                "values (:id, :org, :cand, :req, 'proposed')"
            ),
            {"id": str(prop_a), "org": str(org_a), "cand": str(cand_a), "req": str(req_a)},
        )

    yield {
        "org_a": org_a,
        "org_b": org_b,
        "identity": identity,
        "cand_a": cand_a,
        "cand_b": cand_b,
        "req_a": req_a,
    }


def test_org_b_cannot_read_org_a_candidate_despite_shared_identity(
    shared_pool: dict[str, uuid.UUID], app_engine: Engine
) -> None:
    """Sharing an identity must not let org B read org A's candidate row."""
    with app_engine.connect() as conn:
        _set_org(conn, shared_pool["org_b"])
        rows = conn.execute(text("select id, org_id from candidate")).fetchall()
        assert rows, "org B should see its own candidate row"
        assert all(r[1] == shared_pool["org_b"] for r in rows), "RLS leaked another org's candidate"
        assert all(r[0] != shared_pool["cand_a"] for r in rows), "org A's candidate leaked to org B"


def test_org_b_cannot_read_org_a_requisition(
    shared_pool: dict[str, uuid.UUID], app_engine: Engine
) -> None:
    """Requisitions are org-scoped: org B sees none of org A's."""
    with app_engine.connect() as conn:
        _set_org(conn, shared_pool["org_b"])
        rows = conn.execute(text("select org_id from requisition")).fetchall()
        assert not rows, "org B must not see org A's requisition"


def test_org_b_cannot_read_org_a_proposal(
    shared_pool: dict[str, uuid.UUID], app_engine: Engine
) -> None:
    """Proposals are org-scoped: a person's history never leaks across orgs by default."""
    with app_engine.connect() as conn:
        _set_org(conn, shared_pool["org_b"])
        rows = conn.execute(text("select org_id from proposal")).fetchall()
        assert not rows, "org B must not see org A's proposal"


def test_identity_is_globally_visible_but_carries_no_pii(
    shared_pool: dict[str, uuid.UUID], app_engine: Engine
) -> None:
    """candidate_identity is a global lookup (no RLS) — readable, but holds only an
    opaque hash, so it is not a cross-tenant PII path."""
    with app_engine.connect() as conn:
        _set_org(conn, shared_pool["org_b"])
        cols = conn.execute(
            text(
                "select column_name from information_schema.columns "
                "where table_name = 'candidate_identity'"
            )
        ).fetchall()
        names = {c[0] for c in cols}
        # Only an opaque hash + bookkeeping — never name/email/phone.
        assert names == {"id", "email_hash", "created_at"}, names


def test_org_a_proposal_join_to_requisition_stays_in_scope(
    shared_pool: dict[str, uuid.UUID], app_engine: Engine
) -> None:
    """Org A sees its own proposal joined to its own requisition (sanity: scope works
    both ways, not just deny)."""
    with app_engine.connect() as conn:
        _set_org(conn, shared_pool["org_a"])
        rows = conn.execute(
            text(
                "select p.id from proposal p "
                "join requisition r on r.id = p.requisition_id"
            )
        ).fetchall()
        assert len(rows) == 1, "org A should see exactly its own proposal↔requisition join"
