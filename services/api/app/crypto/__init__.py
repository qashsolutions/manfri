"""PII envelope encryption + crypto-shred (WP 0.7).

Per-tenant DEK (AES-256-GCM) encrypts ``candidate.pii_jsonb``; the DEK is stored
only wrapped by the KEK (local shim in dev, AWS KMS in cloud). Crypto-shred
destroys the DEK, rendering the tenant's PII unrecoverable.
"""

from __future__ import annotations

from app.crypto.envelope import (
    PiiUnrecoverableError,
    crypto_shred,
    decrypt_pii,
    get_candidate_pii,
    get_org_dek,
    set_candidate_pii,
)
from app.crypto.keys import KeyProvider, LocalKekProvider, get_key_provider

__all__ = [
    "KeyProvider",
    "LocalKekProvider",
    "PiiUnrecoverableError",
    "crypto_shred",
    "decrypt_pii",
    "get_candidate_pii",
    "get_key_provider",
    "get_org_dek",
    "set_candidate_pii",
]
