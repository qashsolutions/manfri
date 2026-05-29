"""ORM models for the Phase 0 tenancy & RLS spine (WP 0.2) and provenance spine (WP 0.4).

Every tenant-scoped table carries ``org_id`` and is governed by Row-Level
Security (invariant #3). ``role`` is intentionally a global lookup (same taxonomy
for all tenants), so it carries no ``org_id`` and no RLS policy.

``candidate`` and ``embedding`` are minimal shells here — just enough to
establish the RLS + pgvector pattern and feed the WP 0.3 leak probe. Their full
column sets and PII envelope encryption land in WP 0.6 / 0.7.

The run tables + tall ``score`` enforce invariant #2: ``score.scoring_run_id`` is
NOT NULL, so no AI score can be persisted without its provenance.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal
from typing import Any

from pgvector.sqlalchemy import Vector
from sqlalchemy import (
    BigInteger,
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Identity,
    Index,
    Integer,
    LargeBinary,
    Numeric,
    Text,
    UniqueConstraint,
    text,
)
from sqlalchemy.dialects.postgresql import CITEXT, JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base

EMBEDDING_DIM = 1024


class Organization(Base):
    """Tenant root — an agency or a direct-hire company. RLS is keyed on ``id``."""

    __tablename__ = "organization"

    id: Mapped[uuid.UUID] = mapped_column(
        primary_key=True, server_default=text("gen_random_uuid()")
    )
    type: Mapped[str] = mapped_column(Text)
    name: Mapped[str] = mapped_column(Text)
    data_region: Mapped[str | None] = mapped_column(Text)
    pii_retention_days: Mapped[int] = mapped_column(Integer, server_default=text("730"))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=text("now()")
    )
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    __table_args__ = (CheckConstraint("type in ('agency','direct')", name="type_valid"),)


class Role(Base):
    """Global role taxonomy (recruiter, agency_admin, ...). Not tenant-scoped."""

    __tablename__ = "role"

    id: Mapped[uuid.UUID] = mapped_column(
        primary_key=True, server_default=text("gen_random_uuid()")
    )
    key: Mapped[str] = mapped_column(Text, unique=True)


class Client(Base):
    """A company served by the org (== self for direct-hire). Sub-tenant, NOT an RLS boundary."""

    __tablename__ = "client"

    id: Mapped[uuid.UUID] = mapped_column(
        primary_key=True, server_default=text("gen_random_uuid()")
    )
    org_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("organization.id", ondelete="RESTRICT"), index=True
    )
    name: Mapped[str] = mapped_column(Text)
    is_self: Mapped[bool] = mapped_column(Boolean, server_default=text("false"))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=text("now()")
    )
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class AppUser(Base):
    """A platform user, homed in one org. In-house auth lands in WP 0.10."""

    __tablename__ = "app_user"

    id: Mapped[uuid.UUID] = mapped_column(
        primary_key=True, server_default=text("gen_random_uuid()")
    )
    org_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("organization.id", ondelete="RESTRICT"), index=True
    )
    email: Mapped[str] = mapped_column(CITEXT)
    status: Mapped[str] = mapped_column(Text, server_default=text("'active'"))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=text("now()")
    )
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    __table_args__ = (UniqueConstraint("org_id", "email"),)


class Membership(Base):
    """(user, org, role, scope) — a user's access within an org."""

    __tablename__ = "membership"

    id: Mapped[uuid.UUID] = mapped_column(
        primary_key=True, server_default=text("gen_random_uuid()")
    )
    org_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("organization.id", ondelete="CASCADE"), index=True
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("app_user.id", ondelete="CASCADE"), index=True
    )
    role_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("role.id", ondelete="RESTRICT"))
    scope: Mapped[dict[str, Any]] = mapped_column(JSONB, server_default=text("'{}'::jsonb"))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=text("now()")
    )


