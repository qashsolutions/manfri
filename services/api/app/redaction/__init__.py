"""PII redaction/tokenization stage — sits between the app and the router (invariant #4).

**WP 0.8 (landed):** Presidio + a spaCy NER pass detect PII; identity entities are
*tokenized* (stable placeholders + a per-request reversible map → coreference
survives, outputs rehydrate), hard identifiers and protected-class signals are
*stripped* (never reversible, never sent), and capability (titles/skills/dates)
is kept. Original-text offsets are preserved so explainability citations resolve.
Embeddings are generated from redacted text.

The router (WP 0.9) calls :func:`redact` before any provider egress and
:func:`rehydrate` on the way back. Honest caveat: redaction is imperfect (names
in narrative can leak) — which is why ZDR provider contracts are mandatory.
"""

from __future__ import annotations

from app.redaction.engine import RedactionResult, RedactionSpan, redact, rehydrate

__all__ = ["RedactionResult", "RedactionSpan", "redact", "rehydrate"]
