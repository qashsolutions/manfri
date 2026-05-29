"""Observability tests (WP 0.13) — trace_id end-to-end, W3C propagation, flags, Sentry.

The router-trace test needs a DB (skips without one); the rest are pure unit.
"""

from __future__ import annotations

import uuid

import pytest
from opentelemetry import trace

from app.db.session import tenant_transaction
from app.router import ContentHashCache, generate
from app.telemetry import (
    configure_tracing,
    current_trace_id,
    extract_trace_context,
    flags,
    get_tracer,
    init_sentry,
    inject_trace_context,
)

configure_tracing()

Seed = dict[str, uuid.UUID]
ECHO_SCHEMA: dict[str, object] = {
    "type": "object",
    "properties": {"echo": {"type": "string"}},
    "required": ["echo"],
}


def test_trace_id_present_within_span_absent_outside() -> None:
    assert current_trace_id() is None
    with get_tracer().start_as_current_span("unit"):
        tid = current_trace_id()
    assert tid is not None
    assert len(tid) == 32


def test_trace_context_injects_and_extracts() -> None:
    with get_tracer().start_as_current_span("unit"):
        carrier: dict[str, str] = {}
        inject_trace_context(carrier)
        inner = current_trace_id()
    assert "traceparent" in carrier
    extracted = extract_trace_context(carrier)
    span_ctx = trace.get_current_span(extracted).get_span_context()
    assert format(span_ctx.trace_id, "032x") == inner


def test_feature_flag_reads_env(monkeypatch: pytest.MonkeyPatch) -> None:
    assert flags.is_enabled("demo_flag") is False
    monkeypatch.setenv("MANFRIDAY_FLAG_DEMO_FLAG", "true")
    assert flags.is_enabled("demo_flag") is True


def test_sentry_init_is_noop_without_dsn(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("SENTRY_DSN", raising=False)
    assert init_sentry() is False


@pytest.mark.anyio
async def test_router_trace_id_joins_active_span(seed: Seed) -> None:
    org = seed["org_a"]
    with get_tracer().start_as_current_span("request"):
        async with tenant_transaction(org_id=org) as session:
            # Capture in the same scope the router measures it; the router must
            # stamp the trace that is active during the call.
            expected = current_trace_id()
            result = await generate(
                session,
                org_id=org,
                input={"text": "telemetry trace probe"},
                schema=ECHO_SCHEMA,
                prompt_version="echo/v1",
                cache=ContentHashCache(),
            )
    assert expected is not None
    assert result.trace_id == expected
