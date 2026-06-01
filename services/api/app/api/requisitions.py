"""Requisition + JD-skill + matching endpoints (Phase 1).

A requisition's weighted CORE/NICE skills are the **recruiter-confirmed rubric**:
``extract-skills`` only *suggests* from the JD text (advisory, never persisted),
and ``PUT /skills`` is where the recruiter confirms/reorders/reweights — that is the
single source of truth the matcher reads. Matching is transparent skill overlap
(invariant #6), advisory and ranking only; a human decides (invariant #1).
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import delete, func, select

from app.api.deps import Claims, TenantSession
from app.api.schemas import (
    ExtractedSkillsOut,
    JdCompletenessItemOut,
    JdCompletenessOut,
    JdSkillIn,
    JdSkillOut,
    JdSkillsReplace,
    MatchOut,
    RequisitionCreate,
    RequisitionMatchesOut,
    RequisitionOut,
)
from app.audit import append_audit_event
from app.auth import scoped_transaction
from app.db.models import Candidate, JdSkill, Requisition, Resume
from app.matching import jd_completeness, review_flags, score_candidate
from app.matching.score import MATCHER_VERSION
from app.parsing import find_skills

router = APIRouter(prefix="/requisitions", tags=["requisitions"])


async def _skill_counts(session: TenantSession, req_id: uuid.UUID) -> tuple[int, int]:
    rows = (
        await session.execute(
            select(JdSkill.tier, func.count())
            .where(JdSkill.requisition_id == req_id)
            .group_by(JdSkill.tier)
        )
    ).all()
    counts = {tier: n for tier, n in rows}
    return counts.get("core", 0), counts.get("nice", 0)


def _req_out(req: Requisition, core: int, nice: int) -> RequisitionOut:
    return RequisitionOut(
        id=str(req.id),
        title=req.title,
        location=req.location,
        employment_type=req.employment_type,
        openings=req.openings,
        status=req.status,
        has_jd_text=bool(req.jd_text),
        core_skill_count=core,
        nice_skill_count=nice,
        created_at=req.created_at,
    )


@router.get("", response_model=list[RequisitionOut], operation_id="listRequisitions")
async def list_requisitions(session: TenantSession) -> list[RequisitionOut]:
    """List the org's requisitions."""
    reqs = (
        (
            await session.execute(
                select(Requisition)
                .where(Requisition.deleted_at.is_(None))
                .order_by(Requisition.created_at.desc())
            )
        )
        .scalars()
        .all()
    )
    out: list[RequisitionOut] = []
    for req in reqs:
        core, nice = await _skill_counts(session, req.id)
        out.append(_req_out(req, core, nice))
    return out


@router.post(
    "",
    response_model=RequisitionOut,
    status_code=status.HTTP_201_CREATED,
    operation_id="createRequisition",
)
async def create_requisition(body: RequisitionCreate, claims: Claims) -> RequisitionOut:
    """Create a requisition (the JD intake)."""
    async with scoped_transaction(claims) as session:
        req = Requisition(
            org_id=claims.org_uuid,
            client_id=_opt_uuid(body.client_id),
            title=body.title,
            location=body.location,
            employment_type=body.employment_type,
            openings=body.openings,
            jd_text=body.jd_text,
        )
        session.add(req)
        await session.flush()
        await append_audit_event(
            session,
            org_id=claims.org_uuid,
            actor_type="user",
            actor_id=claims.user_uuid,
            action="requisition.created",
            entity_type="requisition",
            entity_id=req.id,
            after={"title": body.title},
        )
        return _req_out(req, 0, 0)


@router.get("/{requisition_id}", response_model=RequisitionOut, operation_id="getRequisition")
async def get_requisition(requisition_id: str, session: TenantSession) -> RequisitionOut:
    """Get one requisition."""
    req = await _load_req(session, _as_uuid(requisition_id))
    core, nice = await _skill_counts(session, req.id)
    return _req_out(req, core, nice)


@router.get("/{requisition_id}/skills", response_model=list[JdSkillOut], operation_id="getJdSkills")
async def get_jd_skills(requisition_id: str, session: TenantSession) -> list[JdSkillOut]:
    """List a requisition's weighted CORE/NICE skills (the confirmed rubric)."""
    req_id = _as_uuid(requisition_id)
    await _load_req(session, req_id)
    return await _skills_out(session, req_id)


@router.put(
    "/{requisition_id}/skills", response_model=list[JdSkillOut], operation_id="replaceJdSkills"
)
async def replace_jd_skills(
    requisition_id: str, body: JdSkillsReplace, claims: Claims
) -> list[JdSkillOut]:
    """Replace the full weighted skill list — the recruiter-confirmed scoring rubric."""
    req_id = _as_uuid(requisition_id)
    for skill in body.skills:
        if skill.tier not in {"core", "nice"}:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "tier must be core|nice")
    async with scoped_transaction(claims) as session:
        await _load_req(session, req_id)
        await session.execute(delete(JdSkill).where(JdSkill.requisition_id == req_id))
        for skill in body.skills:
            session.add(
                JdSkill(
                    org_id=claims.org_uuid,
                    requisition_id=req_id,
                    name=skill.name,
                    tier=skill.tier,
                    weight=skill.weight,
                    sort_order=skill.sort_order,
                )
            )
        await append_audit_event(
            session,
            org_id=claims.org_uuid,
            actor_type="user",
            actor_id=claims.user_uuid,
            action="requisition.skills_set",
            entity_type="requisition",
            entity_id=req_id,
            after={"count": len(body.skills)},
        )
        return await _skills_out(session, req_id)


