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
    return str(resume_id)


class WorkerSettings:
    """Arq WorkerSettings. Jobs carry tenant scope as immutable message claims."""

    functions = [ingest]
    redis_settings = RedisSettings.from_dsn(REDIS_URL)
