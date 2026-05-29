"""ORM models for the Phase 0 tenancy & RLS spine (WP 0.2).

Every tenant-scoped table carries ``org_id`` and is governed by Row-Level
Security (invariant #3). ``role`` is intentionally a global lookup (same taxonomy
for all tenants), so it carries no ``org_id`` and no RLS policy.

``candidate`` and ``embedding`` are minimal shells here — just enough to
establish the RLS + pgvector pattern and feed the WP 0.3 leak probe. Their full
column sets and PII envelope encryption land in WP 0.6 / 0.7.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from pgvector.sqlalchemy import Vector
from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Integer,
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
