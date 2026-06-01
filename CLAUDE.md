# ManFriday — Project Context (CLAUDE.md)

> **Read this first.** This file is the canonical, always-loaded context anchor for the ManFriday
> project so we never lose the thread across sessions. It is a *map and a contract*, not the full
> design — the deep reasoning lives in [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) and
> [`docs/ROADMAP.md`](docs/ROADMAP.md). When those and this file disagree, the docs win on detail;
> this file wins on "what must never be violated."
>
> **Direction (ratified 2026-05-31): LEAN rebuild.** ManFriday is a **lean recruiter tool** built on
> **TypeScript + Supabase + Vercel** — *not* a heavyweight, EEOC-regulated, AWS-hosted platform. The
> earlier compliance-first architecture (adverse-impact monitoring, demographics, Presidio
> redaction-before-egress, per-tenant envelope encryption / crypto-shred, hash-chained audit, AWS
> Fargate/KMS/S3/VPC, Neon, Temporal, WorkOS, Redis/Arq) has been **dropped**. This is **not**
> EEOC-regulated employment-decision software; candidate data is still PII and gets pragmatic
> GDPR/CCPA hygiene (soft-delete + hard-delete on request), not a courtroom-grade compliance stack.
>
> **Code status:** the **Next.js web UI (`web/`) is built and stays.** The existing **Python
> `services/api` (FastAPI) + `services/workers` (Arq)** backend is being **retired and rebuilt in
> TypeScript** (Next.js Route Handlers / Server Actions on Supabase) as a **separate follow-up
> effort** — these docs describe the **TypeScript target**, not the Python code. A code-grounded
> inventory of what exists today is in [`EXTRACTION_REPORT.md`](EXTRACTION_REPORT.md). Live execution
> tracker: [`STATUS.md`](STATUS.md). See [§15 Where We Are / What's Next](#15-where-we-are--whats-next).

---

## Table of Contents

1. [Problem Statement](#1-problem-statement)
2. [Goal](#2-goal)
3. [The Thesis](#3-the-thesis)
4. [Engineering Invariants (do not violate)](#4-engineering-invariants-do-not-violate)
5. [What ManFriday Is (one paragraph)](#5-what-manfriday-is-one-paragraph)
6. [Personas & Tenancy Model](#6-personas--tenancy-model)
7. [The Central Screening Workflow](#7-the-central-screening-workflow)
8. [Architecture at a Glance](#8-architecture-at-a-glance)
9. [Technology Stack](#9-technology-stack)
10. [Phase Map (lean product sequence)](#10-phase-map-lean-product-sequence)
11. [Domain Glossary](#11-domain-glossary)
12. [Documentation Index](#12-documentation-index)
13. [Open Decisions](#13-open-decisions)
14. [Repository Layout](#14-repository-layout)
15. [Where We Are / What's Next](#15-where-we-are--whats-next)
16. [Working Conventions for Claude](#16-working-conventions-for-claude)

---

## 1. Problem Statement

Give a staffing-agency recruiter a fast, trustworthy loop for working a stack of résumés against a job:

1. **Store** an org's résumés in one searchable database (single + bulk upload).
2. **Parse** each résumé into structured fields (deterministic v1; LLM later).
3. **Flag** authenticity/plausibility concerns *at upload* — advisory only, recruiter decides.
4. **Extract** CORE (must-have) vs NICE-to-have weighted skills from a Job Description (JD) + a completeness score.
5. **Match & rank** candidates against a JD with a transparent, explainable score.
6. **Screen** with generated SIMPLE / MEDIUM / HARD questions (5 each = 15) grounded in the résumé + JD, each with a model answer key.
7. **Triage** lightly (recruiter-set status / proposal outcomes) and **reach out** by mass email (with consent + unsubscribe).
8. **Capture** the recruiter's decisions, corrections, and outcomes from day one so the matching/ranking gets better over time.

## 2. Goal

A **lean, daily-use recruiter web app** — résumé database + authenticity flags + JD→candidate matching +
screening-question generation + lightweight triage + mass outreach — running on **Supabase + Vercel**, that
recruiters actually use and that **learns from captured feedback** to improve accuracy over time.

---

## 3. The Thesis

ManFriday is a **recruiter's assistant, not an autopilot.** The product earns trust by being transparent and
human-decided, and it compounds by capturing decisions to learn from. Repeated across the architecture:

- **A human recruiter decides.** AI suggests, ranks, drafts, and flags; it **never auto-rejects** a candidate.
- **Explainable matching.** The match score is a transparent, inspectable computation (today: weighted skill
  overlap), not an opaque black-box number.
- **Capture data now, learn later.** Every decision, correction, and outcome is recorded from day one so the
  ranking can be tuned on real signal.
- **Strict org isolation.** Each agency's data is private and invisible to every other org.

The biggest risk to the project is **over-engineering** — rebuilding the heavyweight compliance/infra stack
that this pivot deliberately shed. The countermeasure is a **lean phase sequence** ([§10](#10-phase-map-lean-product-sequence)):
ship the real loop first, add accuracy second, add learning third.

---

## 4. Engineering Invariants (do not violate)

The slim set. If a change would break one, stop and flag it.

1. **Org isolation via RLS is absolute** — including pgvector queries. Postgres Row-Level Security keyed on the
   `org_id` claim in the Supabase Auth JWT. Each org's data is invisible to every other org. There is **no
   global `candidate_identity` table** and **no cross-org link**; the same person in two orgs is incidental
   duplication, never a shared record.
2. **A human recruiter makes screening/triage decisions.** AI suggests and assists; it **never auto-rejects**.
3. **Capture decisions, corrections, and outcomes from day one** so accuracy can improve over time
   ("capture data now, learn later").
4. **A plain append-only audit log of key actions.**

> Dropped from the old set (do **not** reintroduce): run-provenance `*_run` tables, Presidio
> redaction-before-egress, per-tenant envelope encryption / crypto-shred, hash-chained audit, segregated
> demographics, adverse-impact / 4-5ths monitoring.

## 5. What ManFriday Is (one paragraph)

A multi-tenant, lean recruiting tool for **staffing agencies**, on **one codebase** (Next.js on Vercel + a
TypeScript backend on Supabase Postgres/pgvector/Storage/Auth). A **tenant is an org (a staffing agency)** with
**many recruiters who all share the org's data**. It delivers the everyday recruiter loop: upload résumés
(single + bulk) → parse into structured fields → **advisory authenticity flags at upload** → upload a JD →
**CORE/NICE weighted skills + completeness** → **transparent match & rank** of the org's candidates → generate
**15 tiered screening questions (5 simple / 5 medium / 5 hard) with answer keys** → **recruiter-set lightweight
triage** → **mass email outreach with consent/unsubscribe**. Strict org isolation via RLS; decisions and
outcomes captured so ranking learns over time.

## 6. Personas & Tenancy Model

**Tenancy (locked):** **tenant = org = staffing agency.** One shared Supabase Postgres, **RLS-enforced on
`org_id`** (functionally each org has its own private DB). **Every recruiter in an org sees ALL of that org's
résumés/candidates/requisitions** — there is **no per-recruiter or per-client visibility scoping**. The same
candidate/résumé may exist independently in multiple orgs with **no cross-org link** (no global
`candidate_identity` table). Within-org dedupe by **normalized email** is fine; cross-org linkage is not.

| Persona | Scope | Notes |
|---|---|---|
| Recruiter | all data in their org | the primary daily user; uploads, matches, screens, sets triage, sends outreach |
| Org admin | all data in their org | manages the team + org settings; same data visibility as recruiters |
| Candidate | (no app login in v1) | a person whose résumé an org holds; reached via outreach, with consent/unsubscribe |

Isolation is keyed on the Supabase Auth JWT's `org_id` claim; RLS does the enforcing.

## 7. The Central Screening Workflow

```
Org + recruiter sign in (Supabase Auth)
→ upload résumés (single + bulk) → parse into structured fields
→ authenticity/plausibility flags at upload (advisory; recruiter decides)
→ upload a JD → CORE/NICE weighted skills + completeness score
→ match & rank the org's candidates vs the JD (transparent skill overlap)
→ generate 15 screening questions (5 simple / 5 medium / 5 hard) + answer keys
→ recruiter conducts/grades the screen (AI-assist optional)
→ lightweight triage (recruiter-set status / proposal outcome)
→ mass email outreach (consent + unsubscribe)
→ capture decisions + outcomes → tune ranking over time
```

**Match score (today):** a transparent lexical **skill overlap** — `0.8·core_coverage + 0.2·nice_coverage`,
each coverage the weighted fraction of that tier's skills present. The first accuracy upgrade (Phase 2) is
**embeddings / hybrid retrieval via pgvector + an embedding API**.

**Authenticity flags:** a bounded set of **sub-agent checks** run at upload — deterministic rules (e.g.
implausible experience↔skill-count such as "10 yrs + 55 skills," timeline inconsistencies, duplicates) plus
**optional LLM analysis** — producing **advisory flags** the recruiter adjudicates. Never an auto-reject. This
extends the existing advisory-flags pattern (see `services/api/app/matching/flags.py` today, to be ported to TS).

---

## 8. Architecture at a Glance

Request flow: **Browser → Next.js (Vercel) → TypeScript backend (Next.js Route Handlers / Server Actions) →
Supabase (Postgres + pgvector + Storage + Auth).** No separate Python service tier in the target; no AWS.

- **One multi-tenant data model, RLS-enforced** on `org_id` from the Supabase Auth JWT.
- **Explainable matching** — a transparent, inspectable computation; never a black box.
- **Human-in-the-loop** — the recruiter sets triage; the UI must not pre-select an AI suggestion as the decision.
- **Capture-now-learn-later** — feedback/outcomes recorded from day one to tune ranking.
- **Background work** runs in a TS-friendly way (Supabase scheduled functions, a queue such as Inngest /
  Trigger.dev / QStash, or Vercel cron) — the *pattern*; the exact choice is a rebuild decision.
- **LLM use is optional and additive** — authenticity analysis, question generation, later semantic matching —
  called directly from the TS backend via the **Vercel AI SDK** (the `ai` package — provider-agnostic over Claude/OpenAI); no mandatory redaction/router seam.

## 9. Technology Stack

| Layer | Choice | Notes |
|---|---|---|
| Frontend | **Next.js 15 (App Router) + React 19**, TS strict, on **Vercel** | already built in `web/` — unchanged by the pivot |
| UI | **shadcn/ui + Radix + Tailwind v4**, TanStack Table/Query, Zustand | source-in-repo primitives |
| Backend | **TypeScript** — Next.js **Route Handlers / Server Actions** | the API + mutation surface; **not** Python/FastAPI |
| DB + vectors | **Supabase Postgres + pgvector** | one DB for rows + embeddings |
| Object storage | **Supabase Storage** | résumé / JD originals |
| Auth | **Supabase Auth** | org + recruiter accounts; `org_id` claim drives RLS |
| Isolation | **Postgres RLS keyed on the `org_id` JWT claim** | the backstop; **not** the old non-BYPASSRLS + `SET LOCAL` GUC pattern |
| Background jobs | **TS-friendly**: Supabase scheduled functions / a queue (Inngest, Trigger.dev, QStash) / Vercel cron | pattern; exact pick is a rebuild decision |
| Skills taxonomy | **Lightcast Open Skills** (free download), self-hosted in Postgres | seeded initially by the existing ~49-skill lexicon ([D13](docs/DECISIONS.md)) |
| LLM (optional) | **Vercel AI SDK** (`ai`) + a provider plugin (Claude / OpenAI), called directly from TS | authenticity analysis, question gen, later semantic matching |
| Deploy / CI | **Vercel** + GitHub Actions | typecheck · lint · tests |

**Removed (do not reintroduce):** AWS (Fargate / KMS / S3 / VPC), Neon, Temporal, WorkOS, Redis/Arq, Terraform,
Presidio redaction seam, per-tenant envelope encryption, hash-chained audit, demographics/adverse-impact stack.

## 10. Phase Map (lean product sequence)

The six compliance-gated phases are collapsed into a lean product sequence. Full detail in
[`docs/ROADMAP.md`](docs/ROADMAP.md).

| Phase | Title | One-line scope |
|---|---|---|
| **1** | **The real loop, live** | Org/recruiter auth, résumé upload (single + bulk) + parse, **authenticity flags at upload**, JD → CORE/NICE skills + completeness, transparent match/rank, **15 screening questions + answer keys**, lightweight triage, **mass outreach send** — all live on Supabase + Vercel. |
| **2** | **Accuracy upgrades** | Embeddings / hybrid matching via pgvector + an embedding API, better parsing, feedback-tuned ranking. |
| **3** | **Learn over time** | The capture-feedback → improve loop. *Optional later:* deeper agents, ATS integration, more verticals. |

> No adverse-impact / scale / SSO / agent-fleet / preference-learning phase gating. **Software/technical
> staffing is the first vertical** ([D11](docs/DECISIONS.md)).

## 11. Domain Glossary

- **Org / tenant** — a staffing agency; the unit of isolation. Many recruiters per org, all sharing the org's data.
- **JD** — Job Description.
- **CORE vs NICE** — must-have vs nice-to-have skills extracted from a JD, each weighted 0–1 and recruiter-adjustable.
- **Completeness score** — a deterministic 0–100 rating of how fully a requisition is specified.
- **Match / Fit** — candidate-vs-JD score; today a transparent weighted skill overlap (`0.8·core + 0.2·nice`).
- **Authenticity flag** — an advisory, recruiter-adjudicated plausibility signal raised at upload; never an auto-reject.
- **Screening questions** — 15 generated questions (5 simple / 5 medium / 5 hard) grounded in résumé + JD, each with a model answer key.
- **Triage** — lightweight recruiter-set candidate status / proposal outcome; per `(candidate × req)`, never a global label.
- **Outreach** — mass candidate email with a consent/unsubscribe flag (CAN-SPAM).
- **RLS** — Postgres Row-Level Security; the org-isolation backstop, keyed on the Supabase Auth JWT `org_id` claim.
- **Lightcast Open Skills** — the free, self-hosted skills taxonomy ([D13](docs/DECISIONS.md)).

## 12. Documentation Index

| Doc | What's in it |
|---|---|
| **[`CLAUDE.md`](CLAUDE.md)** (this file) | Persistent context anchor: problem, goal, invariants, stack, phase map, glossary. |
| **[`EXTRACTION_REPORT.md`](EXTRACTION_REPORT.md)** | Code-grounded inventory of what the current (Python) codebase actually contains — the port-from source of truth. |
| **[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)** | The lean design (TS + Supabase): capability map, personas, workflows, data model, matching, screening, security. |
| **[`docs/ROADMAP.md`](docs/ROADMAP.md)** | The lean 3-phase product sequence. |
| **[`docs/PRD.md`](docs/PRD.md)** | Product requirements + Phase 1 cut line. |
| **[`docs/DECISIONS.md`](docs/DECISIONS.md)** | Decision log (ratified items + remaining open calls). |
| **[`docs/PHASE_1_BUILD.md`](docs/PHASE_1_BUILD.md)** | The buildable Phase 1 (TS-on-Supabase) plan. |
| **[`docs/PHASE_0.md`](docs/PHASE_0.md)** | Foundation/setup notes (largely superseded; mapped to the lean direction). |
| **[`docs/WEDGE_UI.md`](docs/WEDGE_UI.md)** | UI information architecture + route/file map (matches `web/`). |
| **[`docs/SUPABASE.md`](docs/SUPABASE.md)** | Supabase project setup for the TS target. |

## 13. Open Decisions

Most product/stack calls are now **ratified** (lean direction, Supabase/Vercel, tenancy, vertical, taxonomy).
The remaining open items live in [`docs/DECISIONS.md`](docs/DECISIONS.md) — chiefly the per-candidate **cost
ceiling** (D6), basic **vendor ToS** posture (D3, light), and the **email provider** for outreach send. The old
EEOC/legal blockers (demographics, agency↔client liability, crypto-shred retention, adverse-impact protocol)
are **removed**.

## 14. Repository Layout

```
manfriday/
├── CLAUDE.md  README.md  SETUP.md  STATUS.md  EXTRACTION_REPORT.md  DOC_SYNC_SUMMARY.md
├── docs/                # ARCHITECTURE · ROADMAP · PRD · DECISIONS · PHASE_0 · PHASE_1_BUILD · WEDGE_UI · SUPABASE
├── web/                 # ✅ Next.js 15 UI (Vercel) — built, kept; data seam DATA_SOURCE=mock|api
│   ├── app/             # routes: dashboard · login · candidates(+[id]/import) · requisitions(+[id]) · outreach · settings · screening
│   └── lib/             # data/ seam · sample-data · auth · api
├── services/            # ⚠️ Python FastAPI (api) + Arq worker (workers) — BEING RETIRED, rebuilt in TS (separate effort)
├── packages/            # contracts (OpenAPI→TS) · prompts — from the Python era; revisited in the TS rebuild
├── infra/               # legacy Terraform skeleton — superseded by Vercel + Supabase
└── db/                  # leak-probe / validation helpers from the Python era
```
*(The TS backend rebuild will reshape `services/`, `packages/`, and `infra/`; that is a **separate code effort**,
not part of this docs pass. See [`EXTRACTION_REPORT.md`](EXTRACTION_REPORT.md) for the current code inventory.)*

## 15. Where We Are / What's Next

**Built today (Python + Next.js):** a working Next.js UI (`web/`) behind a `DATA_SOURCE=mock|api` seam, and a
Python FastAPI backend that does org-isolated CRUD, deterministic résumé parsing, transparent skill-overlap
matching, JD completeness, advisory flags, proposals, and consent-based outreach **audience** (no send), all
RLS-scoped. Full inventory: [`EXTRACTION_REPORT.md`](EXTRACTION_REPORT.md).

**The pivot:** rebuild the backend in **TypeScript on Supabase + Vercel**, drop the EEOC/compliance + AWS layer,
and keep the good product design (the transparent matcher, the deterministic parser + 49-skill lexicon, the
advisory-flags pattern, the org-isolation model, the UI). The **good design ports; the heavyweight infra does
not.** Docs now describe this TS target.

**Next:** the TS code rebuild (separate effort) — stand up the Supabase schema with RLS on the `org_id` JWT
claim, port the parser + matcher + flags to TS, wire the Next.js backend, then layer authenticity-flag checks,
the 15-question screening generator, and outreach send. Live tracker: [`STATUS.md`](STATUS.md).

## 16. Working Conventions for Claude

- **Lean is the point.** Don't reintroduce the dropped compliance/infra stack (provenance tables, redaction
  seam, crypto-shred, hash-chain, demographics, adverse-impact, AWS, Temporal, WorkOS, Arq/Redis, Neon). When a
  choice is between "more infra" and "ship the loop," ship the loop.
- **Human-in-the-loop stays.** A human recruiter decides triage; AI suggests and never auto-rejects. The UI must
  not pre-select an AI suggestion as the decision.
- **Org isolation is absolute.** Everything tenant-scoped carries `org_id` and is RLS-protected, pgvector
  included. No cross-org link, no `candidate_identity` table.
- **Capture data from day one.** Record decisions, corrections, and outcomes so ranking can learn later.
- **Docs describe the TS target.** The Python `services/`/`packages/` are being retired; don't describe their
  internals as the go-forward design. Ground "what's built" in [`EXTRACTION_REPORT.md`](EXTRACTION_REPORT.md);
  never describe dropped or aspirational things as built.
- **Keep the docs in sync.** When the design changes, update the relevant `docs/` section *and* this file.
- **Commit/push only when asked.** Branch before committing.
