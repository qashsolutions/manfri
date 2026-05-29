"""Deterministic resume parsing (Phase 1).

Public API: extract text from a resume's bytes, parse it into structured non-PII
signal, and persist it with run-provenance. No LLM, no network — see the submodule
docstrings for the PII and reproducibility boundaries.
"""

from __future__ import annotations

from app.parsing.extract import (
    ExtractedText,
    UnsupportedResumeFormat,
    choose_method,
    extract_text,
)
from app.parsing.pipeline import parse_and_store
from app.parsing.resume import (
    PARSER_MODEL_ID,
    PARSER_PROMPT_VERSION,
    ParsedResume,
    parse_resume_bytes,
    parse_resume_text,
)
from app.parsing.skills import SKILL_DICTIONARY_VERSION, find_skills

__all__ = [
    "PARSER_MODEL_ID",
    "PARSER_PROMPT_VERSION",
    "SKILL_DICTIONARY_VERSION",
    "ExtractedText",
    "ParsedResume",
    "UnsupportedResumeFormat",
    "choose_method",
    "extract_text",
    "find_skills",
    "parse_and_store",
    "parse_resume_bytes",
    "parse_resume_text",
]
