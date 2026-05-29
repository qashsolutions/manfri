"""Model router seam tests (WP 0.9) — echo task. DB needed for provenance stamping.

Fixtures in conftest.py; skip without a migrated DB.
"""

from __future__ import annotations

import uuid

import pytest
from sqlalchemy import text

from app.db.session import tenant_transaction
from app.router import (
    ContentHashCache,
    EchoBackend,
    NoCompliantProviderError,
    Provider,
    Sensitivity,
    generate,
    select_provider,
)

Seed = dict[str, uuid.UUID]

ECHO_SCHEMA: dict[str, object] = {
    "type": "object",
    "properties": {"echo": {"type": "string"}},
    "required": ["echo"],
    "additionalProperties": False,
}


@pytest.mark.anyio
async def test_router_redacts_before_egress_and_rehydrates(seed: Seed) -> None:
    backend = EchoBackend()
    org = seed["org_a"]
    async with tenant_transaction(org_id=org) as session:
        result = await generate(
            session,
            org_id=org,
            input={"text": "Contact Jane Doe at jane.doe@example.com"},
            schema=ECHO_SCHEMA,
            prompt_version="echo/v1",
            backend=backend,
        )
    # The backend saw redacted input (no raw PII)...
    assert "Jane Doe" not in backend.seen[0]["text"]
    assert "jane.doe@example.com" not in backend.seen[0]["text"]
    # ...but the caller's output is rehydrated, and provenance + trace are stamped.
    assert "Jane Doe" in result.output["echo"]
    assert result.cached is False
    assert result.generation_run_id is not None
    assert result.trace_id


@pytest.mark.anyio
async def test_router_content_hash_cache_hit(seed: Seed) -> None:
    cache = ContentHashCache()
    org = seed["org_a"]
    payload = {"text": "Skills: Python, SQL, distributed systems"}
    async with tenant_transaction(org_id=org) as session:
        first = await generate(
            session,
            org_id=org,
            input=payload,
            schema=ECHO_SCHEMA,
            prompt_version="echo/v1",
            cache=cache,
        )
        second = await generate(
            session,
            org_id=org,
            input=payload,
            schema=ECHO_SCHEMA,
            prompt_version="echo/v1",
            cache=cache,
        )
    assert first.cached is False
    assert second.cached is True
    # Same result, reused provenance — not re-billed.
    assert second.generation_run_id == first.generation_run_id


@pytest.mark.anyio
async def test_router_stamps_generation_run(seed: Seed) -> None:
    org = seed["org_a"]
    async with tenant_transaction(org_id=org) as session:
        result = await generate(
            session, org_id=org, input={"text": "hi"}, schema=ECHO_SCHEMA, prompt_version="echo/v1"
        )
        row = (
            await session.execute(
                text("select model_id, prompt_version from generation_run where id = :id"),
                {"id": result.generation_run_id},
            )
        ).one()
    assert row.model_id == "echo-0"
    assert row.prompt_version == "echo/v1"


def test_policy_fails_closed_for_noncompliant_provider() -> None:
    leaky = (Provider(name="leaky", model_id="x", zdr=False, no_training=False, local=False),)
    with pytest.raises(NoCompliantProviderError):
        select_provider(Sensitivity.C3_RESTRICTED, leaky)
