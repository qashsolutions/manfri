"""Internal-JWT minting + verification (WP 0.10) — EdDSA (Ed25519), 5-minute TTL.

The BFF mints one per request with the tenant claims; FastAPI verifies it (via the
public key / JWKS) and sets the RLS GUCs from the verified claims. Short TTL means
revocation (role change / offboard) takes effect within 5 minutes with no blocklist.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta
from typing import Any

import jwt

from app.auth.claims import AuthClaims
from app.auth.keys import signing_key

_ALG = "EdDSA"
_ISS = "manfriday-bff"
_AUD = "manfriday-api"
DEFAULT_TTL_SECONDS = 300


class InvalidTokenError(RuntimeError):
    """The internal JWT is missing, malformed, expired, or fails verification."""


def mint_internal_jwt(
    *,
    sub: str,
    org_id: str,
    active_client_id: str | None = None,
    roles: list[str] | None = None,
    scope: dict[str, Any] | None = None,
    consent_caps: list[str] | None = None,
    ttl_seconds: int = DEFAULT_TTL_SECONDS,
) -> str:
    """Mint a signed internal JWT. (Prod minting happens in the BFF; this is the same shape.)"""
    now = datetime.now(tz=UTC)
    payload: dict[str, Any] = {
        "sub": sub,
        "org_id": org_id,
        "active_client_id": active_client_id,
        "roles": roles or [],
        "scope": scope or {},
        "consent_caps": consent_caps or [],
        "jti": str(uuid.uuid4()),
        "iss": _ISS,
        "aud": _AUD,
        "iat": now,
        "exp": now + timedelta(seconds=ttl_seconds),
    }
    return jwt.encode(payload, signing_key(), algorithm=_ALG)


def verify_internal_jwt(token: str) -> AuthClaims:
    """Verify signature, issuer, audience, and expiry; return the claims or raise."""
    try:
        decoded = jwt.decode(
            token,
            signing_key().public_key(),
            algorithms=[_ALG],
            audience=_AUD,
            issuer=_ISS,
        )
    except jwt.PyJWTError as exc:
        raise InvalidTokenError(str(exc)) from exc
    return AuthClaims(
        sub=decoded["sub"],
        org_id=decoded["org_id"],
        active_client_id=decoded.get("active_client_id"),
        roles=decoded.get("roles", []),
        scope=decoded.get("scope", {}),
        consent_caps=decoded.get("consent_caps", []),
        jti=decoded["jti"],
    )