class Candidate(Base):
    """Minimal candidate shell (WP 0.2). Full columns + PII encryption in WP 0.6/0.7."""

    __tablename__ = "candidate"

    id: Mapped[uuid.UUID] = mapped_column(
        primary_key=True, server_default=text("gen_random_uuid()")
    )
    org_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("organization.id", ondelete="RESTRICT"), index=True
    )
    external_ref: Mapped[str | None] = mapped_column(Text)
    redaction_status: Mapped[str] = mapped_column(Text, server_default=text("'pending'"))
    pii_jsonb: Mapped[bytes | None] = mapped_column(LargeBinary)  # envelope-encrypted (WP 0.7)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=text("now()")
    )
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class Embedding(Base):
    """Polymorphic embedding row. RLS-governed (org_id) — KNN must never cross tenants.

    Single HNSW index for now; partition-by-model_id is a later refinement. The
    HNSW index is created in the migration (it needs an opclass, which the ORM
    metadata cannot express).
    """

    __tablename__ = "embedding"

    id: Mapped[uuid.UUID] = mapped_column(
        primary_key=True, server_default=text("gen_random_uuid()")
    )
    org_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("organization.id", ondelete="CASCADE"), index=True
    )
    owner_type: Mapped[str] = mapped_column(Text)
    owner_id: Mapped[uuid.UUID] = mapped_column()
    model_id: Mapped[str] = mapped_column(Text)
    dim: Mapped[int] = mapped_column(Integer)
    vector: Mapped[list[float]] = mapped_column(Vector(EMBEDDING_DIM))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=text("now()")
    )


class ParseRun(Base):
    """Provenance for a JD parse — pins model + prompt + params + input hash (invariant #2)."""

    __tablename__ = "parse_run"

    id: Mapped[uuid.UUID] = mapped_column(
        primary_key=True, server_default=text("gen_random_uuid()")
    )
    org_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("organization.id", ondelete="CASCADE"), index=True
    )
    model_id: Mapped[str] = mapped_column(Text)
    prompt_version: Mapped[str] = mapped_column(Text)
    params: Mapped[dict[str, Any]] = mapped_column(JSONB, server_default=text("'{}'::jsonb"))
    input_hash: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=text("now()")
    )


class ScoringRun(Base):
    """Provenance for a scoring pass — pins model + prompt + weight_set + input hash."""

    __tablename__ = "scoring_run"

    id: Mapped[uuid.UUID] = mapped_column(
        primary_key=True, server_default=text("gen_random_uuid()")
    )
    org_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("organization.id", ondelete="CASCADE"), index=True
    )
    screen_session_id: Mapped[uuid.UUID | None] = mapped_column()
    model_id: Mapped[str] = mapped_column(Text)
    prompt_version: Mapped[str] = mapped_column(Text)
    weight_set: Mapped[dict[str, Any]] = mapped_column(JSONB, server_default=text("'{}'::jsonb"))
    input_snapshot_hash: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=text("now()")
    )


class GenerationRun(Base):
    """Provenance for a generation (e.g., screening questions) — pins model + prompt + params."""

    __tablename__ = "generation_run"

    id: Mapped[uuid.UUID] = mapped_column(
        primary_key=True, server_default=text("gen_random_uuid()")
    )
    org_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("organization.id", ondelete="CASCADE"), index=True
    )
    model_id: Mapped[str] = mapped_column(Text)
    prompt_version: Mapped[str] = mapped_column(Text)
    params: Mapped[dict[str, Any]] = mapped_column(JSONB, server_default=text("'{}'::jsonb"))
    input_hash: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=text("now()")
    )


class Score(Base):
    """Tall score table — ONE row per parameter.

    Enforces invariant #2: ``scoring_run_id`` is NOT NULL, so no AI score can be
    persisted without its provenance. Populated in Phase 1.
    """

    __tablename__ = "score"

    id: Mapped[uuid.UUID] = mapped_column(
        primary_key=True, server_default=text("gen_random_uuid()")
    )
    org_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("organization.id", ondelete="CASCADE"), index=True
    )
    scoring_run_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("scoring_run.id", ondelete="CASCADE"), index=True
    )
    screen_session_id: Mapped[uuid.UUID | None] = mapped_column()
    parameter: Mapped[str] = mapped_column(Text)
    value: Mapped[Decimal] = mapped_column(Numeric)
    max_value: Mapped[Decimal] = mapped_column("max", Numeric)
    rationale_text: Mapped[str | None] = mapped_column(Text)
    evidence_refs: Mapped[dict[str, Any]] = mapped_column(JSONB, server_default=text("'{}'::jsonb"))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=text("now()")
    )


