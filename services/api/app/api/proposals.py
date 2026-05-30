"""Proposal endpoints (Phase 1) — track where/when a candidate was proposed + outcome.

Org-scoped (invariant #3): within an org this is the candidate's history across that
org's clients/requisitions — never across orgs. Recording an outcome (e.g. rejected,
with a reason) is a **human** action, audited; nothing here is automated triage.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import select

from app.api.deps import Claims, TenantSession
from app.api.schemas import ProposalCreate, ProposalOut
from app.audit import append_audit_event
from app.auth import scoped_transaction
from app.db.models import Candidate, Proposal, Requisition

router = APIRouter(prefix="/proposals", tags=["proposals"])

_OUTCOMES = {"proposed", "interviewing", "rejected", "hired"}


@router.get("", response_model=list[ProposalOut], operation_id="listProposals")
async def list_proposals(
    session: TenantSession,
    candidate_id: str | None = Query(default=None),
) -> list[ProposalOut]:
    """List proposals, optionally filtered to one candidate (their within-org history)."""
    stmt = (
        select(Proposal, Requisition.title)
        .join(Requisition, Requisition.id == Proposal.requisition_id, isouter=True)
        .order_by(Proposal.created_at.desc())
    )
    if candidate_id is not None:
        stmt = stmt.where(Proposal.candidate_id == _as_uuid(candidate_id))
    rows = (await session.execute(stmt)).all()
    return [
        ProposalOut(
            id=str(p.id),
            candidate_id=str(p.candidate_id),
            requisition_id=str(p.requisition_id),
            requisition_title=title,
            outcome=p.outcome,
            reason=p.reason,
            decided_at=p.decided_at,
            created_at=p.created_at,
        )
        for p, title in rows
    ]


@router.post(
    "",
    response_model=ProposalOut,
    status_code=status.HTTP_201_CREATED,
    operation_id="createProposal",
)
async def create_proposal(body: ProposalCreate, claims: Claims) -> ProposalOut:
    """Record that a candidate was proposed to a requisition (human action, audited)."""
    if body.outcome not in _OUTCOMES:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "invalid outcome")
    cand_id, req_id = _as_uuid(body.candidate_id), _as_uuid(body.requisition_id)
    decided = body.outcome != "proposed"
    async with scoped_transaction(claims) as session:
        cand_exists = (
            await session.execute(select(Candidate.id).where(Candidate.id == cand_id))
        ).scalar_one_or_none()
        if cand_exists is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "candidate not found")
        req_exists = (
            await session.execute(select(Requisition.id).where(Requisition.id == req_id))
        ).scalar_one_or_none()
        if req_exists is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "requisition not found")
        proposal = Proposal(
            org_id=claims.org_uuid,
            candidate_id=cand_id,
            requisition_id=req_id,
            outcome=body.outcome,
            reason=body.reason,
            decided_by=claims.user_uuid if decided else None,
            decided_at=datetime.now(tz=UTC) if decided else None,
        )
        session.add(proposal)
        await session.flush()
        await append_audit_event(
            session,
            org_id=claims.org_uuid,
            actor_type="user",
            actor_id=claims.user_uuid,
            action="proposal.created",
            entity_type="proposal",
            entity_id=proposal.id,
            after={"outcome": body.outcome, "candidate_id": str(cand_id)},
        )
        # decided_at is a server default expr until refreshed; reload for the response.
        await session.refresh(proposal)
        title = (
            await session.execute(select(Requisition.title).where(Requisition.id == req_id))
        ).scalar_one_or_none()
        return ProposalOut(
            id=str(proposal.id),
            candidate_id=str(cand_id),
            requisition_id=str(req_id),
            requisition_title=title,
            outcome=proposal.outcome,
            reason=proposal.reason,
            decided_at=proposal.decided_at,
            created_at=proposal.created_at,
        )


def _as_uuid(value: str) -> uuid.UUID:
    try:
        return uuid.UUID(value)
    except ValueError as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "invalid id") from exc
