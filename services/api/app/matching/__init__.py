"""Deterministic candidate↔requisition matching (Phase 1).

This is the **integrated product's** matcher: rank an org's candidates against a
requisition by **transparent skill overlap** — pure arithmetic over the weighted
JD skills and each résumé's parsed (non-PII) skills. No opaque model, no LLM, fully
reproducible (invariant #6: countables are SQL/arithmetic). It is **advisory and
ranking only** — a human still decides (invariants #1, #8); nothing here writes a
triage or rejects a candidate.

It also computes a deterministic **JD completeness** signal and deterministic
**advisory review flags** (data-quality only — e.g. no contact info, sparse résumé).
These flag data gaps for a recruiter; they are NOT fraud detection (that is a fenced,
later-phase capability) and never auto-reject.
"""

from __future__ import annotations

from app.matching.flags import REVIEW_FLAG_RULES, ReviewFlag, review_flags
from app.matching.score import (
    MATCHER_VERSION,
    JdCompleteness,
    MatchBreakdown,
    SkillMatch,
    jd_completeness,
    score_candidate,
)

__all__ = [
    "MATCHER_VERSION",
    "REVIEW_FLAG_RULES",
    "JdCompleteness",
    "MatchBreakdown",
    "ReviewFlag",
    "SkillMatch",
    "jd_completeness",
    "review_flags",
    "score_candidate",
]
