"""Deterministic skill lexicon + matcher for resume parsing (Phase 1).

A small, curated, **versioned** lexicon (canonical name -> aliases). Matching is
case-insensitive and edge-bounded. It is intentionally a fixed dictionary rather
than a model, so a parse is reproducible (invariant #2); changing the lexicon bumps
:data:`SKILL_DICTIONARY_VERSION`, which a ``parse_run``'s ``params`` records so the
exact lexicon that produced a result is always known.

The lexicon is **precision-biased**: ambiguous bare aliases (e.g. a lone ``"go"``
or ``"ml"``) are omitted in favour of distinctive forms (``"golang"``,
``"machine learning"``) to avoid false positives on ordinary prose.
"""

from __future__ import annotations

import re

SKILL_DICTIONARY_VERSION = "skills@1"

# Canonical skill -> recognised aliases (compared case-insensitively). The canonical
# spelling is what we emit/store. Keep aliases distinctive to stay precision-biased.
_SKILLS: dict[str, tuple[str, ...]] = {
    "Python": ("python",),
    "JavaScript": ("javascript",),
    "TypeScript": ("typescript",),
    "Java": ("java",),
    "Go": ("golang",),
    "Rust": ("rust",),
    "C++": ("c++", "cpp"),
    "C#": ("c#", "csharp"),
    "Ruby": ("ruby",),
    "PHP": ("php",),
    "Swift": ("swift",),
    "Kotlin": ("kotlin",),
    "Scala": ("scala",),
    "SQL": ("sql",),
    "PostgreSQL": ("postgresql", "postgres"),
    "MySQL": ("mysql",),
    "MongoDB": ("mongodb",),
    "Redis": ("redis",),
    "React": ("react", "reactjs", "react.js"),
    "Next.js": ("next.js", "nextjs"),
    "Vue": ("vue.js", "vuejs"),
    "Angular": ("angular",),
    "Node.js": ("node.js", "nodejs"),
    "Django": ("django",),
    "FastAPI": ("fastapi",),
    "Flask": ("flask",),
    "Spring": ("spring boot", "springboot"),
    "AWS": ("aws", "amazon web services"),
    "GCP": ("gcp", "google cloud"),
    "Azure": ("azure",),
    "Docker": ("docker",),
    "Kubernetes": ("kubernetes", "k8s"),
    "Terraform": ("terraform",),
    "Git": ("git",),
    "GraphQL": ("graphql",),
    "Kafka": ("kafka",),
    "Spark": ("apache spark",),
    "Machine Learning": ("machine learning",),
    "Deep Learning": ("deep learning",),
    "TensorFlow": ("tensorflow",),
    "PyTorch": ("pytorch",),
    "Pandas": ("pandas",),
    "NumPy": ("numpy",),
    "Linux": ("linux",),
    "Tableau": ("tableau",),
    "Power BI": ("power bi", "powerbi"),
    "Salesforce": ("salesforce",),
    "Figma": ("figma",),
    "Excel": ("microsoft excel",),
}


def _compile() -> list[tuple[str, re.Pattern[str]]]:
    """Compile one edge-bounded, case-insensitive pattern per canonical skill.

    The custom edges (``+ # .`` allowed inside, not at the boundary) let ``C++``,
    ``C#`` and ``Node.js`` match without ``\\b`` misfiring on their punctuation.
    """
    compiled: list[tuple[str, re.Pattern[str]]] = []
    for canonical, aliases in _SKILLS.items():
        alts = "|".join(sorted((re.escape(a) for a in aliases), key=len, reverse=True))
        # Edge-bound on alphanumerics only. Punctuated names (C++, C#, Node.js) are
        # matched via their full aliases, so a trailing '.'/'+'/'#' must NOT block a
        # match — otherwise a sentence-final "k8s." or "Node.js." would be missed.
        pattern = re.compile(
            rf"(?<![A-Za-z0-9])(?:{alts})(?![A-Za-z0-9])",
            re.IGNORECASE,
        )
        compiled.append((canonical, pattern))
    return compiled


_COMPILED = _compile()


def find_skills(text: str) -> list[str]:
    """Return the canonical skills present in ``text`` (sorted, de-duplicated)."""
    found = {canonical for canonical, pattern in _COMPILED if pattern.search(text)}
    return sorted(found)
