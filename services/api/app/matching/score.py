"""Deterministic skill-overlap scoring + JD completeness (Phase 1).

Pure functions, no I/O. ``score_candidate`` compares a résumé's parsed canonical
skills against a requisition's weighted CORE/NICE skills and returns a transparent
breakdown: which core/nice skills are covered, which core skills are missing, and a
0–100 fit number that is a documented weighted sum (invariant #6 — never an opaque
score). ``jd_completeness`` rates how fully a requisition is specified, so the
recruiter knows the rubric is solid before matching.

The fit number weights CORE coverage far above NICE (a missing core skill should
sink a match). It is **advisory ranking only** — a human decides (invariant #1).
"""

from __future__ import annotations

from dataclasses import dataclass, field

MATCHER_VERSION = "skill-overlap@1"

# Fit = CORE_WEIGHT * core_coverage + NICE_WEIGHT * nice_coverage, each coverage in
# [0,1] as the weighted fraction of that tier's skills present. CORE dominates.
_CORE_SHARE = 0.8
_NICE_SHARE = 0.2


@dataclass(frozen=True)
class SkillMatch:
    """One JD skill and whether the candidate's résumé evidences it."""

    name: str
    tier: str  # "core" | "nice"
    weight: float
    present: bool


@dataclass(frozen=True)
class MatchBreakdown:
    """Transparent, reproducible fit of one candidate to one requisition."""

    fit: int  # 0..100, a documented weighted sum (not opaque)
    core_coverage: float  # 0..1 weighted fraction of CORE skills present
    nice_coverage: float  # 0..1 weighted fraction of NICE skills present
    matched: list[str]
    missing_core: list[str]
    skills: list[SkillMatch] = field(default_factory=list)

    @property
    def matcher_version(self) -> str:
        return MATCHER_VERSION


def _coverage(weights_present: float, weights_total: float) -> float:
    return weights_present / weights_total if weights_total > 0 else 0.0


def score_candidate(
    candidate_skills: list[str],
    jd_skills: list[tuple[str, str, float]],
) -> MatchBreakdown:
    """Score one candidate. ``jd_skills`` is a list of ``(name, tier, weight)``.

    Comparison is case-insensitive on the canonical skill name. Reproducible: same
    inputs → same breakdown.
    """
    present = {s.casefold() for s in candidate_skills}
    core_total = core_have = nice_total = nice_have = 0.0
    matched: list[str] = []
    missing_core: list[str] = []
    skills: list[SkillMatch] = []

    for name, tier, weight in jd_skills:
        is_present = name.casefold() in present
        skills.append(SkillMatch(name=name, tier=tier, weight=weight, present=is_present))
        if tier == "core":
            core_total += weight
            if is_present:
                core_have += weight
            else:
                missing_core.append(name)
        else:
            nice_total += weight
            if is_present:
                nice_have += weight
        if is_present:
            matched.append(name)

    core_coverage = _coverage(core_have, core_total)
    nice_coverage = _coverage(nice_have, nice_total)
    # If a tier is absent from the JD, redistribute its share to the other tier so
    # the fit still spans 0..100 (a JD with only core skills is scored on core).
    if core_total > 0 and nice_total > 0:
        fit_fraction = _CORE_SHARE * core_coverage + _NICE_SHARE * nice_coverage
    elif core_total > 0:
        fit_fraction = core_coverage
    else:
        fit_fraction = nice_coverage

    return MatchBreakdown(
        fit=round(fit_fraction * 100),
        core_coverage=round(core_coverage, 4),
        nice_coverage=round(nice_coverage, 4),
        matched=matched,
        missing_core=missing_core,
        skills=skills,
    )


@dataclass(frozen=True)
class JdCompletenessItem:
    """One completeness check and whether the requisition satisfies it."""

    key: str
    present: bool
    hint: str


@dataclass(frozen=True)
class JdCompleteness:
    """Deterministic 0–100 rating of how fully a requisition is specified."""

    score: int
    items: list[JdCompletenessItem]


# (key, weight, hint shown when missing). Weights sum to 100.
_COMPLETENESS_CHECKS: list[tuple[str, int, str]] = [
    ("title", 15, "Add a clear job title."),
    ("location", 10, "Add a location or mark it remote."),
    ("employment_type", 10, "Specify employment type (full-time, contract, …)."),
    ("jd_text", 15, "Paste the full job description text."),
    ("core_skills", 30, "Add at least three CORE (must-have) skills."),
    ("nice_skills", 20, "Add at least one NICE-to-have skill."),
]


def jd_completeness(
    *,
    title: str | None,
    location: str | None,
    employment_type: str | None,
    jd_text: str | None,
    core_skill_count: int,
    nice_skill_count: int,
) -> JdCompleteness:
    """Rate requisition completeness deterministically (no I/O, reproducible)."""
    satisfied = {
        "title": bool(title and title.strip()),
        "location": bool(location and location.strip()),
        "employment_type": bool(employment_type and employment_type.strip()),
        "jd_text": bool(jd_text and len(jd_text.strip()) >= 200),
        "core_skills": core_skill_count >= 3,
        "nice_skills": nice_skill_count >= 1,
    }
    score = sum(weight for key, weight, _ in _COMPLETENESS_CHECKS if satisfied[key])
    items = [
        JdCompletenessItem(key=key, present=satisfied[key], hint=hint)
        for key, _, hint in _COMPLETENESS_CHECKS
    ]
    return JdCompleteness(score=score, items=items)
