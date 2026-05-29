"""Immutable resume ingestion (WP 0.6).

:func:`store_resume` is the single path that lands a resume original: it
content-hashes the bytes, **dedupes** (identical content for a candidate returns
the existing immutable row), writes the original to object storage, and inserts a
new version row — superseding the previous current one (``is_current`` +
``superseded_by`` form the version chain). Resume content is never updated in
place; a new upload is a new row.

Parsing is Phase 1; the sandboxed, egress-denied ingestion *worker* is WP 0.11.
"""

from __future__ import annotations

import hashlib
import uuid

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import Resume
from app.storage.base import ObjectStore


async def store_resume(
    session: AsyncSession,
    store: ObjectStore,
    *,
    org_id: uuid.UUID,
    candidate_id: uuid.UUID,
    content: bytes,
    content_type: str = "application/pdf",
) -> Resume:
    """Store a resume original immutably and return its (new or deduped) row."""
    content_hash = hashlib.sha256(content).hexdigest()

    # Dedupe: identical content for this candidate is the same immutable row.
    existing = (
        await session.execute(
            select(Resume).where(
                Resume.candidate_id == candidate_id, Resume.content_hash == content_hash
            )
        )
    ).scalar_one_or_none()
    if existing is not None:
        return existing

    next_version = (
        await session.execute(
            text("select coalesce(max(version), 0) + 1 from resume where candidate_id = :c"),
            {"c": candidate_id},
        )
    ).scalar_one()

    # Demote the previous current version FIRST so the one-current-per-candidate
    # partial unique index never sees two current rows mid-transaction.
    current = (
        await session.execute(
            select(Resume).where(Resume.candidate_id == candidate_id, Resume.is_current.is_(True))
        )
    ).scalar_one_or_none()
    if current is not None:
        current.is_current = False
        await session.flush()

    key = f"{org_id}/{candidate_id}/{content_hash}"
    storage_uri = await store.put(key=key, data=content, content_type=content_type)

    resume = Resume(
        org_id=org_id,
        candidate_id=candidate_id,
        version=next_version,
        content_hash=content_hash,
        storage_uri=storage_uri,
        content_type=content_type,
        is_current=True,
    )
    session.add(resume)
    await session.flush()

    if current is not None:
        current.superseded_by = resume.id
        await session.flush()

    return resume
