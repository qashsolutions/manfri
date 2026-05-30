"""Candidate + résumé endpoints (Phase 1) — the integrated product's data core.

All RLS-scoped to the verified org (invariant #3). PII lives only in the
envelope-encrypted ``candidate.pii_jsonb`` and is decrypted **only** in the
owning-org detail view (never in lists/matches/audience — redaction by
construction). Résumé upload reuses the egress-free ingestion pipeline (immutable
store + audit) then the deterministic parser (parsed_jsonb + parse_run, invariant
#2). Advisory review flags are data-quality only (invariant #8).
"""

from __future__ import annotations

import base64
import uuid
from datetime import UTC, datetime
from typing import Any

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import Claims, TenantSession
from app.api.schemas import (
    BulkResumeIn,
    BulkResumeOut,
    BulkResumeResult,
    CandidateCreate,
    CandidateDetail,
    CandidateSummary,
    ConsentEventIn,
    ContactInfo,
    ResumeInfo,
    ResumeUploadIn,
    ResumeUploadOut,
    ReviewFlagOut,
)
from app.audit import append_audit_event
from app.auth import scoped_transaction
from app.crypto import PiiUnrecoverableError, get_candidate_pii, get_key_provider, set_candidate_pii
from app.db.models import Candidate, ConsentLedger, Resume
from app.ingestion import IngestRejectedError, ingest_resume
from app.matching import review_flags
from app.parsing import parse_and_store
from app.storage import get_object_store

router = APIRouter(prefix="/candidates", tags=["candidates"])

_CONSENT_EVENTS = {"opted_in", "unsubscribed", "pending"}


def _flags_out(parsed: dict[str, object] | None) -> list[ReviewFlagOut]:
    return [
        ReviewFlagOut(code=f.code, severity=f.severity, message=f.message)
        for f in review_flags(parsed)
    ]


async def _current_parsed(session: AsyncSession) -> dict[uuid.UUID, dict[str, Any]]:
    """Map each candidate to its current résumé's parsed_jsonb (RLS-scoped to the org)."""
    rows = (
        await session.execute(
            select(Resume.candidate_id, Resume.parsed_jsonb).where(Resume.is_current.is_(True))
        )
    ).all()
    return {cid: (parsed or {}) for cid, parsed in rows}


@router.get("", response_model=list[CandidateSummary], operation_id="listCandidates")
async def list_candidates(session: TenantSession) -> list[CandidateSummary]:
    """List the org's candidates (redacted — capability + status, never raw PII)."""
    parsed_by = await _current_parsed(session)
    candidates = (
        (
            await session.execute(
                select(Candidate)
                .where(Candidate.deleted_at.is_(None))
                .order_by(Candidate.created_at.desc())
            )
        )
        .scalars()
        .all()
    )
    out: list[CandidateSummary] = []
    for c in candidates:
        parsed = parsed_by.get(c.id, {})
        skills = list(parsed.get("skills", [])) if parsed else []
        years = parsed.get("total_experience_years") if parsed else None
        out.append(
            CandidateSummary(
                id=str(c.id),
                external_ref=c.external_ref,
                status=c.status,
                consent_state=c.consent_state,
                skills=skills,
                experience_years=years,
                review_flag_count=len(_flags_out(parsed)),
                created_at=c.created_at,
            )
        )
    return out


@router.post(
    "",
    response_model=CandidateDetail,
    status_code=status.HTTP_201_CREATED,
    operation_id="createCandidate",
)
async def create_candidate(body: CandidateCreate, claims: Claims) -> CandidateDetail:
    """Create a candidate; PII (if any) is envelope-encrypted at rest (WP 0.7)."""
    if body.consent_state not in {"pending", "opted_in", "unsubscribed"}:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "invalid consent_state")
    kp = get_key_provider()
    async with scoped_transaction(claims) as session:
        candidate = Candidate(
            org_id=claims.org_uuid, external_ref=body.external_ref, consent_state=body.consent_state
        )
        session.add(candidate)
        await session.flush()
        if body.pii:
            await set_candidate_pii(
                session, kp, org_id=claims.org_uuid, candidate_id=candidate.id, pii=body.pii
            )
        await append_audit_event(
            session,
            org_id=claims.org_uuid,
            actor_type="user",
            actor_id=claims.user_uuid,
            action="candidate.created",
            entity_type="candidate",
            entity_id=candidate.id,
            after={"external_ref": body.external_ref, "has_pii": bool(body.pii)},
        )
        candidate_id = candidate.id
    return await _detail(claims, candidate_id)


@router.get("/{candidate_id}", response_model=CandidateDetail, operation_id="getCandidate")
async def get_candidate(candidate_id: str, claims: Claims) -> CandidateDetail:
    """Full detail for the owning org's recruiter (includes decrypted contact PII)."""
    return await _detail(claims, _as_uuid(candidate_id))


