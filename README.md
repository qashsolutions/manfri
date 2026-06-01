# ManFriday

A **lean recruiter tool** for staffing agencies — a résumé database, **advisory authenticity flags** at upload,
**JD → candidate matching**, generated **screening questions**, lightweight **triage**, and **mass outreach** —
built on **TypeScript + Supabase + Vercel**. The matching is **transparent and human-decided**: a recruiter
always makes the call; AI suggests, ranks, drafts, and flags, but never auto-rejects. Decisions and outcomes are
captured from day one so the ranking improves over time.

> **Status:** pivoting to the lean stack. The **Next.js UI (`web/`) is built**; the backend is being **rebuilt in
> TypeScript on Supabase** (the existing Python `services/` is being retired — a separate effort). This is **not**
> EEOC-regulated software; candidate data still gets pragmatic GDPR/CCPA hygiene. See
> [`STATUS.md`](STATUS.md) and the code inventory in [`EXTRACTION_REPORT.md`](EXTRACTION_REPORT.md).

## Documentation

| Doc | What's in it |
|---|---|
| [`CLAUDE.md`](CLAUDE.md) | Always-loaded context anchor: invariants, stack, phase map, glossary. |
| [`EXTRACTION_REPORT.md`](EXTRACTION_REPORT.md) | Code-grounded inventory of what exists today (the port-from source). |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | The lean design (TypeScript + Supabase). |
| [`docs/ROADMAP.md`](docs/ROADMAP.md) | The lean 3-phase product sequence. |
| [`docs/PRD.md`](docs/PRD.md) | Product requirements + Phase 1 cut line. |
| [`docs/DECISIONS.md`](docs/DECISIONS.md) | Decision log (ratified items + remaining open calls). |
| [`docs/PHASE_1_BUILD.md`](docs/PHASE_1_BUILD.md) | The buildable Phase 1 (TS-on-Supabase) plan. |
| [`docs/SUPABASE.md`](docs/SUPABASE.md) | Supabase project setup for the TS target. |
| [`docs/WEDGE_UI.md`](docs/WEDGE_UI.md) | UI information architecture + route/file map. |

## The stack

| Layer | Choice |
|---|---|
| Frontend | Next.js 15 (App Router) + React 19, TS strict, on **Vercel** — built, in `web/` |
| Backend | **TypeScript** — Next.js Route Handlers / Server Actions |
| Database + vectors | **Supabase Postgres + pgvector** |
| Object storage | **Supabase Storage** |
| Auth | **Supabase Auth** (org + recruiter accounts) |
| Isolation | **Postgres RLS** keyed on the `org_id` claim in the Supabase Auth JWT |
| Background jobs | TS-friendly: Supabase scheduled functions / a queue (Inngest, Trigger.dev, QStash) / Vercel cron |

## Repository layout

```
manfriday/
├── web/            Next.js 15 UI (Vercel) — built, kept
├── services/       ⚠️ Python FastAPI + Arq worker — BEING RETIRED, rebuilt in TypeScript (separate effort)
├── packages/       contracts (OpenAPI→TS) + prompts — from the Python era; revisited in the rebuild
├── infra/          legacy Terraform skeleton — superseded by Vercel + Supabase
├── db/             leak-probe / validation helpers from the Python era
└── docs/           ARCHITECTURE · ROADMAP · PRD · DECISIONS · PHASE_1_BUILD · PHASE_0 · WEDGE_UI · SUPABASE
```

## The non-negotiables

Strict **org isolation** via RLS (pgvector included) · a **human recruiter decides** (AI never auto-rejects) ·
**capture decisions + outcomes** from day one to learn over time · a **plain append-only audit log**. The full
list is [`CLAUDE.md` §4](CLAUDE.md#4-engineering-invariants-do-not-violate). If a change would break one, stop and flag it.

> The legacy [`SETUP.md`](SETUP.md) describes the Python/pnpm+uv workspace and is being revised for the
> TypeScript-on-Supabase rebuild.
