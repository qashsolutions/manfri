"""Model backends for the router (WP 0.9).

Phase 0 uses :class:`EchoBackend` (deterministic, no egress, no API keys) to
exercise the seam. :class:`LiteLLMBackend` (lazy litellm import) is the real
provider call for Phase 1+.
"""

from __future__ import annotations

import json
from typing import Any, Protocol


class ModelBackend(Protocol):
    async def complete(
        self, *, model_id: str, prompt: str, redacted_input: dict[str, Any]
    ) -> dict[str, Any]: ...


class EchoBackend:
    """Deterministic echo backend — returns the redacted input under an ``echo`` key.

    Proves the router seam without provider egress. Records the inputs it saw so
    tests can assert redaction-before-egress.
    """

    def __init__(self) -> None:
        self.seen: list[dict[str, Any]] = []

    async def complete(
        self, *, model_id: str, prompt: str, redacted_input: dict[str, Any]
    ) -> dict[str, Any]:
        self.seen.append(redacted_input)
        return {"echo": str(redacted_input.get("text", ""))}


class LiteLLMBackend:
    """Real provider backend via LiteLLM (Phase 1+). litellm is imported lazily."""

    async def complete(
        self, *, model_id: str, prompt: str, redacted_input: dict[str, Any]
    ) -> dict[str, Any]:
        import litellm  # heavy import only when a real provider call happens

        response = await litellm.acompletion(
            model=model_id,
            messages=[
                {"role": "system", "content": prompt},
                {"role": "user", "content": json.dumps(redacted_input)},
            ],
            response_format={"type": "json_object"},
            temperature=0,
        )
        data: dict[str, Any] = json.loads(response["choices"][0]["message"]["content"])
        return data
