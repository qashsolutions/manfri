"""In-house auth: BFF session + 5-min EdDSA internal JWT + JWKS verify + TOTP (WP 0.10).

The browser never holds a FastAPI token: the BFF keeps an encrypted session and
mints a short-lived internal JWT per request; FastAPI verifies it and sets the RLS
GUCs from the **verified** claims (invariant #3). Short TTL = revocation within
5 min, no blocklist. WorkOS SSO/SCIM is deferred to Phase 3.
"""

from __future__ import annotations

from app.auth.claims import AuthClaims
from app.auth.dependencies import require_claims
from app.auth.jwt import (
    DEFAULT_TTL_SECONDS,
    InvalidTokenError,
    mint_internal_jwt,
    verify_internal_jwt,
)
from app.auth.keys import public_jwks, signing_key
from app.auth.session_scope import scoped_transaction
from app.auth.totp import provision_totp, verify_totp

__all__ = [
    "DEFAULT_TTL_SECONDS",
    "AuthClaims",
    "InvalidTokenError",
    "mint_internal_jwt",
    "provision_totp",
    "public_jwks",
    "require_claims",
    "scoped_transaction",
    "signing_key",
    "verify_internal_jwt",
    "verify_totp",
]
