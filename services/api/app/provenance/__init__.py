"""Run-provenance helpers — pin model + prompt + params + input hash on every AI write.

Empty in WP 0.1. Filled by WP 0.4: helpers that create/return
``parse_run`` / ``scoring_run`` / ``generation_run`` rows. The constraint
``score.scoring_run_id NOT NULL REFERENCES scoring_run(id)`` (and analogues)
makes provenance structural, not conventional — a bare INSERT without a run id
must be rejected (verified by a CI gate).

Invariant #2: regenerating the same run config reproduces the result.
"""
