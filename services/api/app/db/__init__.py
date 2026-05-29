"""Database layer — SQLAlchemy models, Alembic migrations, RLS policies.

**WP 0.2 (this package, now landed):** tenancy tables (organization, client,
app_user, role, membership) + minimal candidate/embedding shells; Row-Level
Security (ENABLE + FORCE + tenant_isolation policies); the non-BYPASSRLS
``manfriday_app`` role; and the ``tenant_transaction`` GUC plumbing.

Still to come:
  * WP 0.4 — provenance spine (parse_run/scoring_run/generation_run) + tall ``score``.
  * WP 0.5 — append-only, hash-chained ``audit_event``.
  * WP 0.6 — immutable versioned ``resume`` (+ candidate PII columns, WP 0.7).

Invariant #3: every tenant-scoped table carries ``org_id`` with an RLS policy;
the app connects as a non-BYPASSRLS role. pgvector KNN is RLS-governed too.
"""

from __future__ import annotations

from app.db.base import Base
from app.db.models import (
    AppUser,
    Candidate,
    Client,
    Embedding,
    Membership,
    Organization,
    Role,
)
from app.db.session import get_engine, get_sessionmaker, tenant_transaction

__all__ = [
    "AppUser",
    "Base",
    "Candidate",
    "Client",
    "Embedding",
    "Membership",
    "Organization",
    "Role",
    "get_engine",
    "get_sessionmaker",
    "tenant_transaction",
]
