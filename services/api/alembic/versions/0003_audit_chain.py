"""append-only hash-chained audit (WP 0.5)

audit_event is INSERT-only at the DB: manfriday_app gets SELECT + INSERT, and
UPDATE/DELETE are explicitly revoked (invariant #5). RLS like other tenant tables.

Revision ID: 0003
Revises: 0002
Create Date: 2026-05-28

"""

from __future__ import annotations

from collections.abc import Sequence

from alembic import op
from app.db import models  # noqa: F401  (registers all tables on Base.metadata)
from app.db.base import Base

revision: str = "0003"
down_revision: str | None = "0002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_PREDICATE = "org_id = NULLIF(current_setting('app.current_org', true), '')::uuid"


def upgrade() -> None:
    bind = op.get_bind()
    Base.metadata.create_all(bind, tables=[Base.metadata.tables["audit_event"]])

    # Append-only: SELECT + INSERT only; UPDATE/DELETE explicitly revoked.
    op.execute("GRANT SELECT, INSERT ON audit_event TO manfriday_app")
    op.execute("REVOKE UPDATE, DELETE ON audit_event FROM manfriday_app")

    op.execute("ALTER TABLE audit_event ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE audit_event FORCE ROW LEVEL SECURITY")
    op.execute(
        f"CREATE POLICY tenant_isolation ON audit_event "
        f"USING ({_PREDICATE}) WITH CHECK ({_PREDICATE})"
    )


def downgrade() -> None:
    Base.metadata.drop_all(op.get_bind(), tables=[Base.metadata.tables["audit_event"]])
