"""OpenTelemetry tracing — one trace_id end-to-end (WP 0.13).

Phase 0 installs a TracerProvider with no exporter (spans are created + propagated
but not shipped); prod adds an OTLP exporter via ``OTEL_EXPORTER_OTLP_ENDPOINT``.
The router stamps the active trace_id onto every AI Result, and worker jobs carry
the W3C ``traceparent`` so one trace flows browser -> BFF -> FastAPI -> worker -> LLM.
"""

from __future__ import annotations

from collections.abc import Mapping, MutableMapping
from functools import lru_cache
from typing import Any

from opentelemetry import context as otel_context
from opentelemetry import trace
from opentelemetry.sdk.resources import Resource
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.trace.propagation.tracecontext import TraceContextTextMapPropagator

_PROPAGATOR = TraceContextTextMapPropagator()


@lru_cache
def _provider() -> TracerProvider:
    provider = TracerProvider(resource=Resource.create({"service.name": "manfriday-api"}))
    trace.set_tracer_provider(provider)
    return provider


def configure_tracing() -> None:
    """Idempotently install the TracerProvider."""
    _provider()


def get_tracer() -> trace.Tracer:
    _provider()
    return trace.get_tracer("manfriday")


def current_trace_id() -> str | None:
    """The active span's trace id as 32-hex, or None outside a recording span."""
    ctx = trace.get_current_span().get_span_context()
    return format(ctx.trace_id, "032x") if ctx.is_valid else None


def inject_trace_context(carrier: MutableMapping[str, str]) -> MutableMapping[str, str]:
    """Inject the W3C traceparent into a carrier (e.g. an outgoing worker job message)."""
    _PROPAGATOR.inject(carrier)
    return carrier


def extract_trace_context(carrier: Mapping[str, str]) -> otel_context.Context:
    """Extract a trace context from a carrier (e.g. an incoming worker job message)."""
    return _PROPAGATOR.extract(carrier)


def instrument_fastapi(app: Any) -> None:
    """Instrument a FastAPI app so each request is a span (one trace_id per request).

    Uses the official ASGI instrumentation, which manages the OTel context with
    proper token detach — unlike a hand-rolled BaseHTTPMiddleware, it never leaks
    span context across requests.
    """
    _provider()
    from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor

    FastAPIInstrumentor.instrument_app(app)
