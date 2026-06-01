"""Unit tests for the deterministic resume parser (no DB).

Cover the routing, the precision-biased skill lexicon, the reproducible experience
estimate, and the PII boundary of ``parsed_jsonb``.
"""

from __future__ import annotations

import json

from app.parsing.extract import choose_method, extract_text
from app.parsing.resume import parse_resume_bytes, parse_resume_text
from app.parsing.skills import find_skills


def test_choose_method_routes_by_type_name_and_magic() -> None:
    assert choose_method(b"x", content_type="application/pdf", filename=None) == "pdf"
    assert choose_method(b"%PDF-1.7 ...", content_type=None, filename=None) == "pdf"
    assert choose_method(b"x", content_type=None, filename="cv.PDF") == "pdf"
    assert choose_method(b"x", content_type=None, filename="cv.docx") == "docx"
    assert choose_method(b"hello", content_type="text/plain", filename="cv.txt") == "text"


def test_extract_text_decodes_plain_text() -> None:
    extracted = extract_text(b"hello world", content_type="text/plain")
    assert extracted.method == "text"
    assert extracted.text == "hello world"


def test_find_skills_matches_canonical_forms() -> None:
    skills = find_skills("Experienced in Python, FastAPI and PostgreSQL; some k8s.")
    assert {"Python", "FastAPI", "PostgreSQL", "Kubernetes"} <= set(skills)


def test_find_skills_handles_punctuated_names() -> None:
    skills = find_skills("Strong C++ and C# background; built with Node.js.")
    assert {"C++", "C#", "Node.js"} <= set(skills)


def test_find_skills_is_precision_biased() -> None:
    # Bare ambiguous words must NOT trip distinctive aliases.
    assert find_skills("I need to go to the store and rest a while.") == []
    assert find_skills("machine room with a single node") == []


def test_experience_years_explicit() -> None:
    assert parse_resume_text("Senior dev with 7 years of experience").total_experience_years == 7.0
    assert parse_resume_text("10+ years building systems").total_experience_years == 10.0


def test_experience_years_from_dated_range() -> None:
    assert parse_resume_text("Worked 2015 to 2020 at Acme").total_experience_years == 5.0


def test_experience_years_present_is_anchored_to_latest_year_not_clock() -> None:
    # "present" anchors to the latest year mentioned (2021), so the result is reproducible.
    text = "At Acme from 2015 until present. Most recent ship date 2021."
    assert parse_resume_text(text).total_experience_years == 6.0


def test_experience_years_absent() -> None:
    assert parse_resume_text("No dates or durations here").total_experience_years is None


def test_contact_presence_detected() -> None:
    parsed = parse_resume_text("Reach me at jane@example.com or (415) 555-0100")
    assert parsed.has_email is True
    assert parsed.has_phone is True
    assert parse_resume_text("no contact details").has_email is False


def test_link_domains_normalised() -> None:
    parsed = parse_resume_text("https://github.com/jane and https://www.linkedin.com/in/jane")
    assert parsed.link_domains == ["github.com", "linkedin.com"]


def test_parsed_jsonb_carries_no_cleartext_pii() -> None:
    parsed = parse_resume_bytes(
        b"Jane Roe jane.roe@example.com (415) 555-0100 Python developer",
        content_type="text/plain",
    )
    blob = json.dumps(parsed.to_jsonb())
    assert "jane.roe@example.com" not in blob
    assert "555-0100" not in blob
    assert parsed.to_jsonb()["contact"] == {"has_email": True, "has_phone": True}
    assert "Python" in parsed.to_jsonb()["skills"]
