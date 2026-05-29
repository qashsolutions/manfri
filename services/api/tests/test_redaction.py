"""PII redaction tests (WP 0.8) — invariant #4. No DB needed (pure Presidio + spaCy).

Synthetic data only.
"""

from __future__ import annotations

from app.redaction import redact, rehydrate

# Synthetic. "Jane Doe" appears twice (coreference); the card must be stripped, not tokenized.
SAMPLE = (
    "Jane Doe, a senior engineer, can be reached at jane.doe@example.com. "
    "Jane Doe previously worked at Acme Corp in Boston. "
    "Payment card 4111111111111111 is on file."
)


def test_redact_tokenizes_and_rehydrates_identity() -> None:
    result = redact(SAMPLE)
    # Identity is gone from the redacted text...
    assert "Jane Doe" not in result.redacted_text
    assert "jane.doe@example.com" not in result.redacted_text
    # ...but rehydration restores the tokenized identity exactly.
    restored = rehydrate(result.redacted_text, result.token_map)
    assert "Jane Doe" in restored
    assert "jane.doe@example.com" in restored
    # Capability (titles/skills) stays untouched.
    assert "senior engineer" in result.redacted_text


def test_credit_card_is_stripped_not_reversible() -> None:
    result = redact(SAMPLE)
    assert "4111111111111111" not in result.redacted_text
    assert "[REDACTED_CREDIT_CARD]" in result.redacted_text
    # A stripped identifier never enters the reversible map, so it can't be sent or restored.
    assert "4111111111111111" not in result.token_map.values()
    assert "4111111111111111" not in rehydrate(result.redacted_text, result.token_map)


def test_coreference_uses_one_stable_placeholder() -> None:
    result = redact(SAMPLE)
    name_tokens = {p for p, v in result.token_map.items() if v == "Jane Doe"}
    assert len(name_tokens) == 1
    assert result.redacted_text.count(next(iter(name_tokens))) == 2  # both mentions, one token


def test_spans_carry_correct_original_offsets() -> None:
    result = redact(SAMPLE)
    for span in result.spans:
        # Offsets must point at the real entity text in the source (citations resolve).
        assert SAMPLE[span.original_start : span.original_end]
        if span.action == "tokenize":
            assert (
                SAMPLE[span.original_start : span.original_end]
                == result.token_map[span.placeholder]
            )
