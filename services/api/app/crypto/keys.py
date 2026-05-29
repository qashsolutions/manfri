"""Key provider for PII envelope encryption (WP 0.7).

A KeyProvider wraps/unwraps per-tenant data-encryption keys (DEKs) with a
key-encryption key (KEK). Dev/CI uses :class:`LocalKekProvider` (a local
AES-256-GCM key); cloud swaps in an AWS KMS provider (KMS Encrypt/Decrypt) by
config — with no local key material.
"""

from __future__ import annotations

import os
from functools import lru_cache
from typing import Protocol

from cryptography.hazmat.primitives.ciphers.aead import AESGCM

from app.config import get_settings

_NONCE_BYTES = 12


class KeyProvider(Protocol):
    """Wraps/unwraps DEKs with a KEK."""

    def wrap_dek(self, dek: bytes) -> bytes: ...

    def unwrap_dek(self, wrapped: bytes) -> bytes: ...


class LocalKekProvider:
    """Dev/CI KEK shim: AES-256-GCM with a local 32-byte key. NOT for production."""

    def __init__(self, kek: bytes) -> None:
        if len(kek) != 32:
            raise ValueError("KEK must be exactly 32 bytes (AES-256)")
        self._aes = AESGCM(kek)

    def wrap_dek(self, dek: bytes) -> bytes:
        nonce = os.urandom(_NONCE_BYTES)
        return nonce + self._aes.encrypt(nonce, dek, None)

    def unwrap_dek(self, wrapped: bytes) -> bytes:
        return self._aes.decrypt(wrapped[:_NONCE_BYTES], wrapped[_NONCE_BYTES:], None)


@lru_cache
def get_key_provider() -> KeyProvider:
    """Return the configured key provider (local KEK shim in dev/CI)."""
    # WP cloud: branch on a setting to return an AWS KMS-backed provider.
    return LocalKekProvider(get_settings().pii_dev_kek.encode("utf-8"))
