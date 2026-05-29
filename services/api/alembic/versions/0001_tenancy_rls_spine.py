"""tenancy & RLS spine (WP 0.2)

Creates the tenancy tables + minimal candidate/embedding shells, the global role
lookup, the non-superuser/non-BYPASSRLS ``manfriday_app`` role, least-privilege
grants, the HNSW index, and ENABLE + FORCE Row-Level Security with a
``tenant_isolation`` policy on every tenant-scoped table (invariant #3).

Revision ID: 0001
Revises:
Create Date: 2026-05-28

"""

from __future__ import annotations

from collections.abc import Sequence

from alembic import op
from app.db import models  # noqa: F401  (registers all tables on Base.metadata)
from app.db.base import Base

revision: str = "0001"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# Tenant-scoped tables and the column RLS keys off. `role` is global (no RLS).
TENANT_TABLES: list[tuple[str, str]] = [
    ("organization", "id"),
    ("client", "org_id"),
    ("app_user", "org_id"),
    ("membership", "org_id"),
    ("candidate", "org_id"),
    ("embedding", "org_id"),
]

# NULLIF(..., '') makes an unset OR empty GUC deny-by-default (NULL never matches),
# so a query with no tenant context returns zero rows instead of erroring.
_PREDICATE = "{col} = NULLIF(current_setting('app.current_org', true), '')::uuid"


def upgrade() -> None:
    bind = op.get_bind()

    # Extensions must exist before tables that use citext / vector columns.
    op.execute("CREATE EXTENSION IF NOT EXISTS citext")
    op.execute("CREATE EXTENSION IF NOT EXISTS vector")

    # Tables + their btree indexes, from the ORM metadata (single source of truth).
    Base.metadata.create_all(bind)

    # HNSW index for cosine ANN (needs an opclass — not expressible in ORM metadata).
    op.execute(
        "CREATE INDEX ix_embedding_vector_hnsw ON embedding "
        "USING hnsw (vector vector_cosine_ops) WITH (m = 16, ef_construction = 64)"
    )

    # Seed the global role taxonomy.
    op.execute(
        "INSERT INTO role (key) VALUES "
        "('recruiter'),('agency_admin'),('client_hiring_manager'),"
        "('candidate'),('auditor'),('platform_super_admin') "
        "ON CONFLICT (key) DO NOTHING"
    )

    # The application role: LOGIN, but NOT superuser and NOT BYPASSRLS, so RLS
    # applies to it. Local dev uses trust auth (no password); real envs set auth
    # out-of-band via secrets + pg_hba.
    op.execute(
        """
        DO $$ BEGIN
          IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'manfriday_app') THEN
            CREATE ROLE manfriday_app LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
          END IF;
        END $$;
        """
    )

    # Least-privilege grants. DDL stays with the owner; the app only does DML.
    op.execute("GRANT USAGE ON SCHEMA public TO manfriday_app")
    op.execute(
        "GRANT SELECT, INSERT, UPDATE, DELETE ON "
        "organization, client, app_user, membership, candidate, embedding "
        "TO manfriday_app"
    )
    op.execute("GRANT SELECT ON role TO manfriday_app")

    # Row-Level Security on every tenant-scoped table. FORCE so it applies even
    # to the table owner; the policy covers reads (USING) and writes (WITH CHECK).
    for table, col in TENANT_TABLES:
        predicate = _PREDICATE.format(col=col)
        op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY")
        op.execute(f"ALTER TABLE {table} FORCE ROW LEVEL SECURITY")
        op.execute(
            f"CREATE POLICY tenant_isolation ON {table} "
            f"USING ({predicate}) WITH CHECK ({predicate})"
        )


def downgrade() -> None:
    bind = op.get_bind()
    # Dropping tables removes their policies and the manfriday_app grants with them.
    Base.metadata.drop_all(bind)
    op.execute(
        """
        DO $$ BEGIN
          IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'manfriday_app') THEN
            EXECUTE 'DROP OWNED BY manfriday_app';
            DROP ROLE manfriday_app;
          END IF;
        END $$;
        """
    )
