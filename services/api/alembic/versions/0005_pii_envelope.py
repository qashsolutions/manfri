"""pii envelope encryption (WP 0.7)

Adds candidate.pii_jsonb (bytea, envelope-encrypted) and the tenant_key table
(per-tenant wrapped DEK). Crypto-shred = delete the tenant_key row. RLS + grants
(SELECT/INSERT/DELETE — DELETE is the crypto-shred path).

Revision ID: 0005
Revises: 0004
Create Date: 2026-05-28

"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op
from app.db import models  # noqa: F401  (registers all tables on Base.metadata)
from app.db.base import Base

revision: str = "0005"
down_revision: str | None = "0004"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_PREDICATE = "org_id = NULLIF(current_setting('app.current_org', true), '')::uuid"


def upgrade() -> None:
    bind = op.get_bind()
    op.add_column("candidate", sa.Column("pii_jsonb", sa.LargeBinary(), nullable=True))

    Base.metadata.create_all(bind, tables=[Base.metadata.tables["tenant_key"]])
    op.execute("GRANT SELECT, INSERT, DELETE ON tenant_key TO manfriday_app")
    op.execute("ALTER TABLE tenant_key ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE tenant_key FORCE ROW LEVEL SECURITY")
    op.execute(
        f"CREATE POLICY tenant_isolation ON tenant_key "
        f"USING ({_PREDICATE}) WITH CHECK ({_PREDICATE})"
    )


def downgrade() -> None:
    Base.metadata.drop_all(op.get_bind(), tables=[Base.metadata.tables["tenant_key"]])
    op.drop_column("candidate", "pii_jsonb")
