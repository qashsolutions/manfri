"""Shared FastAPI dependencies for the product endpoints (Phase 1).

``TenantSession`` yields an RLS-scoped :class:`AsyncSession` whose ``app.current_org``
/ ``app.current_user`` / ``app.role`` GUCs come from the **verified** JWT claims
(invariant #3) — the single sanctioned way an authenticated request reads/writes
tenant data. The transaction commits when the request handler returns.
"""

from __future__ import annotations

from collections.abc import AsyncIterator
from typing import Annotated

from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import AuthClaims, require_claims, scoped_transaction


async def tenant_session(
    claims: Annotated[AuthClaims, Depends(require_claims)],
) -> AsyncIterator[AsyncSession]:
    """Yield an RLS-scoped session bound to the caller's verified org/user/role."""
    async with scoped_transaction(claims) as session:
        yield session


Claims = Annotated[AuthClaims, Depends(require_claims)]
TenantSession = Annotated[AsyncSession, Depends(tenant_session)]
