# ManFriday — Build Status & Execution Plan

> Living dashboard (updated 2026-05-31). Pairs with [`CLAUDE.md`](CLAUDE.md) (invariants/anchor),
> [`EXTRACTION_REPORT.md`](EXTRACTION_REPORT.md) (what the current code actually contains),
> [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md), [`docs/ROADMAP.md`](docs/ROADMAP.md), [`docs/PRD.md`](docs/PRD.md), [`docs/DECISIONS.md`](docs/DECISIONS.md).
> Legend: ✅ done · 🔭 next · ⬜ planned

## The goal
A **lean recruiter tool** — résumé database + authenticity flags + JD→candidate matching + 15-question screening
+ lightweight triage + mass outreach — on **TypeScript + Supabase + Vercel**, that recruiters use daily and that
**learns from captured feedback** over time. Transparent, human-decided; **not** EEOC-regulated software.

## Direction (ratified 2026-05-31): the lean pivot
We are moving **off** the heavyweight, EEOC-compliant, AWS-hosted design and **onto** a lean TypeScript stack on
Supabase + Vercel. **Dropped:** EEOC posture (adverse-impact/4-5ths, demographics, adverse-action notices),
Presidio redaction-before-egress, per-tenant envelope encryption / crypto-shred, hash-chained audit, AWS
(Fargate/KMS/S3/VPC), Neon, Temporal, WorkOS, Redis/Arq, Terraform. **Kept:** the Next.js UI, strict org
isolation via RLS, the transparent matcher, the deterministic parser + 49-skill lexicon, the advisory-flags
pattern, lightweight human-set triage, consent-based outreach. The **good design ports; the heavy infra does not.**

---

## What exists today (the port-from baseline)

The current codebase is **Python (FastAPI + Arq) + a Next.js UI**. It is the thing being **rebuilt in TypeScript**,
not the go-forward design. A full, code-grounded inventory is in [`EXTRACTION_REPORT.md`](EXTRACTION_REPORT.md).
Headlines:

- ✅ **Next.js 15 UI (`web/`)** — dashboard · login · candidates (+detail, +bulk import) · requisitions (+detail) ·
  outreach · settings · screening. Behind a `DATA_SOURCE=mock|api` seam (mock is the dev default). **This stays.**
- ✅ **Working in Python today** (to be ported to TS): org-isolated CRUD, deterministic résumé parser + 49-skill
  lexicon, transparent skill-overlap matcher (`0.8·core + 0.2·nice`), JD completeness, advisory review flags,
  proposals, consent-based outreach **audience** (no send), all RLS-scoped; 23 API endpoints; 85 tests.
- ⚠️ **Being retired:** the Python `services/api` + `services/workers`, plus the Python-era compliance machinery
  (run-provenance tables, Presidio redaction, envelope crypto, hash-chained audit) — **not ported**.
- ⛔ **Not built anywhere yet:** real LLM/embedding calls (router is echo-only today), embeddings/pgvector
  retrieval, the 15-question screening generator, authenticity-flag analysis as a sub-agent set, outreach **send**.

---

## 🔭 Phase 1 — the real loop, live on Supabase + Vercel (NEXT — TS rebuild)
The TypeScript rebuild stands up the everyday recruiter loop on the lean stack. Plan: [`docs/PHASE_1_BUILD.md`](docs/PHASE_1_BUILD.md).

- ⬜ **Supabase project** — Postgres 16 + pgvector + Storage + Auth; schema with **RLS keyed on the `org_id` JWT claim**.
- ⬜ **Org + recruiter auth** — Supabase Auth; all recruiters in an org share the org's data.
- ⬜ **Résumé upload (single + bulk) → parse** into structured fields (deterministic v1; port the Python parser + lexicon to TS).
- ⬜ **Authenticity flags at upload** — bounded sub-agent checks (deterministic rules: implausible
  experience↔skill-count, timeline inconsistencies, duplicates; optional LLM analysis) → **advisory** flags; recruiter decides.
- ⬜ **JD upload → CORE/NICE weighted skills + completeness score**.
- ⬜ **Match & rank** the org's candidates vs a JD (transparent skill overlap; port the matcher to TS).
- ⬜ **Screening questions** — generate **15** (5 simple / 5 medium / 5 hard) grounded in résumé + JD, each with a model answer key; recruiter-graded, AI-assist optional.
- ⬜ **Lightweight triage** — recruiter-set `candidate.status` + `proposal.outcome`; per `(candidate × req)`.
- ⬜ **Mass outreach send** — email provider + consent/unsubscribe (CAN-SPAM). **Send is in scope now** (no longer counsel-gated).
- ⬜ **Capture feedback/outcomes** from day one.

## ⬜ Phase 2 — accuracy upgrades
Embeddings / hybrid matching via **pgvector + an embedding API**, better parsing, feedback-tuned ranking.

## ⬜ Phase 3 — learn over time
The capture-feedback → improve loop. *Optional later:* deeper agents, ATS integration, more verticals.

---

## Infra
- **Supabase** — Postgres 16 + pgvector + **Storage** + **Auth**. Org isolation = **RLS on the `org_id` Supabase
  Auth JWT claim**. Supersedes Neon and the old non-BYPASSRLS-role + `SET LOCAL`-GUC pattern. Setup: [`docs/SUPABASE.md`](docs/SUPABASE.md).
- **Vercel** — hosts the Next.js app **and** the TypeScript backend (Route Handlers / Server Actions).
- **Background jobs** — TS-friendly pattern (Supabase scheduled functions / Inngest / Trigger.dev / QStash / Vercel cron); exact pick is a rebuild decision.
- **Removed:** AWS (Fargate/KMS/S3/VPC), Terraform, Redis/Arq, Temporal, WorkOS.

## Open decisions (see [`docs/DECISIONS.md`](docs/DECISIONS.md))
- **Email provider** for outreach send (deliverability + CAN-SPAM) — pick during the Phase-1 build.
- **Per-candidate cost ceiling** (D6) — provisional ≤ ~$0.20; confirm at volume.
- **Vendor ToS / Privacy Policy + CAN-SPAM** (D3) — light counsel touch, not a launch gate.
- Most prior items (stack, tenancy, vertical, taxonomy, retention) are **ratified**; the EEOC/legal blockers are **removed**.
