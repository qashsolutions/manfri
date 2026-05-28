"""Database layer — SQLAlchemy models, Alembic migrations, RLS policies.

Empty in WP 0.1. Filled by:
  * WP 0.2 — tenancy tables + Row-Level Security policies + non-BYPASSRLS role
             + ``SET LOCAL app.current_org/user/role`` plumbing.
  * WP 0.4 — provenance spine (parse_run/scoring_run/generation_run) + tall
             ``score`` table with NOT-NULL FK to scoring_run.
  * WP 0.5 — append-only, hash-chained ``audit_event``.
  * WP 0.6 — immutable versioned ``resume``.

Invariant #3: every tenant-scoped table carries ``org_id`` with an RLS policy;
the app connects as a non-BYPASSRLS role. pgvector KNN is RLS-governed too.
"""
