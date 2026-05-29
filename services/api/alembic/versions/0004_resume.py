"""immutable versioned resume (WP 0.6)

Adds the ``resume`` table (immutable, content-hash-deduped, version-chained) with
RLS + grants. UPDATE is granted (for superseding is_current/superseded_by) but not
DELETE; resume content is never mutated — a new upload is a new row.

Revision ID: 0004
Revises: 0003
Create Date: 2026-05-28

"""

from __future__ import annotations

from collections.abc import Sequence

from alembic import op
from app.db import models  # noqa: F401  (registers all tables on Base.metadata)
from app.db.base import Base

revision: str = "0004"
down_revision: str | None = "0003"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_PREDICATE = "org_id = NULLIF(current_setting('app.current_org', true), '')::uuid"


def upgrade() -> None:
    bind = op.get_bind()
    Base.metadata.create_all(bind, tables=[Base.metadata.tables["resume"]])

    op.execute("GRANT SELECT, INSERT, UPDATE ON resume TO manfriday_app")

    op.execute("ALTER TABLE resume ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE resume FORCE ROW LEVEL SECURITY")
    op.execute(
        f"CREATE POLICY tenant_isolation ON resume USING ({_PREDICATE}) WITH CHECK ({_PREDICATE})"
    )


def downgrade() -> None:
    Base.metadata.drop_all(op.get_bind(), tables=[Base.metadata.tables["resume"]])
