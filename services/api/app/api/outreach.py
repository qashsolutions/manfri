"""Outreach selection endpoints (Phase 1) — read-only audience + stats.

The actual email send is **deliberately not implemented here**: CAN-SPAM mechanics
(unsubscribe + sender ID), the email provider (ZDR/DPA for candidate data), and the
outreach adverse-impact policy are owner/counsel-gated (⚖️). This module only
computes *who would be contacted*, enforcing consent: only ``opted_in`` candidates
are eligible, and the excluded counts are returned so the gap is visible (logged,
not silently dropped). Who gets emailed for a req is selection-adjacent — a later
adverse-impact monitor will watch it.
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import func, select

from app.api.deps import TenantSession
from app.api.schemas import AudienceMember, AudienceOut, OutreachStatsOut
from app.db.models import Candidate, JdSkill, Resume
from app.matching import score_candidate

router = APIRouter(prefix="/outreach", tags=["outreach"])


@router.get("/stats", response_model=OutreachStatsOut, operation_id="getOutreachStats")
async def outreach_stats(session: TenantSession) -> OutreachStatsOut:
    """Consent breakdown across the org's candidates."""
    rows = (
        await session.execute(
            select(Candidate.consent_state, func.count())
            .where(Candidate.deleted_at.is_(None))
            .group_by(Candidate.consent_state)
        )
    ).all()
    counts = {state: n for state, n in rows}
    return OutreachStatsOut(
        total_candidates=sum(counts.values()),
        opted_in=counts.get("opted_in", 0),
        unsubscribed=counts.get("unsubscribed", 0),
        pending=counts.get("pending", 0),
    )


@router.get("/audience", response_model=AudienceOut, operation_id="getAudience")
async def get_audience(
    session: TenantSession,
    requisition_id: str | None = Query(default=None),
    min_fit: int = Query(default=1, ge=0, le=100),
) -> AudienceOut:
    """Who is eligible for outreach: opted-in candidates, optionally fitting a requisition.

    Without ``requisition_id`` it's every opted-in candidate. With one, only those whose
    transparent skill-overlap fit ≥ ``min_fit``. Excluded (unsubscribed / pending) are
    counted, never silently dropped (CAN-SPAM consent).
    """
    jd: list[tuple[str, str, float]] = []
    if requisition_id is not None:
        req_id = _as_uuid(requisition_id)
        skills = (
            (await session.execute(select(JdSkill).where(JdSkill.requisition_id == req_id)))
            .scalars()
            .all()
        )
        if not skills:
            raise HTTPException(
                status.HTTP_422_UNPROCESSABLE_ENTITY, "requisition has no confirmed skills"
            )
        jd = [(s.name, s.tier, float(s.weight)) for s in skills]

    rows = (
        await session.execute(
            select(
                Candidate.id, Candidate.external_ref, Candidate.consent_state, Resume.parsed_jsonb
            )
            .join(
                Resume,
                (Resume.candidate_id == Candidate.id) & Resume.is_current.is_(True),
                isouter=True,
            )
            .where(Candidate.deleted_at.is_(None))
        )
    ).all()

    members: list[AudienceMember] = []
    eligible = excluded_unsub = excluded_pending = 0
    for cand_id, external_ref, consent_state, parsed in rows:
        fit: int | None = None
        if jd:
            breakdown = score_candidate(list((parsed or {}).get("skills", [])), jd)
            if breakdown.fit < min_fit:
                continue
            fit = breakdown.fit
        if consent_state == "opted_in":
            eligible += 1
            members.append(
                AudienceMember(
                    candidate_id=str(cand_id),
                    external_ref=external_ref,
                    consent_state=consent_state,
                    fit=fit,
                )
            )
        elif consent_state == "unsubscribed":
            excluded_unsub += 1
        else:
            excluded_pending += 1

    members.sort(key=lambda m: (-(m.fit or 0), m.candidate_id))
    return AudienceOut(
        requisition_id=requisition_id,
        eligible=eligible,
        excluded_unsubscribed=excluded_unsub,
        excluded_pending=excluded_pending,
        members=members,
    )


def _as_uuid(value: str) -> uuid.UUID:
    try:
        return uuid.UUID(value)
    except ValueError as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "invalid id") from exc
