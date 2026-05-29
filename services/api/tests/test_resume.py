"""Immutable versioned resume tests (WP 0.6).

Uses a tmp-dir filesystem object store + conftest's DB fixtures; skips without a
migrated DB.
"""

from __future__ import annotations

import uuid
from pathlib import Path

import pytest
from sqlalchemy import text

from app.db.session import tenant_transaction
from app.resumes import store_resume
from app.storage.filesystem import FilesystemObjectStore

Seed = dict[str, uuid.UUID]


@pytest.mark.anyio
async def test_upload_stores_immutable_row_and_object(seed: Seed, tmp_path: Path) -> None:
    store = FilesystemObjectStore(tmp_path)
    org, cand = seed["org_a"], seed["cand_a"]
    async with tenant_transaction(org_id=org) as session:
        resume = await store_resume(
            session, store, org_id=org, candidate_id=cand, content=b"resume v1 bytes"
        )
    assert resume.version == 1
    assert resume.is_current is True
    assert resume.superseded_by is None
    # Original is retrievable from the store, byte-for-byte.
    assert await store.get(key=f"{org}/{cand}/{resume.content_hash}") == b"resume v1 bytes"


@pytest.mark.anyio
async def test_identical_content_is_deduped(seed: Seed, tmp_path: Path) -> None:
    store = FilesystemObjectStore(tmp_path)
    org, cand = seed["org_a"], seed["cand_a"]
    async with tenant_transaction(org_id=org) as session:
        first = await store_resume(session, store, org_id=org, candidate_id=cand, content=b"same")
        second = await store_resume(session, store, org_id=org, candidate_id=cand, content=b"same")
        count = (
            await session.execute(
                text("select count(*) from resume where candidate_id = :c"), {"c": cand}
            )
        ).scalar_one()
    assert first.id == second.id
    assert count == 1


@pytest.mark.anyio
async def test_new_content_supersedes_previous_version(seed: Seed, tmp_path: Path) -> None:
    store = FilesystemObjectStore(tmp_path)
    org, cand = seed["org_a"], seed["cand_a"]
    async with tenant_transaction(org_id=org) as session:
        v1 = await store_resume(session, store, org_id=org, candidate_id=cand, content=b"v1")
        v1_id = v1.id
        v2 = await store_resume(session, store, org_id=org, candidate_id=cand, content=b"v2")
        v2_id = v2.id
        assert v2.version == 2
        assert v2.is_current is True
        prev = (
            await session.execute(
                text("select is_current, superseded_by from resume where id = :id"), {"id": v1_id}
            )
        ).one()
    assert prev.is_current is False
    assert prev.superseded_by == v2_id
