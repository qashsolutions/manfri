"""Append-only hash-chained audit writer + verifier (WP 0.5) — invariant #5.

``audit_event`` is the authoritative decision record. Append via
:func:`append_audit_event` (the single write path); each row chains to its
predecessor for the org via ``hash = sha256(prev_hash || canonical_payload)``.
:func:`verify_audit_chain` independently recomputes every hash and reports any
break — so tampering (e.g. a break-glass superuser UPDATE) is *detected* even
though the app role has no UPDATE/DELETE grant. WORM anchoring is Phase 1.

The canonical payload is deterministic JSON (sorted keys, UTC-normalised
timestamp) so the writer and the verifier always agree regardless of session
timezone or key ordering.
"""

from __future__ import annotations

import hashlib
import json
import uuid
from datetime import UTC, datetime
from typing import Any, NamedTuple

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import AuditEvent

GENESIS = ""


class ChainResult(NamedTuple):
    """Per-org verification outcome."""

    org_id: uuid.UUID
    ok: bool
    broken_at_seq: int | None


def _canonical(
    *,
    org_id: uuid.UUID,
    actor_id: uuid.UUID | None,
    actor_type: str,
    action: str,
    entity_type: str | None,
    entity_id: uuid.UUID | None,
    before: dict[str, Any] | None,
    after: dict[str, Any] | None,
    occurred_at: datetime,
) -> str:
    doc = {
        "org_id": str(org_id),
        "actor_id": str(actor_id) if actor_id is not None else None,
        "actor_type": actor_type,
        "action": action,
        "entity_type": entity_type,
        "entity_id": str(entity_id) if entity_id is not None else None,
        "before": before,
        "after": after,
        "occurred_at": occurred_at.astimezone(UTC).isoformat(),
    }
    return json.dumps(doc, sort_keys=True, separators=(",", ":"))


def _chain_hash(prev_hash: str, canonical: str) -> str:
    return hashlib.sha256((prev_hash + canonical).encode("utf-8")).hexdigest()


async def append_audit_event(
    session: AsyncSession,
    *,
    org_id: uuid.UUID,
    action: str,
    actor_type: str = "system",
    actor_id: uuid.UUID | None = None,
    entity_type: str | None = None,
    entity_id: uuid.UUID | None = None,
    before: dict[str, Any] | None = None,
    after: dict[str, Any] | None = None,
) -> str:
    """Append one event to the org's chain and return its hash."""
    # Serialize chain appends per org so concurrent writers cannot fork the chain.
    await session.execute(
        text("select pg_advisory_xact_lock(hashtextextended(:k, 0))"), {"k": str(org_id)}
    )
    prev = (
        await session.execute(
            text("select hash from audit_event where org_id = :o order by seq desc limit 1"),
            {"o": org_id},
        )
    ).scalar_one_or_none()
    prev_hash: str = prev if prev is not None else GENESIS
    occurred_at = datetime.now(tz=UTC)
    canonical = _canonical(
        org_id=org_id,
        actor_id=actor_id,
        actor_type=actor_type,
        action=action,
        entity_type=entity_type,
        entity_id=entity_id,
        before=before,
        after=after,
        occurred_at=occurred_at,
    )
    digest = _chain_hash(prev_hash, canonical)
    session.add(
        AuditEvent(
            org_id=org_id,
            actor_id=actor_id,
            actor_type=actor_type,
            action=action,
            entity_type=entity_type,
            entity_id=entity_id,
            before_jsonb=before,
            after_jsonb=after,
            prev_hash=prev_hash,
            hash=digest,
            occurred_at=occurred_at,
        )
    )
    await session.flush()
    return digest


async def verify_audit_chain(
    session: AsyncSession, org_id: uuid.UUID | None = None
) -> list[ChainResult]:
    """Walk each org's chain in seq order, recompute every hash, report continuity."""
    if org_id is not None:
        org_ids: list[uuid.UUID] = [org_id]
    else:
        org_ids = list(
            (await session.execute(text("select distinct org_id from audit_event"))).scalars().all()
        )

    results: list[ChainResult] = []
    for org in org_ids:
        rows = (
            (
                await session.execute(
                    text(
                        "select seq, actor_id, actor_type, action, entity_type, entity_id, "
                        "before_jsonb, after_jsonb, prev_hash, hash, occurred_at "
                        "from audit_event where org_id = :o order by seq"
                    ),
                    {"o": org},
                )
            )
            .mappings()
            .all()
        )
        result = ChainResult(org_id=org, ok=True, broken_at_seq=None)
        expected_prev = GENESIS
        for row in rows:
            canonical = _canonical(
                org_id=org,
                actor_id=row["actor_id"],
                actor_type=row["actor_type"],
                action=row["action"],
                entity_type=row["entity_type"],
                entity_id=row["entity_id"],
                before=row["before_jsonb"],
                after=row["after_jsonb"],
                occurred_at=row["occurred_at"],
            )
            recomputed = _chain_hash(row["prev_hash"], canonical)
            if row["prev_hash"] != expected_prev or row["hash"] != recomputed:
                result = ChainResult(org_id=org, ok=False, broken_at_seq=row["seq"])
                break
            expected_prev = row["hash"]
        results.append(result)
    return results
