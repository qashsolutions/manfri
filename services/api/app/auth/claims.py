"""Verified internal-JWT claims (WP 0.10)."""

from __future__ import annotations

import uuid

from pydantic import BaseModel, Field


class AuthClaims(BaseModel):
    """The tenant-scoping claims carried by the 5-minute internal JWT.

    The RLS GUCs (``app.current_org`` / ``app.current_user`` / ``app.role``) are set
    from these **verified** values, never from client input (invariant #3).
    """

    sub: str  # app_user id
    org_id: str
    active_client_id: str | None = None
    roles: list[str] = Field(default_factory=list)
    scope: dict[str, object] = Field(default_factory=dict)
    consent_caps: list[str] = Field(default_factory=list)
    jti: str

    @property
    def org_uuid(self) -> uuid.UUID:
        return uuid.UUID(self.org_id)

    @property
    def user_uuid(self) -> uuid.UUID:
        return uuid.UUID(self.sub)
