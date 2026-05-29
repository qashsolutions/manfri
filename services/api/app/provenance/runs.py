"""Run-provenance helpers (WP 0.4).

The single code path that writes AI outputs creates a ``*_run`` row first and
returns its id; ``score`` rows then reference it via the NOT-NULL
``scoring_run_id`` FK, so no score can be persisted without provenance
(invariant #2). The multi-model router (WP 0.9) is the production caller.

Each run row pins ``model_id + prompt_version + params/weight_set + input_hash``;
combined with the response cache and temperature 0, re-running a config reproduces
the result.
"""

from __future__ import annotations

import uuid
from decimal import Decimal
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import GenerationRun, ParseRun, Score, ScoringRun


async def create_parse_run(
    session: AsyncSession,
    *,
    org_id: uuid.UUID,
    model_id: str,
    prompt_version: str,
    input_hash: str,
    params: dict[str, Any] | None = None,
) -> uuid.UUID:
    """Insert a parse_run row and return its id."""
    run = ParseRun(
        org_id=org_id,
        model_id=model_id,
        prompt_version=prompt_version,
        input_hash=input_hash,
        params=params or {},
    )
    session.add(run)
    await session.flush()
    return run.id


async def create_scoring_run(
    session: AsyncSession,
    *,
    org_id: uuid.UUID,
    model_id: str,
    prompt_version: str,
    input_snapshot_hash: str,
    weight_set: dict[str, Any] | None = None,
    screen_session_id: uuid.UUID | None = None,
) -> uuid.UUID:
    """Insert a scoring_run row and return its id."""
    run = ScoringRun(
        org_id=org_id,
        model_id=model_id,
        prompt_version=prompt_version,
        input_snapshot_hash=input_snapshot_hash,
        weight_set=weight_set or {},
        screen_session_id=screen_session_id,
    )
    session.add(run)
    await session.flush()
    return run.id


async def create_generation_run(
    session: AsyncSession,
    *,
    org_id: uuid.UUID,
    model_id: str,
    prompt_version: str,
    input_hash: str,
    params: dict[str, Any] | None = None,
) -> uuid.UUID:
    """Insert a generation_run row and return its id."""
    run = GenerationRun(
        org_id=org_id,
        model_id=model_id,
        prompt_version=prompt_version,
        input_hash=input_hash,
        params=params or {},
    )
    session.add(run)
    await session.flush()
    return run.id


async def add_score(
    session: AsyncSession,
    *,
    org_id: uuid.UUID,
    scoring_run_id: uuid.UUID,
    parameter: str,
    value: Decimal,
    max_value: Decimal,
    rationale_text: str | None = None,
    evidence_refs: dict[str, Any] | None = None,
    screen_session_id: uuid.UUID | None = None,
) -> uuid.UUID:
    """Insert one tall ``score`` row tied to its scoring_run (invariant #2)."""
    score = Score(
        org_id=org_id,
        scoring_run_id=scoring_run_id,
        parameter=parameter,
        value=value,
        max_value=max_value,
        rationale_text=rationale_text,
        evidence_refs=evidence_refs or {},
        screen_session_id=screen_session_id,
    )
    session.add(score)
    await session.flush()
    return score.id
