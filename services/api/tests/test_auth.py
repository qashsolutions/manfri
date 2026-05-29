"""In-house auth tests (WP 0.10) — EdDSA JWT, claims->RLS GUCs, TOTP, /whoami.

Fixtures in conftest.py; the RLS test skips without a migrated DB.
"""

from __future__ import annotations

import uuid

import pyotp
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text

from app.auth import (
    InvalidTokenError,
    mint_internal_jwt,
    provision_totp,
    scoped_transaction,
    verify_internal_jwt,
    verify_totp,
)
from app.main import app

Seed = dict[str, uuid.UUID]


def test_mint_and_verify_roundtrip() -> None:
    token = mint_internal_jwt(sub=str(uuid.uuid4()), org_id=str(uuid.uuid4()), roles=["recruiter"])
    claims = verify_internal_jwt(token)
    assert claims.roles == ["recruiter"]
    assert claims.jti


def test_expired_token_is_rejected() -> None:
    token = mint_internal_jwt(sub=str(uuid.uuid4()), org_id=str(uuid.uuid4()), ttl_seconds=-10)
    with pytest.raises(InvalidTokenError):
        verify_internal_jwt(token)


def test_tampered_token_is_rejected() -> None:
    token = mint_internal_jwt(sub=str(uuid.uuid4()), org_id=str(uuid.uuid4()))
    tampered = token[:-3] + ("bbb" if token.endswith("aaa") else "aaa")
    with pytest.raises(InvalidTokenError):
        verify_internal_jwt(tampered)


def test_public_jwks_exposes_signing_key() -> None:
    from app.auth import public_jwks

    jwks = public_jwks()
    assert jwks["keys"]
    assert jwks["keys"][0]["kty"] == "OKP"  # Ed25519 / Octet Key Pair


def test_totp_roundtrip() -> None:
    secret, uri = provision_totp("recruiter@example.test")
    assert "ManFriday" in uri
    assert verify_totp(secret, pyotp.TOTP(secret).now()) is True
    assert verify_totp(secret, "000000") is False


def test_whoami_requires_valid_bearer() -> None:
    client = TestClient(app)
    assert client.get("/whoami").status_code == 401
    assert client.get("/whoami", headers={"Authorization": "Bearer garbage"}).status_code == 401
    token = mint_internal_jwt(sub=str(uuid.uuid4()), org_id=str(uuid.uuid4()), roles=["recruiter"])
    resp = client.get("/whoami", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200
    assert resp.json()["roles"] == ["recruiter"]


@pytest.mark.anyio
async def test_claims_scope_rls_to_org(seed: Seed) -> None:
    org = seed["org_a"]
    token = mint_internal_jwt(sub=str(uuid.uuid4()), org_id=str(org), roles=["recruiter"])
    claims = verify_internal_jwt(token)
    # RLS GUCs come from the verified claims; the query is scoped without an org filter.
    async with scoped_transaction(claims) as session:
        rows = (await session.execute(text("select org_id from candidate"))).scalars().all()
    assert rows and all(o == org for o in rows)
