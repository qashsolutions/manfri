"""Multi-model router — the single LLM seam. No service calls a provider directly.

Empty in WP 0.1. Filled by WP 0.9:

    generate(task, input, schema, policy) -> Result

Pipeline: mandatory redaction pre-hook (WP 0.8) -> per-sensitivity provider
policy (ZDR/no-training only for C2/C3) -> versioned prompt from
``packages/prompts`` -> LiteLLM call -> structured-output validation + one
self-repair -> content-hash response cache -> stamp model_id/prompt_version/
input_hash into the relevant ``*_run`` row + emit a Langfuse trace.

Invariant #4 (redaction before egress) and #2 (run-provenance on every AI write)
are enforced here.
"""
