"""Pydantic request/response models for the Phase 1 product API.

These are the BFF↔FastAPI contract surface; FastAPI emits them into the OpenAPI spec
(the single source of truth) and ``openapi-typescript`` turns them into the web
client's types. Responses for list/detail views are **redacted by construction** —
raw contact PII appears only in the candidate *detail* response, decrypted for the
owning org's recruiter (never in lists, matches, or audience).
"""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field

# ── Candidates ────────────────────────────────────────────────────────────────


class CandidateCreate(BaseModel):
    """Create a candidate. ``pii`` (name/email/phone/…) is envelope-encrypted at rest."""

    external_ref: str | None = None
    pii: dict[str, str] = Field(default_factory=dict)
    consent_state: str = "pending"


class ReviewFlagOut(BaseModel):
    """An advisory, data-quality flag (never auto-rejects; not fraud detection)."""

    code: str
    severity: str
    message: str


class CandidateSummary(BaseModel):
    """Redacted list/row view — no raw PII; capability + status only."""

    id: str
    external_ref: str | None
    status: str
    consent_state: str
    skills: list[str]
    experience_years: float | None
    review_flag_count: int
    created_at: datetime


class ContactInfo(BaseModel):
    """Decrypted contact PII — owning-org detail view only."""

    name: str | None = None
    email: str | None = None
    phone: str | None = None


class ResumeInfo(BaseModel):
    """One immutable résumé version."""

    id: str
    version: int
    content_hash: str
    content_type: str | None
    is_current: bool
    parsed: bool
    created_at: datetime


class CandidateDetail(BaseModel):
    """Full candidate view for the owning org's recruiter (includes decrypted contact)."""

    id: str
    external_ref: str | None
    status: str
    consent_state: str
    consent_source: str | None
    created_at: datetime
    contact: ContactInfo
    skills: list[str]
    experience_years: float | None
    resumes: list[ResumeInfo]
    review_flags: list[ReviewFlagOut]


class ConsentEventIn(BaseModel):
    """Record a consent event (append-only ledger + candidate state)."""

    event: str  # 'opted_in' | 'unsubscribed' | 'pending'
    source: str | None = None


class ResumeUploadIn(BaseModel):
    """Upload one résumé (base64 so no multipart dependency)."""

    filename: str | None = None
    content_type: str = "application/pdf"
    content_b64: str


class ResumeUploadOut(BaseModel):
    """Result of ingesting + parsing one résumé."""

    candidate_id: str
    resume_id: str
    parse_run_id: str
    parsed: bool


class BulkResumeItem(BaseModel):
    """One file in a bulk upload — creates a new candidate per file."""

    external_ref: str | None = None
    filename: str | None = None
    content_type: str = "application/pdf"
    content_b64: str


class BulkResumeIn(BaseModel):
    items: list[BulkResumeItem]


class BulkResumeResult(BaseModel):
    candidate_id: str
    resume_id: str
    parse_run_id: str
    external_ref: str | None
    filename: str | None


class BulkResumeOut(BaseModel):
    created: int
    results: list[BulkResumeResult]


# ── Requisitions & matching ───────────────────────────────────────────────────


class RequisitionCreate(BaseModel):
    title: str
    location: str | None = None
    employment_type: str | None = None
    openings: int = 1
    jd_text: str | None = None
    client_id: str | None = None


class RequisitionOut(BaseModel):
    id: str
    title: str
    location: str | None
    employment_type: str | None
    openings: int
    status: str
    has_jd_text: bool
    core_skill_count: int
    nice_skill_count: int
    created_at: datetime


class JdSkillIn(BaseModel):
    name: str
    tier: str  # 'core' | 'nice'
    weight: float = 1.0
    sort_order: int = 0


class JdSkillOut(BaseModel):
    id: str
    name: str
    tier: str
    weight: float
    sort_order: int


class JdSkillsReplace(BaseModel):
    """Replace a requisition's full weighted skill list (recruiter-confirmed rubric)."""

    skills: list[JdSkillIn]


class ExtractedSkillsOut(BaseModel):
    """Skills *suggested* from the JD text — NOT persisted until the recruiter confirms."""

    suggested: list[JdSkillIn]


class JdCompletenessItemOut(BaseModel):
    key: str
    present: bool
    hint: str


class JdCompletenessOut(BaseModel):
    score: int
    items: list[JdCompletenessItemOut]


class MatchOut(BaseModel):
    """One ranked candidate for a requisition — transparent skill-overlap fit."""

    candidate_id: str
    external_ref: str | None
    fit: int
    core_coverage: float
    nice_coverage: float
    matched: list[str]
    missing_core: list[str]
    review_flag_count: int


class RequisitionMatchesOut(BaseModel):
    requisition_id: str
    matcher_version: str
    matches: list[MatchOut]


# ── Proposals ─────────────────────────────────────────────────────────────────


class ProposalCreate(BaseModel):
    candidate_id: str
    requisition_id: str
    outcome: str = "proposed"
    reason: str | None = None


class ProposalOut(BaseModel):
    id: str
    candidate_id: str
    requisition_id: str
    requisition_title: str | None
    outcome: str
    reason: str | None
    decided_at: datetime | None
    created_at: datetime


# ── Outreach (read-only selection; send is gated) ─────────────────────────────


class AudienceMember(BaseModel):
    candidate_id: str
    external_ref: str | None
    consent_state: str
    fit: int | None


class AudienceOut(BaseModel):
    """Who is eligible for outreach: opted-in only (CAN-SPAM); excluded counts logged."""

    requisition_id: str | None
    eligible: int
    excluded_unsubscribed: int
    excluded_pending: int
    members: list[AudienceMember]


class OutreachStatsOut(BaseModel):
    total_candidates: int
    opted_in: int
    unsubscribed: int
    pending: int


# ── Dashboard & settings ──────────────────────────────────────────────────────


class DashboardStats(BaseModel):
    candidates: int
    requisitions: int
    open_requisitions: int
    proposals: int
    opted_in: int


class TeamMemberOut(BaseModel):
    id: str
    email: str
    status: str


class PlanOut(BaseModel):
    """Plan placeholder. Pricing + billing are owner/counsel-gated (⚖️) and not yet wired."""

    name: str
    price: str
    unit: str
    note: str
