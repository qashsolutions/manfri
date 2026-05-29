"""PII envelope encryption + crypto-shred tests (WP 0.7).

Synthetic data only. Fixtures in conftest.py; skip without a migrated DB.
"""

from __future__ import annotations

import uuid

import pytest
from sqlalchemy import text

from app.crypto import (
    PiiUnrecoverableError,
    crypto_shred,
    get_candidate_pii,
    set_candidate_pii,
)
from app.crypto.keys import LocalKekProvider
from app.db.session import tenant_transaction

Seed = dict[str, uuid.UUID]

# 32-byte dev KEK (matches the settings default); synthetic data only.
KP = LocalKekProvider(b"manfriday_dev_kek_synthetic_0001")


@pytest.mark.anyio
async def test_pii_encrypt_decrypt_roundtrip(seed: Seed) -> None:
    org, cand = seed["org_a"], seed["cand_a"]
    pii = {"full_name": "Jane Synthetic", "email": "jane@example.test"}
    async with tenant_transaction(org_id=org) as session:
        await set_candidate_pii(session, KP, org_id=org, candidate_id=cand, pii=pii)
    async with tenant_transaction(org_id=org) as session:
        got = await get_candidate_pii(session, KP, org_id=org, candidate_id=cand)
    assert got == pii


@pytest.mark.anyio
async def test_stored_bytes_are_ciphertext_not_plaintext(seed: Seed) -> None:
    org, cand = seed["org_a"], seed["cand_a"]
    async with tenant_transaction(org_id=org) as session:
        await set_candidate_pii(
            session, KP, org_id=org, candidate_id=cand, pii={"full_name": "Jane Synthetic"}
        )
    async with tenant_transaction(org_id=org) as session:
        raw = (
            await session.execute(
                text("select pii_jsonb from candidate where id = :id"), {"id": cand}
            )
        ).scalar_one()
    assert b"Jane Synthetic" not in bytes(raw)


@pytest.mark.anyio
async def test_crypto_shred_makes_pii_unrecoverable(seed: Seed) -> None:
    org, cand = seed["org_a"], seed["cand_a"]
    async with tenant_transaction(org_id=org) as session:
        await set_candidate_pii(
            session, KP, org_id=org, candidate_id=cand, pii={"full_name": "Jane Synthetic"}
        )
    async with tenant_transaction(org_id=org) as session:
        await crypto_shred(session, org_id=org)
    async with tenant_transaction(org_id=org) as session:
        with pytest.raises(PiiUnrecoverableError):
            await get_candidate_pii(session, KP, org_id=org, candidate_id=cand)
