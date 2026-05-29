"""The model router seam (WP 0.9) — no service calls a provider directly.

``generate()`` pipeline: redaction pre-hook (mandatory) -> provider policy
(ZDR/no-train; fail-closed) -> versioned prompt -> backend call -> structured-output
validation with one self-repair -> rehydrate -> content-hash cache -> provenance
stamp (generation_run) + trace_id. Phase 0 exercises it with the echo task; no real
provider is called.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import jsonschema
from sqlalchemy.ext.asyncio import AsyncSession

from app.provenance import create_generation_run
from app.redaction import redact, rehydrate
from app.router.backends import EchoBackend, ModelBackend
from app.router.cache import ContentHashCache, content_hash
from app.router.policy import DEFAULT_REGISTRY, Provider, Sensitivity, select_provider

_PROMPTS_ROOT = Path(__file__).resolve().parents[4] / "packages" / "prompts"
_DEFAULT_CACHE = ContentHashCache()


class OutputValidationError(RuntimeError):
    """Backend output failed schema validation even after one self-repair retry."""


@dataclass
class Result:
    output: dict[str, Any]
    model_id: str
    prompt_version: str
    input_hash: str
    trace_id: str
    cost: float
    cached: bool
    generation_run_id: uuid.UUID | None


def _load_prompt(prompt_version: str) -> str:
    # Git history IS the version pin; prompt_version is the path under packages/prompts.
    return (_PROMPTS_ROOT / prompt_version / "prompt.md").read_text(encoding="utf-8")


def _redact_input(data: dict[str, Any]) -> tuple[dict[str, Any], dict[str, str]]:
    """Redact every string value; return (redacted_input, merged reversible token map)."""
    redacted: dict[str, Any] = {}
    token_map: dict[str, str] = {}
    for key, value in data.items():
        if isinstance(value, str):
            result = redact(value)
            redacted[key] = result.redacted_text
            token_map.update(result.token_map)
        else:
            redacted[key] = value
    return redacted, token_map


async def generate(
    session: AsyncSession,
    *,
    org_id: uuid.UUID,
    input: dict[str, Any],
    schema: dict[str, Any],
    prompt_version: str,
    sensitivity: Sensitivity = Sensitivity.C3_RESTRICTED,
    registry: tuple[Provider, ...] = DEFAULT_REGISTRY,
    backend: ModelBackend | None = None,
    cache: ContentHashCache | None = None,
) -> Result:
    """Run one routed generation. See module docstring for the pipeline."""
    backend = backend if backend is not None else EchoBackend()
    cache = cache if cache is not None else _DEFAULT_CACHE

    # 1. Redaction pre-hook (mandatory): raw PII never reaches a provider.
    redacted_input, token_map = _redact_input(input)

    # 2. Provider policy — fail closed if nothing satisfies the sensitivity.
    provider = select_provider(sensitivity, registry)

    # 3. Versioned prompt.
    prompt = _load_prompt(prompt_version)

    # 4. Content-hash cache: identical inputs return the same result, no re-bill.
    input_hash = content_hash(redacted_input)
    cache_key = cache.key(
        prompt_version=prompt_version, model_id=provider.model_id, input_hash=input_hash
    )
    hit: Result | None = cache.get(cache_key)
    if hit is not None:
        return Result(
            output=hit.output,
            model_id=hit.model_id,
            prompt_version=prompt_version,
            input_hash=input_hash,
            trace_id=hit.trace_id,
            cost=0.0,
            cached=True,
            generation_run_id=hit.generation_run_id,
        )

    # 5. Backend call + structured-output validation with one self-repair retry.
    raw = await backend.complete(
        model_id=provider.model_id, prompt=prompt, redacted_input=redacted_input
    )
    try:
        jsonschema.validate(raw, schema)
    except jsonschema.ValidationError:
        raw = await backend.complete(
            model_id=provider.model_id,
            prompt=f"{prompt}\n\nReturn ONLY JSON valid against the provided schema.",
            redacted_input=redacted_input,
        )
        try:
            jsonschema.validate(raw, schema)
        except jsonschema.ValidationError as exc:
            raise OutputValidationError(str(exc)) from exc

    # 6. Rehydrate identity into the output for the caller.
    output = {k: (rehydrate(v, token_map) if isinstance(v, str) else v) for k, v in raw.items()}

    # 7. Provenance stamp + trace id (Langfuse, self-hosted in-VPC, wired in WP 0.13).
    run_id = await create_generation_run(
        session,
        org_id=org_id,
        model_id=provider.model_id,
        prompt_version=prompt_version,
        input_hash=input_hash,
    )
    trace_id = str(uuid.uuid4())

    result = Result(
        output=output,
        model_id=provider.model_id,
        prompt_version=prompt_version,
        input_hash=input_hash,
        trace_id=trace_id,
        cost=0.0,
        cached=False,
        generation_run_id=run_id,
    )
    cache.put(cache_key, result)
    return result
