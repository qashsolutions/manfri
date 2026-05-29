"""TOTP MFA for in-house recruiter login (WP 0.10)."""

from __future__ import annotations

import pyotp


def provision_totp(account: str, issuer: str = "ManFriday") -> tuple[str, str]:
    """Return (secret, otpauth provisioning URI) for enrolling an authenticator app."""
    secret = pyotp.random_base32()
    uri = pyotp.TOTP(secret).provisioning_uri(name=account, issuer_name=issuer)
    return secret, uri


def verify_totp(secret: str, code: str) -> bool:
    """Verify a 6-digit TOTP code (±1 step of clock skew)."""
    return bool(pyotp.TOTP(secret).verify(code, valid_window=1))
