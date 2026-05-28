"""Arq worker configuration — Phase 0 skeleton.

Only a trivial ``ping`` task exists, to prove the worker wiring. WP 0.11 adds the
real ingestion worker (virus scan -> store immutable resume -> emit audit event)
running in a **network-egress-denied** sandbox, with the originating
``org_id``/``client_id`` carried as **immutable claims in the queue message** —
no job ever runs with ambient all-tenant authority. The Redis connection is
supplied from settings/secrets at deploy time, never hardcoded here.
"""

from __future__ import annotations

from typing import Any


async def ping(ctx: dict[str, Any]) -> str:
    """Trivial task proving the worker executes. Replaced by ingestion in WP 0.11."""
    return "pong"


class WorkerSettings:
    """Arq ``WorkerSettings``. ``redis_settings`` is injected at deploy time (WP 0.11)."""

    functions = [ping]
