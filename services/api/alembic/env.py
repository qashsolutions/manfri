"""Alembic environment (sync, superuser connection).

Migrations run as the database owner/superuser so they can create the
``manfriday_app`` role, tables, RLS policies, and grants. The admin URL comes
from ``DATABASE_ADMIN_URL`` or defaults to the local OS user over trust auth.
"""

from __future__ import annotations

import getpass
import os
from logging.config import fileConfig

from sqlalchemy import create_engine

import app.db.models  # noqa: F401  (imported so every table registers on Base.metadata)
from alembic import context
from app.db.base import Base

config = context.config
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def _admin_url() -> str:
    return os.environ.get(
        "DATABASE_ADMIN_URL",
        f"postgresql+psycopg://{getpass.getuser()}@localhost:5432/manfriday_dev",
    )


def run_migrations_offline() -> None:
    context.configure(
        url=_admin_url(),
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    engine = create_engine(_admin_url())
    with engine.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata)
        with context.begin_transaction():
            context.run_migrations()
    engine.dispose()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
