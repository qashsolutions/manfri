"""PII redaction engine (WP 0.8) — invariant #4.

Detects PII with Microsoft Presidio (predefined recognizers + a spaCy NER pass),
then applies the ManFriday policy:

* **Tokenize, don't strip** identity entities (name, email, phone, org, location):
  replace with a stable placeholder backed by a per-request reversible map, so
  coreference survives and outputs can be rehydrated.
* **Always strip** (never reversible) hard identifiers and protected-class signals
  (SSN, cards, passport/licence, NRP). These never enter the token map, so they
  cannot be sent out or restored.
* **Keep** capability (titles, skills, dates/tenure) — ``DATE_TIME`` is not redacted.

The result carries original-text offsets per entity, so explainability citations
still resolve back to the source. Embeddings are generated from redacted text.
"""

from __future__ import annotations

from dataclasses import dataclass
from functools import lru_cache
from typing import Any

from presidio_analyzer import AnalyzerEngine
from presidio_analyzer.nlp_engine import NlpEngineProvider

# Hard identifiers + protected-class signals: STRIP (never tokenize-for-send).
_STRIP: frozenset[str] = frozenset(
    {
        "US_SSN",
        "CREDIT_CARD",
        "US_PASSPORT",
        "US_DRIVER_LICENSE",
        "US_BANK_NUMBER",
        "IBAN_CODE",
        "MEDICAL_LICENSE",
        "CRYPTO",
        "NRP",  # nationality / religious / political — protected class
    }
)
# Identity entities to TOKENIZE (reversible). Capability (titles/skills/dates) stays.
_TOKEN_PREFIX: dict[str, str] = {
    "PERSON": "CANDIDATE_NAME",
    "EMAIL_ADDRESS": "EMAIL",
    "PHONE_NUMBER": "PHONE",
    "LOCATION": "LOCATION",
    "ORGANIZATION": "COMPANY",
    "URL": "URL",
    "IP_ADDRESS": "IP",
}


@dataclass(frozen=True)
class RedactionSpan:
    """One detected entity, with original-text offsets so citations resolve."""

    entity_type: str
    action: str  # "tokenize" | "strip"
    original_start: int
    original_end: int
    placeholder: str


@dataclass
class RedactionResult:
    redacted_text: str
    token_map: dict[str, str]  # placeholder -> original (tokenized only; never sent out)
    spans: list[RedactionSpan]


@lru_cache
def _analyzer() -> AnalyzerEngine:
    provider = NlpEngineProvider(
        nlp_configuration={
            "nlp_engine_name": "spacy",
            "models": [{"lang_code": "en", "model_name": "en_core_web_sm"}],
        }
    )
    return AnalyzerEngine(nlp_engine=provider.create_engine())


def _action(entity_type: str) -> str:
    if entity_type in _STRIP:
        return "strip"
    if entity_type in _TOKEN_PREFIX:
        return "tokenize"
    return "keep"


def redact(text: str) -> RedactionResult:
    """Detect PII and produce redacted text + a reversible token map + offset spans."""
    # Sort by start, then longest span, then highest score — so when detections
    # overlap (e.g. CREDIT_CARD vs a weak US_BANK_NUMBER on the same digits) the
    # strongest, widest one wins and the overlaps are skipped below.
    results: list[Any] = sorted(
        _analyzer().analyze(text=text, language="en"),
        key=lambda r: (r.start, -(r.end - r.start), -r.score),
    )

    value_to_placeholder: dict[str, str] = {}
    counters: dict[str, int] = {}
    token_map: dict[str, str] = {}
    spans: list[RedactionSpan] = []
    out: list[str] = []
    cursor = 0
    last_end = -1

    for r in results:
        action = _action(r.entity_type)
        if action == "keep" or r.start < last_end:  # keep capability; skip overlaps
            continue
        out.append(text[cursor : r.start])
        original = text[r.start : r.end]

        if action == "strip":
            placeholder = f"[REDACTED_{r.entity_type}]"
        elif original in value_to_placeholder:  # coreference: same value -> same token
            placeholder = value_to_placeholder[original]
        else:
            prefix = _TOKEN_PREFIX[r.entity_type]
            counters[prefix] = counters.get(prefix, 0) + 1
            placeholder = f"[{prefix}_{counters[prefix]}]"
            value_to_placeholder[original] = placeholder
            token_map[placeholder] = original

        out.append(placeholder)
        spans.append(
            RedactionSpan(
                entity_type=r.entity_type,
                action=action,
                original_start=r.start,
                original_end=r.end,
                placeholder=placeholder,
            )
        )
        cursor = r.end
        last_end = r.end

    out.append(text[cursor:])
    return RedactionResult(redacted_text="".join(out), token_map=token_map, spans=spans)


def rehydrate(text: str, token_map: dict[str, str]) -> str:
    """Restore tokenized originals into ``text``; stripped PII stays gone (not reversible)."""
    for placeholder, original in token_map.items():
        text = text.replace(placeholder, original)
    return text
