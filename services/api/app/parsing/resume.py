"""Deterministic resume field extraction (Phase 1).

Turns extracted text into a small, typed :class:`ParsedResume`. Everything here is
pure functions of the input text, so a parse is reproducible (invariant #2): the same
bytes + same parser version + same lexicon always yield the same structured output.

**PII boundary.** :meth:`ParsedResume.to_jsonb` — what we persist on ``resume.parsed_jsonb``
— deliberately carries only matching-relevant, non-identifying signal (skills, an
experience estimate, link *domains*, counts). Contact details are reported only as
*presence* booleans (``has_email`` / ``has_phone``); the raw values are never written to
``parsed_jsonb`` in cleartext. Capturing a candidate's contact info for outreach is the
candidate layer's job, into the envelope-encrypted ``candidate.pii_jsonb``.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any

from app.parsing.extract import extract_text
from app.parsing.skills import find_skills

PARSER_MODEL_ID = "deterministic-resume-parser@1"
PARSER_PROMPT_VERSION = "rules/resume@1"

_EMAIL_RE = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")
_PHONE_RE = re.compile(r"(?<!\d)(?:\+?\d[\s.-]?)?(?:\(?\d{3}\)?[\s.-]?)\d{3}[\s.-]?\d{4}(?!\d)")
_URL_RE = re.compile(r"https?://([A-Za-z0-9.-]+)", re.IGNORECASE)
_YEAR_RE = re.compile(r"\b(?:19|20)\d{2}\b")
_EXPLICIT_YEARS_RE = re.compile(r"(\d{1,2})\+?\s*years?\b", re.IGNORECASE)
_RANGE_RE = re.compile(
    r"\b((?:19|20)\d{2})\s*(?:-|–|—|to|until|through)\s*((?:19|20)\d{2}|present|current)\b",
    re.IGNORECASE,
)


@dataclass(frozen=True)
class ParsedResume:
    """Structured, reproducible extraction from one resume's text."""

    skills: list[str]
    total_experience_years: float | None
    has_email: bool
    has_phone: bool
    link_domains: list[str]
    text_chars: int
    extraction_method: str

    def to_jsonb(self) -> dict[str, Any]:
        """The non-PII payload persisted on ``resume.parsed_jsonb`` (see module docstring)."""
        return {
            "parser_version": PARSER_MODEL_ID,
            "skills": self.skills,
            "total_experience_years": self.total_experience_years,
            "link_domains": self.link_domains,
            "contact": {"has_email": self.has_email, "has_phone": self.has_phone},
            "stats": {"text_chars": self.text_chars},
            "extraction_method": self.extraction_method,
        }


def _link_domains(text: str) -> list[str]:
    domains: set[str] = set()
    for match in _URL_RE.finditer(text):
        host = match.group(1).lower().strip(".")
        if host.startswith("www."):
            host = host[4:]
        if host:
            domains.add(host)
    return sorted(domains)


def _experience_years(text: str) -> float | None:
    """Estimate total years of experience deterministically (no wall-clock).

    Combines explicit "N years" mentions with dated ranges. Open-ended ranges
    ("2016 - present") are anchored to the **latest year mentioned in the document**,
    not today, so the estimate is reproducible. Returns the maximum signal, or ``None``.
    """
    years_in_text = [int(m.group(0)) for m in _YEAR_RE.finditer(text)]
    anchor = max(years_in_text) if years_in_text else None

    candidates: list[float] = [float(int(m.group(1))) for m in _EXPLICIT_YEARS_RE.finditer(text)]
    for match in _RANGE_RE.finditer(text):
        start = int(match.group(1))
        end_token = match.group(2).lower()
        if end_token in ("present", "current"):
            if anchor is None:
                continue
            end = anchor
        else:
            end = int(end_token)
        if end >= start:
            candidates.append(float(end - start))

    return max(candidates) if candidates else None


def parse_resume_text(text: str, *, extraction_method: str = "text") -> ParsedResume:
    """Extract structured fields from already-extracted resume ``text``."""
    return ParsedResume(
        skills=find_skills(text),
        total_experience_years=_experience_years(text),
        has_email=bool(_EMAIL_RE.search(text)),
        has_phone=bool(_PHONE_RE.search(text)),
        link_domains=_link_domains(text),
        text_chars=len(text),
        extraction_method=extraction_method,
    )


def parse_resume_bytes(
    content: bytes, *, content_type: str | None, filename: str | None = None
) -> ParsedResume:
    """Extract text from raw resume ``content`` and parse it into a :class:`ParsedResume`."""
    extracted = extract_text(content, content_type=content_type, filename=filename)
    return parse_resume_text(extracted.text, extraction_method=extracted.method)
