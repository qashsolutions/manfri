"""Multi-model router — the single LLM seam. No service calls a provider directly.

**WP 0.9 (landed):** ``generate(input, schema, prompt_version, policy)`` runs the
pipeline — mandatory redaction pre-hook (WP 0.8) -> per-sensitivity provider policy
(ZDR/no-train, fail-closed) -> versioned prompt from ``packages/prompts`` ->
backend call -> structured-output validation + one self-repair -> rehydrate ->
content-hash cache -> ``generation_run`` provenance stamp + trace_id. Phase 0 is
exercised by the echo task (no real provider). LiteLLM backs real calls in Phase 1.

Invariants #4 (redaction before egress) and #2 (run-provenance on every AI write)
are enforced here.
"""

from __future__ import annotations

from app.router.backends import EchoBackend, LiteLLMBackend, ModelBackend
from app.router.cache import ContentHashCache, content_hash
from app.router.generate import OutputValidationError, Result, generate
from app.router.policy import (
    DEFAULT_REGISTRY,
    NoCompliantProviderError,
    Provider,
    Sensitivity,
    select_provider,
)

__all__ = [
    "DEFAULT_REGISTRY",
    "ContentHashCache",
    "EchoBackend",
    "LiteLLMBackend",
    "ModelBackend",
    "NoCompliantProviderError",
    "OutputValidationError",
    "Provider",
    "Result",
    "Sensitivity",
    "content_hash",
    "generate",
    "select_provider",
]