class AuditEvent(Base):
    """Append-only, hash-chained audit — the authoritative decision record (all phases).

    INSERT-only at the DB (manfriday_app has no UPDATE/DELETE grant). Each row
    chains to its predecessor for the org: ``hash = sha256(prev_hash || canonical)``.
    Tampering breaks the chain and the verifier detects it (invariant #5).
    WORM / S3 Object-Lock anchoring of the chain head is deferred to Phase 1.
    """

    __tablename__ = "audit_event"

    id: Mapped[uuid.UUID] = mapped_column(
        primary_key=True, server_default=text("gen_random_uuid()")
    )
    seq: Mapped[int] = mapped_column(BigInteger, Identity(always=True), unique=True)
    org_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("organization.id", ondelete="CASCADE"), index=True
    )
    actor_id: Mapped[uuid.UUID | None] = mapped_column()
    actor_type: Mapped[str] = mapped_column(Text)
    action: Mapped[str] = mapped_column(Text)
    entity_type: Mapped[str | None] = mapped_column(Text)
    entity_id: Mapped[uuid.UUID | None] = mapped_column()
    before_jsonb: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    after_jsonb: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    prev_hash: Mapped[str] = mapped_column(Text)
    hash: Mapped[str] = mapped_column(Text)
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))

    # Chain integrity guards: each hash is unique, and each prev_hash links to at
    # most one successor per org (prevents forks; genesis prev_hash is '').
    __table_args__ = (
        UniqueConstraint("hash"),
        UniqueConstraint("org_id", "prev_hash"),
    )


class Resume(Base):
    """Immutable, versioned resume. A new upload is a NEW row (never an update of
    content). ``content_hash`` dedupes; ``is_current`` + ``superseded_by`` chain
    versions. The original bytes live in object storage (S3 SSE-KMS in cloud);
    scoring pins a resume version. Parse output (``parsed_jsonb`` / ``parse_run_id``)
    is filled in Phase 1.
    """

    __tablename__ = "resume"

    id: Mapped[uuid.UUID] = mapped_column(
        primary_key=True, server_default=text("gen_random_uuid()")
    )
    org_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("organization.id", ondelete="CASCADE"), index=True
    )
    candidate_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("candidate.id", ondelete="CASCADE"), index=True
    )
    version: Mapped[int] = mapped_column(Integer)
    content_hash: Mapped[str] = mapped_column(Text)
    storage_uri: Mapped[str] = mapped_column(Text)
    content_type: Mapped[str | None] = mapped_column(Text)
    parsed_jsonb: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    parse_run_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("parse_run.id", ondelete="SET NULL")
    )
    is_current: Mapped[bool] = mapped_column(Boolean, server_default=text("true"))
    superseded_by: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("resume.id", ondelete="SET NULL")
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=text("now()")
    )

    __table_args__ = (
        UniqueConstraint("candidate_id", "version", name="uq_resume_candidate_version"),
        UniqueConstraint("candidate_id", "content_hash", name="uq_resume_candidate_content_hash"),
        # At most one current version per candidate.
        Index(
            "uq_resume_current_per_candidate",
            "candidate_id",
            unique=True,
            postgresql_where=text("is_current"),
        ),
    )


class TenantKey(Base):
    """Per-tenant wrapped data-encryption key (DEK) for PII envelope encryption (WP 0.7).

    The DEK encrypts ``candidate.pii_jsonb``; it is stored only in *wrapped* form
    (a KEK wraps it — a local key shim in dev, AWS KMS in cloud). Crypto-shred =
    delete this row: the DEK is destroyed and the tenant's PII is unrecoverable.
    """

    __tablename__ = "tenant_key"

    org_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("organization.id", ondelete="CASCADE"), primary_key=True
    )
    wrapped_dek: Mapped[bytes] = mapped_column(LargeBinary)
    key_version: Mapped[int] = mapped_column(Integer, server_default=text("1"))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=text("now()")
    )
