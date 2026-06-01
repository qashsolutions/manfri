"""Unit tests for the deterministic matcher (no DB).

Cover skill-overlap scoring (CORE dominates), JD completeness, and advisory flags.
"""

from __future__ import annotations

from app.matching import jd_completeness, review_flags, score_candidate

JD = [
    ("Python", "core", 1.0),
    ("PostgreSQL", "core", 1.0),
    ("Docker", "core", 1.0),
    ("React", "nice", 0.5),
]


def test_score_full_core_coverage() -> None:
    b = score_candidate(["Python", "PostgreSQL", "Docker", "React"], JD)
    assert b.fit == 100
    assert b.missing_core == []
    assert set(b.matched) == {"Python", "PostgreSQL", "Docker", "React"}


def test_score_missing_core_dominates() -> None:
    # All NICE but no CORE → fit is low: 0.8*0 (core) + 0.2*1.0 (nice) = 0.2 → 20.
    b = score_candidate(["React"], JD)
    assert b.core_coverage == 0.0
    assert b.fit == 20
    assert "Python" in b.missing_core


def test_score_is_case_insensitive() -> None:
    b = score_candidate(["python", "postgresql", "docker"], JD)
    assert b.core_coverage == 1.0
    assert b.fit >= 80


def test_score_reproducible() -> None:
    assert score_candidate(["Python"], JD) == score_candidate(["Python"], JD)


def test_score_core_only_jd() -> None:
    core_only = [("Python", "core", 1.0), ("Go", "core", 1.0)]
    b = score_candidate(["Python"], core_only)
    assert b.fit == 50  # core-only JD scored purely on core coverage (0.5)


def test_completeness_full() -> None:
    c = jd_completeness(
        title="Senior Engineer",
        location="Remote",
        employment_type="full-time",
        jd_text="x" * 250,
        core_skill_count=4,
        nice_skill_count=2,
    )
    assert c.score == 100
    assert all(item.present for item in c.items)


def test_completeness_partial_has_hints() -> None:
    c = jd_completeness(
        title="Engineer",
        location=None,
        employment_type=None,
        jd_text="short",
        core_skill_count=1,
        nice_skill_count=0,
    )
    assert c.score < 100
    missing = {item.key for item in c.items if not item.present}
    assert {"location", "employment_type", "jd_text", "core_skills", "nice_skills"} <= missing


def test_review_flags_clean_resume() -> None:
    parsed = {
        "skills": ["Python"],
        "total_experience_years": 5.0,
        "contact": {"has_email": True, "has_phone": True},
        "stats": {"text_chars": 2000},
    }
    assert review_flags(parsed) == []


def test_review_flags_flags_gaps() -> None:
    parsed = {
        "skills": [],
        "total_experience_years": None,
        "contact": {"has_email": False, "has_phone": False},
        "stats": {"text_chars": 50},
    }
    codes = {f.code for f in review_flags(parsed)}
    assert codes == {"no_contact", "no_skills_detected", "sparse_resume", "no_experience_signal"}


def test_review_flags_empty_when_unparsed() -> None:
    assert review_flags(None) == []
