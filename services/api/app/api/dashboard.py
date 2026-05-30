"""Dashboard + settings read endpoints (Phase 1).

All RLS-scoped (invariant #3). ``/plan`` is a placeholder: pricing + billing are
owner/counsel-gated (⚖️) and not yet wired, so it returns a labelled stand-in.
"""

from __future__ import annotations

from fastapi import APIRouter
from sqlalchemy import func, select

from app.api.deps import TenantSession
from app.api.schemas import DashboardStats, PlanOut, TeamMemberOut
from app.db.models import AppUser, Candidate, Proposal, Requisition

router = APIRouter(tags=["dashboard"])


@router.get("/dashboard/stats", response_model=DashboardStats, operation_id="getDashboardStats")
async def dashboard_stats(session: TenantSession) -> DashboardStats:
    """Headline counts for the org's dashboard."""
    candidates = (
        await session.execute(
            select(func.count()).select_from(Candidate).where(Candidate.deleted_at.is_(None))
        )
    ).scalar_one()
    requisitions = (
        await session.execute(
            select(func.count()).select_from(Requisition).where(Requisition.deleted_at.is_(None))
        )
    ).scalar_one()
    open_reqs = (
        await session.execute(
            select(func.count())
            .select_from(Requisition)
            .where(Requisition.deleted_at.is_(None), Requisition.status == "open")
        )
    ).scalar_one()
    proposals = (await session.execute(select(func.count()).select_from(Proposal))).scalar_one()
    opted_in = (
        await session.execute(
            select(func.count())
            .select_from(Candidate)
            .where(Candidate.deleted_at.is_(None), Candidate.consent_state == "opted_in")
        )
    ).scalar_one()
    return DashboardStats(
        candidates=candidates,
        requisitions=requisitions,
        open_requisitions=open_reqs,
        proposals=proposals,
        opted_in=opted_in,
    )


@router.get("/team", response_model=list[TeamMemberOut], operation_id="listTeamMembers")
async def list_team(session: TenantSession) -> list[TeamMemberOut]:
    """List the org's users (the Settings → Team view)."""
    users = (
        (
            await session.execute(
                select(AppUser).where(AppUser.deleted_at.is_(None)).order_by(AppUser.created_at)
            )
        )
        .scalars()
        .all()
    )
    return [TeamMemberOut(id=str(u.id), email=u.email, status=u.status) for u in users]


@router.get("/plan", response_model=PlanOut, operation_id="getPlan")
async def get_plan(session: TenantSession) -> PlanOut:
    """Plan placeholder (pricing/billing are owner/counsel-gated and not yet wired)."""
    del session  # auth-scoped; no plan rows exist yet
    return PlanOut(
        name="Team",
        price="$29",
        unit="/user/mo",
        note="Placeholder pricing — billing not yet enabled (owner-gated).",
    )
