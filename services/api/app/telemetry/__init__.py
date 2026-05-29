"""Observability (WP 0.13): OpenTelemetry trace_id end-to-end, Sentry, feature flags.

One ``trace_id`` flows browser -> BFF -> FastAPI -> worker -> LLM; the router stamps
it on every AI Result and worker jobs carry the W3C traceparent. Self-hosted
Langfuse (in-VPC) for LLM traces is wired in deploy. Sentry is a no-op without a DSN.
"""

from __future__ import annotations

from app.telemetry.flags import FeatureFlags, flags
from app.telemetry.sentry import init_sentry
from app.telemetry.tracing import (
    configure_tracing,
    current_trace_id,
    extract_trace_context,
    get_tracer,
    inject_trace_context,
    instrument_fastapi,
)

__all__ = [
    "FeatureFlags",
    "configure_tracing",
    "current_trace_id",
    "extract_trace_context",
    "flags",
    "get_tracer",
    "init_sentry",
    "inject_trace_context",
    "instrument_fastapi",
]
