"""Phase 0 walking skeleton (WP 0.14) — the end-to-end exit-criterion proof.

A recruiter "logs in" (mint + verify the internal JWT), and an upload is ingested
into an ISOLATED tenant: stored immutably and audited, with the audit chain intact.
Ties together auth (0.10) -> RLS (0.2) -> ingestion worker (0.11) -> immutable
resume (0.6) -> append-only hash-chained audit (0.5).
"""

from __future__ import annotations

import uuid
from pathlib import Path

import pytest
from sqlalchemy import text

from app.audit import verify_audit_chain
from app.auth import mint_internal_jwt, scoped_transaction, verify_internal_jwt
from app.ingestion import ingest_resume
from app.storage.filesystem import FilesystemObjectStore

Seed = dict[str, uuid.UUID]


@pytest.mark.anyio
async def test_walking_skeleton_login_upload_stored_audited(seed: Seed, tmp_path: Path) -> None:
    org, cand = seed["org_a"], seed["cand_a"]
    store = FilesystemObjectStore(tmp_path)

    # 1. "Login": mint + verify the internal JWT (auth -> verified tenant claims).
    claims = verify_internal_jwt(
        mint_internal_jwt(sub=str(uuid.uuid4()), org_id=str(org), roles=["recruiter"])
    )

    # 2. Upload -> ingestion pipeline (validate -> immutable store -> audit), scoped
    #    to the verified org claim — no ambient authority.
    resume_id = await ingest_resume(
        store,
        org_id=claims.org_uuid,
        candidate_id=cand,
        content=b"%PDF-1.4 synthetic cv",
        filename="cv.pdf",
    )

    # 3. Read back through an RLS transaction scoped from the verified claims.
    async with scoped_transaction(claims) as session:
        resume = (
            await session.execute(
                text("select is_current, content_hash from resume where id = :id"),
                {"id": resume_id},
            )
        ).one()
        audited = (
            await session.execute(
                text(
                    "select count(*) from audit_event "
                    "where org_id = :o and action = 'resume.ingested'"
                ),
                {"o": org},
            )
        ).scalar_one()
        chain = await verify_audit_chain(session, org_id=org)

    assert resume.is_current is True  # stored immutably as the current version
    assert resume.content_hash  # content-addressed
    assert audited == 1  # the upload was audited
    assert chain == [(org, True, None)]  # the hash chain verifies unbroken
