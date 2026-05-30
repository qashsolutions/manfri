"""Deterministic advisory review flags (Phase 1).

Data-quality signals for a recruiter, derived purely from a résumé's parsed
(non-PII) ``parsed_jsonb``. They are **advisory only** (invariant #8): they surface
gaps to a human and never auto-reject, never fold into a fit score, and are never
shown to a client. This is explicitly NOT fraud / fake-experience detection — that
is a separate, fenced, later-phase capability.
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from typing import Any

_SPARSE_CHARS = 500


@dataclass(frozen=True)
class ReviewFlag:
    """One advisory data-quality signal on a résumé."""

    code: str
    severity: str  # "low" | "medium" | "high"
    message: str


# Each rule maps a parsed_jsonb payload to a flag, or None if it doesn't apply.
ReviewFlagRule = Callable[[dict[str, Any]], ReviewFlag | None]


def _no_contact(parsed: dict[str, Any]) -> ReviewFlag | None:
    contact = parsed.get("contact") or {}
    if not contact.get("has_email") and not contact.get("has_phone"):
        return ReviewFlag(
            code="no_contact",
            severity="high",
            message="No email or phone detected — outreach may not be possible.",
        )
    return None


def _no_skills(parsed: dict[str, Any]) -> ReviewFlag | None:
    if not parsed.get("skills"):
        return ReviewFlag(
            code="no_skills_detected",
            severity="medium",
            message="No recognized skills detected in the résumé text.",
        )
    return None


def _sparse_resume(parsed: dict[str, Any]) -> ReviewFlag | None:
    chars = (parsed.get("stats") or {}).get("text_chars", 0)
    if chars < _SPARSE_CHARS:
        return ReviewFlag(
            code="sparse_resume",
            severity="low",
            message="Résumé text is very short — extracted detail may be incomplete.",
        )
    return None


def _no_experience(parsed: dict[str, Any]) -> ReviewFlag | None:
    if parsed.get("total_experience_years") is None:
        return ReviewFlag(
            code="no_experience_signal",
            severity="low",
            message="No dates or durations found — experience could not be estimated.",
        )
    return None


REVIEW_FLAG_RULES: tuple[ReviewFlagRule, ...] = (
    _no_contact,
    _no_skills,
    _sparse_resume,
    _no_experience,
)


def review_flags(parsed_jsonb: dict[str, Any] | None) -> list[ReviewFlag]:
    """Return advisory data-quality flags for a parsed résumé (empty if unparsed)."""
    if not parsed_jsonb:
        return []
    flags = [rule(parsed_jsonb) for rule in REVIEW_FLAG_RULES]
    return [f for f in flags if f is not None]
