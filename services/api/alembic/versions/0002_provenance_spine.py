"""provenance spine (WP 0.4)

Adds parse_run / scoring_run / generation_run and the tall ``score`` table whose
``scoring_run_id`` is NOT NULL (invariant #2: no AI score without its provenance),
with RLS + least-privilege grants for the new tenant-scoped tables.

Revision ID: 0002
Revises: 0001
Create Date: 2026-05-28

"""

from __future__ import annotations

from collections.abc import Sequence

from alembic import op
from app.db import models  # noqa: F401  (registers all tables on Base.metadata)
from app.db.base import Base

revision: str = "0002"
down_revision: str | None = "0001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

NEW_TABLES = ["parse_run", "scoring_run", "generation_run", "score"]
_PREDICATE = "org_id = NULLIF(current_setting('app.current_org', true), '')::uuid"


def upgrade() -> None:
    bind = op.get_bind()
    tables = [Base.metadata.tables[name] for name in NEW_TABLES]
    Base.metadata.create_all(bind, tables=tables)

    op.execute(
        "GRANT SELECT, INSERT, UPDATE, DELETE ON "
        "parse_run, scoring_run, generation_run, score TO manfriday_app"
    )

    for table in NEW_TABLES:
        op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY")
        op.execute(f"ALTER TABLE {table} FORCE ROW LEVEL SECURITY")
        op.execute(
            f"CREATE POLICY tenant_isolation ON {table} "
            f"USING ({_PREDICATE}) WITH CHECK ({_PREDICATE})"
        )


def downgrade() -> None:
    tables = [Base.metadata.tables[name] for name in NEW_TABLES]
    Base.metadata.drop_all(op.get_bind(), tables=tables)
