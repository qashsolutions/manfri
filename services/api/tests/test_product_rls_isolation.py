"""Phase 1 — RLS isolation for the product tables (invariant #3).

Candidates are strictly org-isolated: org A and org B may each independently hold
the same person's résumé (from different sources), but neither ever sees the
other's data. These tests prove org B, scoped by RLS, sees none of org A's
candidate / requisition / proposal rows even when both orgs store the same person.

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
def two_orgs(admin_engine: Engine) -> Iterator[dict[str, uuid.UUID]]:
    """Two orgs that each independently store the SAME person (same external_ref),
    plus a requisition + proposal in org A only. Seeded as superuser (BYPASSRLS)."""
    org_a = uuid.uuid4()
    org_b = uuid.uuid4()
    cand_a = uuid.uuid4()
    cand_b = uuid.uuid4()
    req_a = uuid.uuid4()
    prop_a = uuid.uuid4()
    shared_ref = "jane.doe@example.test"  # same person, sourced independently

    with admin_engine.begin() as conn:
        for org in (org_a, org_b):
            conn.execute(
                text("insert into organization (id, type, name) values (:id, 'agency', :n)"),
                {"id": str(org), "n": f"Org {org}"},
            )
        # Each org has its OWN candidate row for the same person — no shared record.
        for cand, org in ((cand_a, org_a), (cand_b, org_b)):
            conn.execute(
                text(
                    "insert into candidate (id, org_id, external_ref, redaction_status) "
                    "values (:id, :org, :ref, 'pending')"
                ),
                {"id": str(cand), "org": str(org), "ref": shared_ref},
            )
        # A requisition and a proposal exist only in org A.
        conn.execute(
            text("insert into requisition (id, org_id, title) values (:id, :org, 'Backend Eng')"),
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
        "cand_a": cand_a,
        "cand_b": cand_b,
        "req_a": req_a,
    }


def test_org_b_cannot_read_org_a_candidate_for_same_person(
    two_orgs: dict[str, uuid.UUID], app_engine: Engine
) -> None:
    """Both orgs hold the same person, but org B sees only its own candidate row."""
    with app_engine.connect() as conn:
        _set_org(conn, two_orgs["org_b"])
        rows = conn.execute(text("select id, org_id from candidate")).fetchall()
        assert rows, "org B should see its own candidate row"
        assert all(r[1] == two_orgs["org_b"] for r in rows), "RLS leaked another org's candidate"
        assert all(r[0] != two_orgs["cand_a"] for r in rows), "org A's candidate leaked to org B"


def test_org_b_cannot_read_org_a_requisition(
    two_orgs: dict[str, uuid.UUID], app_engine: Engine
) -> None:
    """Requisitions are org-scoped: org B sees none of org A's."""
    with app_engine.connect() as conn:
        _set_org(conn, two_orgs["org_b"])
        rows = conn.execute(text("select org_id from requisition")).fetchall()
        assert not rows, "org B must not see org A's requisition"


def test_org_b_cannot_read_org_a_proposal(
    two_orgs: dict[str, uuid.UUID], app_engine: Engine
) -> None:
    """Proposals are org-scoped: a person's history never leaks across orgs."""
    with app_engine.connect() as conn:
        _set_org(conn, two_orgs["org_b"])
        rows = conn.execute(text("select org_id from proposal")).fetchall()
        assert not rows, "org B must not see org A's proposal"


def test_org_a_proposal_join_to_requisition_stays_in_scope(
    two_orgs: dict[str, uuid.UUID], app_engine: Engine
) -> None:
    """Org A sees its own proposal joined to its own requisition (within-org history
    across that org's clients/reqs — sanity that scope works both ways, not just deny)."""
    with app_engine.connect() as conn:
        _set_org(conn, two_orgs["org_a"])
        rows = conn.execute(
            text("select p.id from proposal p join requisition r on r.id = p.requisition_id")
        ).fetchall()
        assert len(rows) == 1, "org A should see exactly its own proposal↔requisition join"
