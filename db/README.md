# `db/` — seed data & leak-probe fixtures

Holds SQL seed data and the fixtures for the **cross-tenant leak probe**
(PHASE_0.md §14), the Phase 0 de-risking spike that must pass in CI before
anything is built on the isolation thesis.

- `fixtures/` — two-org datasets (Org A / Org B) used by the leak probe to prove
  that RLS, pgvector KNN, and the worker path never surface another tenant's rows.

**Synthetic data only** — no real candidate PII (docs/DECISIONS.md D8).

Migrations themselves live with the API service (`services/api/app/db`, Alembic).
The leak probe and fixtures are authored in **WP 0.3**; this is the placeholder.
