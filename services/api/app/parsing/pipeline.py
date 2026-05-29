"""Resume parse pipeline (Phase 1) — read stored bytes, parse, persist with provenance.

:func:`parse_and_store` runs inside ONE tenant transaction (RLS-scoped to the job's
org, invariant #3). It reads the immutable resume original from object storage, parses
it deterministically, writes a ``parse_run`` provenance row FIRST and pins it on the
resume alongside the structured ``parsed_jsonb`` (invariant #2 — no parse persisted
without a run), then appends an audit event (invariant #5). The audit payload is
metadata only (counts/method), never extracted PII.

``input_hash`` is the resume's ``content_hash`` (sha256 of the bytes), so re-running the
same parser version over the same content reproduces the result.
"""

from __future__ import annotations

import uuid

from sqlalchemy import select

from app.audit import append_audit_event
from app.db.models import Resume
from app.db.session import tenant_transaction
from app.parsing.resume import PARSER_MODEL_ID, PARSER_PROMPT_VERSION, parse_resume_bytes
from app.parsing.skills import SKILL_DICTIONARY_VERSION
from app.provenance.runs import create_parse_run
from app.storage.base import ObjectStore


async def parse_and_store(
    store: ObjectStore, *, org_id: uuid.UUID, resume_id: uuid.UUID
) -> uuid.UUID:
    """Parse a stored resume and persist ``parsed_jsonb`` + its ``parse_run``; return the run id."""
    async with tenant_transaction(org_id=org_id) as session:
        resume = (await session.execute(select(Resume).where(Resume.id == resume_id))).scalar_one()

        key = f"{resume.org_id}/{resume.candidate_id}/{resume.content_hash}"
        content = await store.get(key=key)
        parsed = parse_resume_bytes(content, content_type=resume.content_type)

        run_id = await create_parse_run(
            session,
            org_id=org_id,
            model_id=PARSER_MODEL_ID,
            prompt_version=PARSER_PROMPT_VERSION,
            input_hash=resume.content_hash,
            params={
                "skills_lexicon": SKILL_DICTIONARY_VERSION,
                "extraction_method": parsed.extraction_method,
            },
        )
        resume.parsed_jsonb = parsed.to_jsonb()
        resume.parse_run_id = run_id
        await session.flush()

        await append_audit_event(
            session,
            org_id=org_id,
            action="resume.parsed",
            entity_type="resume",
            entity_id=resume.id,
            after={
                "parse_run_id": str(run_id),
                "extraction_method": parsed.extraction_method,
                "skills_found": len(parsed.skills),
                "text_chars": parsed.text_chars,
            },
        )
    return run_id
