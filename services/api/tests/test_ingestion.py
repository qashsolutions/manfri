"""Resume ingestion tests (WP 0.11) — egress-free pipeline + the Arq task wrapper.

Fixtures in conftest.py; skip without a migrated DB.
"""

from __future__ import annotations

import base64
import uuid
from pathlib import Path

import pytest
from sqlalchemy import text

from app.db.session import tenant_transaction
from app.ingestion import IngestRejectedError, ingest_resume
from app.storage.filesystem import FilesystemObjectStore
from worker.settings import ingest

Seed = dict[str, uuid.UUID]
PDF = b"%PDF-1.4 synthetic resume bytes"


@pytest.mark.anyio
async def test_ingest_stores_immutable_resume_and_audits(seed: Seed, tmp_path: Path) -> None:
    store = FilesystemObjectStore(tmp_path)
    org, cand = seed["org_a"], seed["cand_a"]
    resume_id = await ingest_resume(
        store, org_id=org, candidate_id=cand, content=PDF, filename="cv.pdf"
    )
    async with tenant_transaction(org_id=org) as session:
        stored = (
            await session.execute(
                text("select content_hash from resume where id = :id"), {"id": resume_id}
            )
        ).scalar_one()
        audited = (
            await session.execute(
                text(
                    "select count(*) from audit_event "
                    "where org_id = :o and action = 'resume.ingested'"
                ),
                {"o": org},
            )
        ).scalar_one()
    assert stored
    assert audited == 1


@pytest.mark.anyio
async def test_ingest_rejects_malware(seed: Seed, tmp_path: Path) -> None:
    store = FilesystemObjectStore(tmp_path)
    with pytest.raises(IngestRejectedError):
        await ingest_resume(
            store,
            org_id=seed["org_a"],
            candidate_id=seed["cand_a"],
            content=b"resume EICAR-STANDARD-ANTIVIRUS-TEST-FILE here",
        )


@pytest.mark.anyio
async def test_ingest_rejects_oversized(seed: Seed, tmp_path: Path) -> None:
    store = FilesystemObjectStore(tmp_path)
    with pytest.raises(IngestRejectedError):
        await ingest_resume(
            store,
            org_id=seed["org_a"],
            candidate_id=seed["cand_a"],
            content=b"a" * (10 * 1024 * 1024 + 1),
        )


@pytest.mark.anyio
async def test_worker_ingest_task_delegates(seed: Seed) -> None:
    # The Arq task wrapper decodes the message and runs the pipeline scoped to the job's org.
    org, cand = seed["org_a"], seed["cand_a"]
    resume_id = await ingest(
        {},
        org_id=str(org),
        candidate_id=str(cand),
        filename="cv.pdf",
        content_type="application/pdf",
        content_b64=base64.b64encode(PDF).decode(),
    )
    assert uuid.UUID(resume_id)
