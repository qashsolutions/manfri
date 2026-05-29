"""Append-only, hash-chained audit — the authoritative decision record (all phases).

**WP 0.5 (landed):** ``audit_event`` is INSERT-only at the DB (manfriday_app has
no UPDATE/DELETE grant); each row chains to its predecessor for the org via
``hash = sha256(prev_hash || canonical_payload)``. :func:`append_audit_event` is
the single write path; :func:`verify_audit_chain` recomputes the chain and
reports any break, so tampering is detected (invariant #5). WORM / S3
Object-Lock anchoring of the chain head is deferred to Phase 1.
"""

from __future__ import annotations

from app.audit.chain import ChainResult, append_audit_event, verify_audit_chain

__all__ = ["ChainResult", "append_audit_event", "verify_audit_chain"]