@router.post(
    "/{requisition_id}/extract-skills",
    response_model=ExtractedSkillsOut,
    operation_id="extractJdSkills",
)
async def extract_jd_skills(requisition_id: str, session: TenantSession) -> ExtractedSkillsOut:
    """Suggest skills from the JD text (advisory only — NOT persisted until confirmed)."""
    req = await _load_req(session, _as_uuid(requisition_id))
    if not req.jd_text:
        return ExtractedSkillsOut(suggested=[])
    suggested = [
        JdSkillIn(name=name, tier="core", weight=1.0, sort_order=i)
        for i, name in enumerate(find_skills(req.jd_text))
    ]
    return ExtractedSkillsOut(suggested=suggested)


@router.get(
    "/{requisition_id}/completeness",
    response_model=JdCompletenessOut,
    operation_id="getJdCompleteness",
)
async def get_completeness(requisition_id: str, session: TenantSession) -> JdCompletenessOut:
    """Deterministic 0–100 rating of how fully the requisition is specified."""
    req_id = _as_uuid(requisition_id)
    req = await _load_req(session, req_id)
    core, nice = await _skill_counts(session, req_id)
    c = jd_completeness(
        title=req.title,
        location=req.location,
        employment_type=req.employment_type,
        jd_text=req.jd_text,
        core_skill_count=core,
        nice_skill_count=nice,
    )
    return JdCompletenessOut(
        score=c.score,
        items=[JdCompletenessItemOut(key=i.key, present=i.present, hint=i.hint) for i in c.items],
    )


@router.get(
    "/{requisition_id}/matches",
    response_model=RequisitionMatchesOut,
    operation_id="getRequisitionMatches",
)
async def get_matches(
    requisition_id: str,
    session: TenantSession,
    limit: int = Query(default=5, ge=1, le=100),
) -> RequisitionMatchesOut:
    """Rank the org's candidates against the requisition by transparent skill overlap."""
    req_id = _as_uuid(requisition_id)
    await _load_req(session, req_id)
    skills = (
        (
            await session.execute(
                select(JdSkill).where(JdSkill.requisition_id == req_id).order_by(JdSkill.sort_order)
            )
        )
        .scalars()
        .all()
    )
    jd = [(s.name, s.tier, float(s.weight)) for s in skills]

    rows = (
        await session.execute(
            select(Candidate.id, Candidate.external_ref, Resume.parsed_jsonb)
            .join(Resume, (Resume.candidate_id == Candidate.id) & Resume.is_current.is_(True))
            .where(Candidate.deleted_at.is_(None))
        )
    ).all()

    matches: list[MatchOut] = []
    for cand_id, external_ref, parsed in rows:
        parsed = parsed or {}
        breakdown = score_candidate(list(parsed.get("skills", [])), jd)
        matches.append(
            MatchOut(
                candidate_id=str(cand_id),
                external_ref=external_ref,
                fit=breakdown.fit,
                core_coverage=breakdown.core_coverage,
                nice_coverage=breakdown.nice_coverage,
                matched=breakdown.matched,
                missing_core=breakdown.missing_core,
                review_flag_count=len(review_flags(parsed)),
            )
        )
    # Deterministic ranking: fit desc, then candidate id for a stable tie-break.
    matches.sort(key=lambda m: (-m.fit, m.candidate_id))
    return RequisitionMatchesOut(
        requisition_id=str(req_id), matcher_version=MATCHER_VERSION, matches=matches[:limit]
    )


async def _load_req(session: TenantSession, req_id: uuid.UUID) -> Requisition:
    req = (
        await session.execute(
            select(Requisition).where(Requisition.id == req_id, Requisition.deleted_at.is_(None))
        )
    ).scalar_one_or_none()
    if req is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "requisition not found")
    return req


async def _skills_out(session: TenantSession, req_id: uuid.UUID) -> list[JdSkillOut]:
    skills = (
        (
            await session.execute(
                select(JdSkill).where(JdSkill.requisition_id == req_id).order_by(JdSkill.sort_order)
            )
        )
        .scalars()
        .all()
    )
    return [
        JdSkillOut(
            id=str(s.id), name=s.name, tier=s.tier, weight=float(s.weight), sort_order=s.sort_order
        )
        for s in skills
    ]


def _as_uuid(value: str) -> uuid.UUID:
    try:
        return uuid.UUID(value)
    except ValueError as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "invalid id") from exc


def _opt_uuid(value: str | None) -> uuid.UUID | None:
    return _as_uuid(value) if value else None
