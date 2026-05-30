"""PII envelope encryption + crypto-shred (WP 0.7).

``candidate.pii_jsonb`` is encrypted with a per-tenant DEK (AES-256-GCM); the DEK
is stored only wrapped by the KEK (``tenant_key.wrapped_dek``). Crypto-shred
deletes the tenant_key row — the DEK is destroyed and the tenant's PII is
unrecoverable even though the ciphertext bytes remain.

Scoring runs on a redacted profile (invariant #11); this layer protects the raw
identified PII at rest.
"""

from __future__ import annotations

import json
import os
import uuid
from typing import Any

from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.crypto.keys import KeyProvider

_NONCE_BYTES = 12


class PiiUnrecoverableError(RuntimeError):
    """Raised when PII ciphertext exists but its DEK has been crypto-shredded."""


async def _fetch_wrapped_dek(session: AsyncSession, org_id: uuid.UUID) -> bytes | None:
    row = (
        await session.execute(
            text("select wrapped_dek from tenant_key where org_id = :o"), {"o": org_id}
        )
    ).scalar_one_or_none()
    return bytes(row) if row is not None else None


async def _get_or_create_dek(session: AsyncSession, kp: KeyProvider, org_id: uuid.UUID) -> bytes:
    wrapped = await _fetch_wrapped_dek(session, org_id)
    if wrapped is not None:
        return kp.unwrap_dek(wrapped)
    dek = AESGCM.generate_key(bit_length=256)
    await session.execute(
        text("insert into tenant_key (org_id, wrapped_dek) values (:o, :w)"),
        {"o": org_id, "w": kp.wrap_dek(dek)},
    )
    return dek


def _encrypt(dek: bytes, plaintext: bytes) -> bytes:
    nonce = os.urandom(_NONCE_BYTES)
    return nonce + AESGCM(dek).encrypt(nonce, plaintext, None)


def _decrypt(dek: bytes, blob: bytes) -> bytes:
    return AESGCM(dek).decrypt(blob[:_NONCE_BYTES], blob[_NONCE_BYTES:], None)


async def set_candidate_pii(
    session: AsyncSession,
    kp: KeyProvider,
    *,
    org_id: uuid.UUID,
    candidate_id: uuid.UUID,
    pii: dict[str, Any],
) -> None:
    """Encrypt and store a candidate's PII under the tenant's DEK."""
    dek = await _get_or_create_dek(session, kp, org_id)
    plaintext = json.dumps(pii, sort_keys=True, separators=(",", ":")).encode("utf-8")
    await session.execute(
        text("update candidate set pii_jsonb = :b, redaction_status = 'encrypted' where id = :id"),
        {"b": _encrypt(dek, plaintext), "id": candidate_id},
    )


async def get_candidate_pii(
    session: AsyncSession,
    kp: KeyProvider,
    *,
    org_id: uuid.UUID,
    candidate_id: uuid.UUID,
) -> dict[str, Any] | None:
    """Decrypt a candidate's PII, or raise if the DEK was crypto-shredded."""
    blob = (
        await session.execute(
            text("select pii_jsonb from candidate where id = :id"), {"id": candidate_id}
        )
    ).scalar_one_or_none()
    if blob is None:
        return None
    wrapped = await _fetch_wrapped_dek(session, org_id)
    if wrapped is None:
        raise PiiUnrecoverableError(f"DEK for org {org_id} was crypto-shredded")
    dek = kp.unwrap_dek(wrapped)
    data: dict[str, Any] = json.loads(_decrypt(dek, bytes(blob)))
    return data


async def crypto_shred(session: AsyncSession, *, org_id: uuid.UUID) -> None:
    """Destroy the tenant's DEK; its encrypted PII becomes unrecoverable."""
    await session.execute(text("delete from tenant_key where org_id = :o"), {"o": org_id})


async def get_org_dek(session: AsyncSession, kp: KeyProvider, *, org_id: uuid.UUID) -> bytes | None:
    """Unwrap the tenant DEK once (None if absent / crypto-shredded).

    For decrypting many candidates' PII in one request (e.g. a list view) without
    re-unwrapping the DEK per row; pair with :func:`decrypt_pii`.
    """
    wrapped = await _fetch_wrapped_dek(session, org_id)
    return kp.unwrap_dek(wrapped) if wrapped is not None else None


def decrypt_pii(dek: bytes, blob: bytes) -> dict[str, Any]:
    """Decrypt one ``pii_jsonb`` ciphertext with an already-unwrapped DEK."""
    data: dict[str, Any] = json.loads(_decrypt(dek, blob))
    return data
