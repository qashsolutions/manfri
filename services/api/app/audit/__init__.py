"""Append-only, hash-chained audit — the authoritative decision record (all phases).

Empty in WP 0.1. Filled by WP 0.5: an INSERT-only ``audit_event`` writer where
``hash = sha256(prev_hash || canonical_json(payload))`` chains each row to the
previous one, plus a verifier job that walks the chain and asserts continuity
(run in CI on fixtures, on a schedule in prod). UPDATE/DELETE are revoked at the
DB level. WORM/S3-Object-Lock anchoring of the chain head is deferred to Phase 1.

Invariant #5.
"""
