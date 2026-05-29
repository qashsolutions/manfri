"""FastAPI auth dependency (WP 0.10): verify the internal JWT from the Authorization header."""

from __future__ import annotations

from typing import Annotated

from fastapi import Header, HTTPException, status

from app.auth.claims import AuthClaims
from app.auth.jwt import InvalidTokenError, verify_internal_jwt

_BEARER = "Bearer "


def require_claims(authorization: Annotated[str | None, Header()] = None) -> AuthClaims:
    """Return the verified claims, or raise 401."""
    if not authorization or not authorization.startswith(_BEARER):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="missing bearer token")
    try:
        return verify_internal_jwt(authorization.removeprefix(_BEARER))
    except InvalidTokenError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid token"
        ) from exc
