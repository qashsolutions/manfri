"""Resume ingestion pipeline (WP 0.11) — runs inside the egress-denied worker.

A job carries the originating ``org_id`` / ``candidate_id`` as **immutable claims**;
no job runs with ambient all-tenant authority. The pipeline validates the upload
(size cap + malware scan), stores it as an immutable resume (WP 0.6), and emits an
audit event (WP 0.5) — all inside ONE tenant transaction scoped to the job's org
(RLS, invariant #3).

Phase 0 stubs the malware scan (ClamAV is the production scanner) and relies on a
deploy-time egress-denied sandbox (Fargate no-egress / gVisor); the code here makes
no network calls. Parse logic is Phase 1.
"""

from __future__ import annotations

import uuid

from app.audit import append_audit_event
from app.db.session import tenant_transaction
from app.resumes import store_resume
from app.storage.base import ObjectStore

MAX_RESUME_BYTES = 10 * 1024 * 1024  # 10 MiB
_EICAR = b"EICAR-STANDARD-ANTIVIRUS-TEST-FILE"  # dev malware-scan sentinel


class IngestRejectedError(RuntimeError):
    """The upload failed a safety gate (size or malware scan)."""


def _scan_for_malware(content: bytes) -> None:
    # Dev stub: reject the EICAR test signature. ClamAV is the production scanner.
    if _EICAR in content:
        raise IngestRejectedError("malware signature detected")


async def ingest_resume(
    store: ObjectStore,
    *,
    org_id: uuid.UUID,
    candidate_id: uuid.UUID,
    content: bytes,
    content_type: str = "application/pdf",
    filename: str | None = None,
) -> uuid.UUID:
    """Validate, store immutably, and audit a resume upload; return the resume id."""
    if len(content) > MAX_RESUME_BYTES:
        raise IngestRejectedError(f"resume exceeds {MAX_RESUME_BYTES} bytes")
    _scan_for_malware(content)

    async with tenant_transaction(org_id=org_id) as session:
        resume = await store_resume(
            session,
            store,
            org_id=org_id,
            candidate_id=candidate_id,
            content=content,
            content_type=content_type,
        )
        await append_audit_event(
            session,
            org_id=org_id,
            action="resume.ingested",
            entity_type="resume",
            entity_id=resume.id,
            after={
                "filename": filename,
                "content_hash": resume.content_hash,
                "version": resume.version,
            },
        )
    return resume.id
