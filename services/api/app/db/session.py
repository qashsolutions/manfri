"""Async engine, session factory, and the tenant-scoped transaction (WP 0.2).

The app connects as the non-superuser, non-BYPASSRLS role ``manfriday_app``.
Every tenant query runs inside :func:`tenant_transaction`, which sets the
``app.current_org`` / ``app.current_user`` / ``app.role`` GUCs **transaction-locally**
via ``set_config(..., is_local => true)``. Transaction scoping is what makes
PgBouncer transaction pooling safe — context can never bleed across pooled
connections (verified by the WP 0.3 leak probe). RLS policies read these GUCs.

In WP 0.10 the GUC values are populated from **verified JWT claims**, never from
client-supplied input.
"""

from __future__ import annotations

import uuid
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from functools import lru_cache

from sqlalchemy import text
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from app.config import get_settings


@lru_cache
def get_engine() -> AsyncEngine:
    """Lazily-created async engine (connects as ``manfriday_app``)."""
    return create_async_engine(get_settings().database_url, pool_pre_ping=True)


@lru_cache
def get_sessionmaker() -> async_sessionmaker[AsyncSession]:
    """Session factory bound to the async engine."""
    return async_sessionmaker(get_engine(), expire_on_commit=False)


@asynccontextmanager
async def tenant_transaction(
    *,
    org_id: uuid.UUID,
    user_id: uuid.UUID | None = None,
    role: str | None = None,
) -> AsyncIterator[AsyncSession]:
    """Open a transaction with the tenant GUCs set (transaction-local, injection-safe).

    All queries inside the block are RLS-scoped to ``org_id``.
    """
    async with get_sessionmaker()() as session, session.begin():
        await session.execute(
            text("select set_config('app.current_org', :v, true)"),
            {"v": str(org_id)},
        )
        if user_id is not None:
            await session.execute(
                text("select set_config('app.current_user', :v, true)"),
                {"v": str(user_id)},
            )
        if role is not None:
            await session.execute(
                text("select set_config('app.role', :v, true)"),
                {"v": role},
            )
        yield session
