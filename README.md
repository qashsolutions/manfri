# ManFriday

Multi-tenant, **explainable, human-in-the-loop** AI for recruiting and candidate
screening — serving staff-aug agencies and direct-hire companies on one codebase.
This is **employment-decision software built under EEOC scrutiny**: every score,
question, and triage is reproducible, evidence-backed, audited, and **human-decided**.

> **Status:** Phase 0 (Foundations & Compliance Skeleton). Walking skeleton only —
> no screening, scoring, or triage logic yet. See [`docs/PHASE_0.md`](docs/PHASE_0.md).

## Documentation

| Doc | What's in it |
|---|---|
| [`CLAUDE.md`](CLAUDE.md) | Always-loaded context anchor: invariants, stack, phase map, glossary. |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | Full design (13 sections). |
| [`docs/ROADMAP.md`](docs/ROADMAP.md) | The 7 phases (compliance-before-scale). |
| [`docs/PRD.md`](docs/PRD.md) | Product requirements + MVP cut line. |
| [`docs/DECISIONS.md`](docs/DECISIONS.md) | Proposed defaults for open product/legal calls. |
| [`docs/PHASE_0.md`](docs/PHASE_0.md) | The buildable Phase 0 spec + work packages (WP 0.1–0.14). |

## Repository layout

```
manfriday/
├── web/            Next.js 15 BFF + recruiter UI (TS strict)        — pnpm workspace
├── services/
│   ├── api/        FastAPI AI services (tenancy, ingestion, router) — uv workspace
│   └── workers/    Arq background workers (sandboxed ingestion)     — uv workspace
├── packages/
│   ├── contracts/  OpenAPI 3.1 spec (source of truth) + TS types
│   └── prompts/    Versioned prompt templates (git = version pin)
├── infra/          Terraform skeleton (AWS + Vercel + Neon)
├── db/             Seed + cross-tenant leak-probe fixtures
└── .github/workflows/  CI: typecheck · lint · build · ruff · mypy · pytest · image
```

## Quickstart

Prerequisites: **Node ≥20** + **pnpm 11**, **uv** + **Python 3.12**. Full setup and
the cloud-provisioning boundary are in [`SETUP.md`](SETUP.md).

```bash
# JS/TS workspace
pnpm install
pnpm --filter @manfriday/contracts gen   # generate API types from the OpenAPI spec
pnpm -r typecheck && pnpm -r lint
pnpm --filter @manfriday/web dev          # Next.js BFF → http://localhost:3000

# Python workspace
uv sync --all-packages
uv run uvicorn app.main:app --reload --app-dir services/api   # FastAPI → :8000/health
uv run pytest
```

## The non-negotiables

No fully automated rejection · parameter-by-parameter explainability · immutable
run-provenance on every AI write · RLS on every tenant table (pgvector included) ·
redaction before any LLM egress · append-only hash-chained audit. The full list is
[`CLAUDE.md` §4](CLAUDE.md). If a change would break one, stop and flag it.
