"""Bridge verified JWT claims to an RLS-scoped DB transaction (WP 0.10).

This is the join between auth and tenant isolation: the RLS GUCs are set from the
**verified** claims, never from client input (invariant #3).
"""

from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.claims import AuthClaims
from app.db.session import tenant_transaction


@asynccontextmanager
async def scoped_transaction(claims: AuthClaims) -> AsyncIterator[AsyncSession]:
    """Open a tenant transaction with the RLS GUCs set from ``claims``."""
    role = claims.roles[0] if claims.roles else None
    async with tenant_transaction(
        org_id=claims.org_uuid, user_id=claims.user_uuid, role=role
    ) as session:
        yield session
