"""Arq ingestion worker (WP 0.11).

Each job carries the originating org_id/candidate_id as **immutable claims** — no
job runs with ambient all-tenant authority. The task delegates to the egress-free
ingestion pipeline (validate -> immutable store -> audit), scoped to the job's org.
Redis connection from ``REDIS_URL``. The gVisor/Firecracker egress-denied sandbox
and ClamAV are deploy-time; the worker code makes no network calls.
"""

from __future__ import annotations

import base64
import os
import uuid
from typing import Any

from arq.connections import RedisSettings

from app.ingestion import ingest_resume
from app.parsing import parse_and_store
from app.storage import get_object_store

REDIS_URL = os.environ.get("REDIS_URL", "redis://localhost:6379")


async def ingest(
    ctx: dict[str, Any],
    *,
    org_id: str,
    candidate_id: str,
    filename: str,
    content_type: str,
    content_b64: str,
) -> str:
    """Arq task: ingest one uploaded resume; return the stored resume id."""
    resume_id = await ingest_resume(
        get_object_store(),
        org_id=uuid.UUID(org_id),
        candidate_id=uuid.UUID(candidate_id),
        content=base64.b64decode(content_b64),
        content_type=content_type,
        filename=filename,
    )
    # Chain deterministic parsing as its own job so it can be re-run independently
    # (e.g. on a parser-version bump). ``ctx['redis']`` is the Arq pool at runtime; in
    # unit tests the task runs with an empty ctx and simply skips the enqueue.
    redis = ctx.get("redis")
    if redis is not None:
        await redis.enqueue_job("parse_resume", org_id=org_id, resume_id=str(resume_id))
    return str(resume_id)


async def parse_resume(ctx: dict[str, Any], *, org_id: str, resume_id: str) -> str:
    """Arq task: deterministically parse a stored resume; return the parse_run id."""
    del ctx  # tenant scope travels in the message args, never ambient context
    run_id = await parse_and_store(
        get_object_store(),
        org_id=uuid.UUID(org_id),
        resume_id=uuid.UUID(resume_id),
    )
    return str(run_id)


class WorkerSettings:
    """Arq WorkerSettings. Jobs carry tenant scope as immutable message claims."""

    functions = [ingest, parse_resume]
    redis_settings = RedisSettings.from_dsn(REDIS_URL)
