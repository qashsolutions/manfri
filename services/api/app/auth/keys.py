"""Internal-JWT signing key + JWKS (WP 0.10).

Dev/CI generates a per-process Ed25519 key. In prod the BFF holds the private key
(from the secret store, rotated) and publishes the public half via JWKS; FastAPI
verifies against it. The browser never holds either key.
"""

from __future__ import annotations

import json
from functools import lru_cache
from typing import Any

import jwt
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

_KID = "manfriday-dev-ed25519"


@lru_cache
def signing_key() -> Ed25519PrivateKey:
    """The Ed25519 private key used to mint internal JWTs (dev: per-process)."""
    return Ed25519PrivateKey.generate()


@lru_cache
def public_jwks() -> dict[str, Any]:
    """The public key as a JWKS document (what FastAPI verifies against)."""
    jwk: dict[str, Any] = json.loads(jwt.algorithms.OKPAlgorithm.to_jwk(signing_key().public_key()))
    jwk.update({"kid": _KID, "use": "sig", "alg": "EdDSA"})
    return {"keys": [jwk]}
