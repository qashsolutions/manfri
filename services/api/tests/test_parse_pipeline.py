"""Resume parse-pipeline tests (need a migrated DB; skip cleanly without one).

Assert invariant #2 (no parse persisted without a ``parse_run``), the PII-at-rest
boundary (no cleartext contact info in ``parsed_jsonb``), reproducibility, an audit
event (#5), and org isolation of the parse output (#3).
"""

from __future__ import annotations

import base64
import hashlib
import json
import uuid
from pathlib import Path

import pytest
from sqlalchemy import text

from app.db.session import tenant_transaction
from app.ingestion import ingest_resume
from app.parsing.pipeline import parse_and_store
from app.storage.filesystem import FilesystemObjectStore
from worker.settings import ingest
from worker.settings import parse_resume as parse_resume_task

Seed = dict[str, uuid.UUID]

RESUME = (
    b"Jane Roe\n"
    b"jane.roe@example.com\n"
    b"(415) 555-0100\n"
    b"Senior Engineer with 7 years of experience.\n"
    b"Skills: Python, FastAPI, PostgreSQL, Docker, Kubernetes, AWS.\n"
    b"https://github.com/janeroe https://www.linkedin.com/in/janeroe\n"
)


@pytest.mark.anyio
async def test_parse_and_store_writes_provenance_and_parsed(seed: Seed, tmp_path: Path) -> None:
    store = FilesystemObjectStore(tmp_path)
    org, cand = seed["org_a"], seed["cand_a"]
    resume_id = await ingest_resume(
        store, org_id=org, candidate_id=cand, content=RESUME, content_type="text/plain"
    )
    run_id = await parse_and_store(store, org_id=org, resume_id=resume_id)

    async with tenant_transaction(org_id=org) as session:
        parsed, pinned_run = (
            await session.execute(
                text("select parsed_jsonb, parse_run_id from resume where id = :id"),
                {"id": resume_id},
            )
        ).one()
        run_model, run_input_hash = (
            await session.execute(
                text("select model_id, input_hash from parse_run where id = :id"),
                {"id": run_id},
            )
        ).one()
        audited = (
            await session.execute(
                text(
                    "select count(*) from audit_event "
                    "where org_id = :o and action = 'resume.parsed'"
                ),
                {"o": org},
            )
        ).scalar_one()

    assert pinned_run == run_id  # invariant #2: parse is pinned to its run
    assert run_model == "deterministic-resume-parser@1"
    assert run_input_hash == hashlib.sha256(RESUME).hexdigest()  # reproducible input pin
    assert parsed["total_experience_years"] == 7.0
    assert "Python" in parsed["skills"]
    assert parsed["contact"] == {"has_email": True, "has_phone": True}
    assert "jane.roe@example.com" not in json.dumps(parsed)  # no cleartext PII at rest
    assert audited == 1


@pytest.mark.anyio
async def test_parse_is_reproducible(seed: Seed, tmp_path: Path) -> None:
    store = FilesystemObjectStore(tmp_path)
    org, cand = seed["org_a"], seed["cand_a"]
    resume_id = await ingest_resume(
        store, org_id=org, candidate_id=cand, content=RESUME, content_type="text/plain"
    )
    run_1 = await parse_and_store(store, org_id=org, resume_id=resume_id)
    async with tenant_transaction(org_id=org) as session:
        parsed_1 = (
            await session.execute(
                text("select parsed_jsonb from resume where id = :id"), {"id": resume_id}
            )
        ).scalar_one()
    run_2 = await parse_and_store(store, org_id=org, resume_id=resume_id)
    async with tenant_transaction(org_id=org) as session:
        parsed_2 = (
            await session.execute(
                text("select parsed_jsonb from resume where id = :id"), {"id": resume_id}
            )
        ).scalar_one()

    assert run_1 != run_2  # a fresh provenance row each run
    assert parsed_1 == parsed_2  # identical structured result


@pytest.mark.anyio
async def test_parse_output_is_org_isolated(seed: Seed, tmp_path: Path) -> None:
    store = FilesystemObjectStore(tmp_path)
    org_a, cand_a, org_b = seed["org_a"], seed["cand_a"], seed["org_b"]
    resume_id = await ingest_resume(
        store, org_id=org_a, candidate_id=cand_a, content=RESUME, content_type="text/plain"
    )
    run_id = await parse_and_store(store, org_id=org_a, resume_id=resume_id)

    async with tenant_transaction(org_id=org_b) as session:
        seen_run = (
            await session.execute(
                text("select count(*) from parse_run where id = :id"), {"id": run_id}
            )
        ).scalar_one()
        seen_resume = (
            await session.execute(
                text("select count(*) from resume where id = :id"), {"id": resume_id}
            )
        ).scalar_one()

    assert seen_run == 0  # org B cannot see org A's parse_run (invariant #3)
    assert seen_resume == 0


@pytest.mark.anyio
async def test_worker_parse_resume_task_delegates(seed: Seed) -> None:
    # ingest (empty ctx -> no auto-enqueue) then run the parse task; both use the
    # configured object store, mirroring the runtime two-job flow.
    org, cand = seed["org_a"], seed["cand_a"]
    resume_id = await ingest(
        {},
        org_id=str(org),
        candidate_id=str(cand),
        filename="cv.txt",
        content_type="text/plain",
        content_b64=base64.b64encode(RESUME).decode(),
    )
    run_id = await parse_resume_task({}, org_id=str(org), resume_id=resume_id)
    assert uuid.UUID(run_id)
