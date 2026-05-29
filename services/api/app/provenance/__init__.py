"""Run-provenance helpers — pin model + prompt + params + input hash on every AI write.

**WP 0.4 (landed):** ``parse_run`` / ``scoring_run`` / ``generation_run`` tables +
the tall ``score`` table whose ``scoring_run_id`` is NOT NULL — a score cannot
exist without its provenance (invariant #2), verified by a bare-insert-rejection
test. The multi-model router (WP 0.9) is the production caller of these helpers.
"""

from __future__ import annotations

from app.provenance.runs import (
    add_score,
    create_generation_run,
    create_parse_run,
    create_scoring_run,
)

__all__ = [
    "add_score",
    "create_generation_run",
    "create_parse_run",
    "create_scoring_run",
]