async def _detail(claims: Claims, candidate_id: uuid.UUID) -> CandidateDetail:
    kp = get_key_provider()
    async with scoped_transaction(claims) as session:
        candidate = (
            await session.execute(
                select(Candidate).where(
                    Candidate.id == candidate_id, Candidate.deleted_at.is_(None)
                )
            )
        ).scalar_one_or_none()
        if candidate is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "candidate not found")
        resumes = (
            (
                await session.execute(
                    select(Resume)
                    .where(Resume.candidate_id == candidate_id)
                    .order_by(Resume.version.desc())
                )
            )
            .scalars()
            .all()
        )
        try:
            pii = await get_candidate_pii(
                session, kp, org_id=claims.org_uuid, candidate_id=candidate_id
            )
        except PiiUnrecoverableError:
            pii = None
        current = next((r for r in resumes if r.is_current), None)
        parsed = (current.parsed_jsonb or {}) if current else {}

    contact = ContactInfo(
        name=(pii or {}).get("name"),
        email=(pii or {}).get("email"),
        phone=(pii or {}).get("phone"),
    )
    return CandidateDetail(
        id=str(candidate.id),
        external_ref=candidate.external_ref,
        status=candidate.status,
        consent_state=candidate.consent_state,
        consent_source=candidate.consent_source,
        created_at=candidate.created_at,
        contact=contact,
        skills=list(parsed.get("skills", [])),
        experience_years=parsed.get("total_experience_years"),
        resumes=[
            ResumeInfo(
                id=str(r.id),
                version=r.version,
                content_hash=r.content_hash,
                content_type=r.content_type,
                is_current=r.is_current,
                parsed=r.parsed_jsonb is not None,
                created_at=r.created_at,
            )
            for r in resumes
        ],
        review_flags=_flags_out(parsed),
    )


@router.post("/{candidate_id}/resumes", response_model=ResumeUploadOut, operation_id="uploadResume")
async def upload_resume(candidate_id: str, body: ResumeUploadIn, claims: Claims) -> ResumeUploadOut:
    """Upload + parse one résumé for an existing candidate (immutable store + provenance)."""
    cid = _as_uuid(candidate_id)
    await _assert_candidate_exists(claims, cid)
    store = get_object_store()
    try:
        content = base64.b64decode(body.content_b64)
    except (ValueError, TypeError) as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "invalid base64 content") from exc
    try:
        resume_id = await ingest_resume(
            store,
            org_id=claims.org_uuid,
            candidate_id=cid,
            content=content,
            content_type=body.content_type,
            filename=body.filename,
        )
    except IngestRejectedError as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, str(exc)) from exc
    run_id = await parse_and_store(store, org_id=claims.org_uuid, resume_id=resume_id)
    return ResumeUploadOut(
        candidate_id=str(cid), resume_id=str(resume_id), parse_run_id=str(run_id), parsed=True
    )


@router.post(
    "/bulk",
    response_model=BulkResumeOut,
    status_code=status.HTTP_201_CREATED,
    operation_id="bulkUploadResumes",
)
async def bulk_upload(body: BulkResumeIn, claims: Claims) -> BulkResumeOut:
    """Bulk import: one new candidate per résumé file, each ingested + parsed."""
    if not body.items:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "no items")
    store = get_object_store()
    results: list[BulkResumeResult] = []
    for item in body.items:
        try:
            content = base64.b64decode(item.content_b64)
        except (ValueError, TypeError) as exc:
            raise HTTPException(
                status.HTTP_422_UNPROCESSABLE_ENTITY, "invalid base64 content"
            ) from exc
        async with scoped_transaction(claims) as session:
            candidate = Candidate(org_id=claims.org_uuid, external_ref=item.external_ref)
            session.add(candidate)
            await session.flush()
            await append_audit_event(
                session,
                org_id=claims.org_uuid,
                actor_type="user",
                actor_id=claims.user_uuid,
                action="candidate.created",
                entity_type="candidate",
                entity_id=candidate.id,
                after={"external_ref": item.external_ref, "via": "bulk"},
            )
            candidate_id = candidate.id
        try:
            resume_id = await ingest_resume(
                store,
                org_id=claims.org_uuid,
                candidate_id=candidate_id,
                content=content,
                content_type=item.content_type,
                filename=item.filename,
            )
        except IngestRejectedError as exc:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, str(exc)) from exc
        run_id = await parse_and_store(store, org_id=claims.org_uuid, resume_id=resume_id)
        results.append(
            BulkResumeResult(
                candidate_id=str(candidate_id),
                resume_id=str(resume_id),
                parse_run_id=str(run_id),
                external_ref=item.external_ref,
                filename=item.filename,
            )
        )
    return BulkResumeOut(created=len(results), results=results)


@router.post(
    "/{candidate_id}/consent", response_model=CandidateDetail, operation_id="recordConsent"
)
async def record_consent(
    candidate_id: str, body: ConsentEventIn, claims: Claims
) -> CandidateDetail:
    """Record a consent event: append to the immutable ledger + update candidate state."""
    if body.event not in _CONSENT_EVENTS:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "invalid consent event")
    cid = _as_uuid(candidate_id)
    async with scoped_transaction(claims) as session:
        candidate = (
            await session.execute(
                select(Candidate).where(Candidate.id == cid, Candidate.deleted_at.is_(None))
            )
        ).scalar_one_or_none()
        if candidate is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "candidate not found")
        session.add(
            ConsentLedger(
                org_id=claims.org_uuid, candidate_id=cid, event=body.event, source=body.source
            )
        )
        candidate.consent_state = body.event
        candidate.consent_source = body.source
        candidate.consent_updated_at = datetime.now(tz=UTC)
        await append_audit_event(
            session,
            org_id=claims.org_uuid,
            actor_type="user",
            actor_id=claims.user_uuid,
            action="candidate.consent",
            entity_type="candidate",
            entity_id=cid,
            after={"event": body.event, "source": body.source},
        )
    return await _detail(claims, cid)


async def _assert_candidate_exists(claims: Claims, candidate_id: uuid.UUID) -> None:
    async with scoped_transaction(claims) as session:
        exists = (
            await session.execute(
                select(func.count())
                .select_from(Candidate)
                .where(Candidate.id == candidate_id, Candidate.deleted_at.is_(None))
            )
        ).scalar_one()
    if not exists:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "candidate not found")


def _as_uuid(value: str) -> uuid.UUID:
    try:
        return uuid.UUID(value)
    except ValueError as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "invalid id") from exc
