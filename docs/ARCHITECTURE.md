# ManFriday — Architecture & Design

> A lean recruiter tool for software/technical staffing agencies: a per-org résumé database, JD intelligence, transparent candidate↔JD matching, screening Q&A, lightweight triage, and mass outreach. Built on **TypeScript + Supabase + Vercel**. Matching is transparent and explainable; a human recruiter makes every screening/triage decision; the product captures decisions and outcomes from day one so it can learn over time. LLM use is **optional and additive**, never a mandatory seam.
>
> Companion docs: [`CLAUDE.md`](../CLAUDE.md) (context anchor + the four invariants in §4), [`docs/ROADMAP.md`](ROADMAP.md), [`docs/PRD.md`](PRD.md), [`docs/PHASE_1_BUILD.md`](PHASE_1_BUILD.md), [`docs/WEDGE_UI.md`](WEDGE_UI.md), [`docs/SUPABASE.md`](SUPABASE.md), [`docs/DECISIONS.md`](DECISIONS.md), and the code-grounded [`EXTRACTION_REPORT.md`](../EXTRACTION_REPORT.md). Where this doc and the decision log disagree on a product/legal call, [`DECISIONS.md`](DECISIONS.md) wins.

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [System Overview](#2-system-overview)
3. [Cross-Cutting Decisions](#3-cross-cutting-decisions)
4. [Capability Map](#4-capability-map)
5. [Personas & Tenancy](#5-personas--tenancy)
6. [The Screening Workflow & Lightweight Triage](#6-the-screening-workflow--lightweight-triage)
7. [Domain Data Model & Multi-Tenant Schema](#7-domain-data-model--multi-tenant-schema)
8. [Auth & Tenant Isolation](#8-auth--tenant-isolation)
9. [JD Ingestion & CORE/NICE Skill Extraction](#9-jd-ingestion--corenice-skill-extraction)
10. [Résumé Parsing](#10-résumé-parsing)
11. [Matching / Fitment](#11-matching--fitment)
12. [Authenticity / Plausibility Flags at Upload](#12-authenticity--plausibility-flags-at-upload)
13. [Screening Question & Answer-Key Generation](#13-screening-question--answer-key-generation)
14. [Outreach](#14-outreach)
15. [Technology Stack & Background Work](#15-technology-stack--background-work)
16. [Security & PII](#16-security--pii)
17. [Optional LLM Use](#17-optional-llm-use)
18. [Risk Register](#18-risk-register)
19. [Open Decisions](#19-open-decisions)

---

## 1. Executive Summary

ManFriday is a **lean recruiter tool** for staffing agencies in software/technical staffing — its first vertical. One org (a staffing agency) holds many recruiters; **every recruiter in an org sees all of that org's candidates and résumés**, and each org's data is strictly invisible to every other org. The core loop is small and concrete: recruiters create accounts, upload résumés (single and bulk) that get **parsed into structured fields**, upload JDs that get split into **CORE vs NICE weighted skills with a completeness score**, **match and rank** candidates against a JD with a transparent lexical skill-overlap score, generate **15 grounded screening questions** (5 simple / 5 medium / 5 hard) each with a model answer key, set **lightweight triage** (a candidate status plus a per-proposal outcome), and run **mass email outreach** with a simple consent/unsubscribe flag.

Three things make the product defensible and durable without heavyweight machinery. First, **matching is transparent** — a quoted arithmetic formula over evidence (skills present vs. required), never an opaque "fit: 78." Second, **a human recruiter decides** — the tool suggests, assists, surfaces advisory flags, and ranks, but never auto-rejects a candidate. Third, the product **captures decisions, corrections, and outcomes from day one** ("capture data now, learn later") so later phases can improve parsing, ranking, and matching from real usage.

The stack is deliberately small: **Next.js 15 / React 19 on Vercel** for the UI (already built), a **TypeScript backend** (Next.js Route Handlers / Server Actions), and **Supabase** (Postgres + pgvector + Storage + Auth) for data, vectors, files, and identity. Tenant isolation is **Postgres Row-Level Security keyed on the `org_id` claim in the Supabase Auth JWT**. There is no separate Python AI service, no model-router seam, no message broker on the critical path. LLM calls are optional and additive — authenticity analysis, screening-question drafting, and (Phase 2) semantic matching — called directly from TypeScript through a provider SDK. The biggest risk is not a wrong technology choice; it is over-engineering a small product, so the architecture is sized to one design-partner agency and grows only when real usage justifies it.

> **Build note.** Per [`EXTRACTION_REPORT.md`](../EXTRACTION_REPORT.md), the existing Python `services/api` (FastAPI) + `services/workers` (Arq) backend is being **retired** and rebuilt in TypeScript on Supabase. This document describes the **TypeScript target**; the Python internals are not the go-forward design. The Next.js UI in `web/` stays and switches from its mock data seam to the real Supabase-backed backend without a rewrite.

---

## 2. System Overview

Request flow:

```
Browser (Next.js UI)
   │  HTTPS
   ▼
Next.js on Vercel  ──  TypeScript backend (Route Handlers / Server Actions)
   │                         │
   │  Supabase Auth session  │  supabase-js (RLS-scoped by org_id JWT claim)
   ▼                         ▼
            Supabase
   ├─ Postgres + pgvector   (orgs, candidates, résumés, requisitions, jd_skills,
   │                         proposals, audit log; embeddings from Phase 2)
   ├─ Storage               (immutable résumé / JD originals, size-capped)
   └─ Auth                  (recruiter accounts; org_id claim in the JWT)
                  │
                  ▼  (optional, additive)
          LLM provider SDK   (authenticity analysis, question drafting,
                              Phase-2 embeddings — called directly from TS)
```

A recruiter signs in through **Supabase Auth**. The Next.js app holds the Supabase session; server-side code (Route Handlers / Server Actions) talks to Postgres through `supabase-js` using a connection that carries the user's JWT, so **every query is filtered by Row-Level Security against the `org_id` claim**. Résumé and JD files live in **Supabase Storage** as immutable originals; structured parse output lives in Postgres as `parsed_jsonb`. Matching, completeness, parsing, and authenticity flags are **deterministic TypeScript** that runs in the backend with no external dependency. When an LLM is genuinely useful, the backend calls a provider SDK directly — there is no mandatory redaction/router stage in front of it.

---

## 3. Cross-Cutting Decisions

- **One multi-tenant data model, RLS-enforced on the JWT claim.** Shared-schema Postgres; every tenant-scoped table carries `org_id` and an RLS policy that reads the `org_id` claim from the Supabase Auth JWT. The org *is* the staffing agency; isolation is absolute and structural, including pgvector KNN queries (Phase 2). This **replaces** the prior pattern of a dedicated non-`BYPASSRLS` Postgres role plus `SET LOCAL` GUCs set from a self-minted JWT — see [§8](#8-auth--tenant-isolation).
- **Explainable matching, never a black box.** Fitment is a quoted arithmetic formula — `0.8·core_coverage + 0.2·nice_coverage` over case-insensitive skill matches — with a per-skill matched/missing breakdown. There is no opaque composite score. Semantic/embedding matching is an additive Phase-2 upgrade layered on the same transparent base, not a replacement.
- **Human-in-the-loop.** The product ranks candidates, surfaces advisory authenticity flags, drafts questions, and proposes nothing more. A recruiter sets candidate status and proposal outcomes; the tool never auto-rejects. The UI must not pre-select an AI suggestion.
- **Capture now, learn later.** Decisions (status changes, proposal outcomes), recruiter corrections (re-tiering/re-weighting skills, editing parses), and outcomes (interviewing/rejected/hired) are recorded from Phase 1 so Phase 3 can improve the product from real data — no data-hungry model is built before the data exists.
- **LLM optional and additive.** No feature requires an LLM to function. Deterministic parsing, matching, completeness, and flags work with zero model calls. LLMs add value (authenticity reasoning, question drafting, later semantic matching) and are called directly from TypeScript via a provider SDK with a per-screen cost ceiling ([DECISIONS D6](DECISIONS.md#d6-per-candidate--per-screen-cost-ceiling)).

---

## 4. Capability Map

| # | Capability | What it does | Phase |
|---|---|---|---|
| C1 | **Résumé database** | Org-scoped candidate + immutable versioned résumé store; single + bulk upload; within-org dedupe by normalized email | 1 |
| C2 | **Authenticity flags at upload** | Bounded sub-agent checks (deterministic rules + optional LLM) producing advisory flags; recruiter decides | 1 |
| C3 | **JD intelligence** | JD upload → CORE vs NICE weighted skills + a 0–100 completeness score; recruiter confirms the rubric | 1 |
| C4 | **Matching / ranking** | Transparent lexical skill-overlap fit (0–100) of candidates vs a JD, with a per-skill breakdown | 1 |
| C5 | **Screening Q&A** | 15 questions (5 per tier) grounded in résumé ∩ JD, each with a model answer key; recruiter grades | 1 |
| C6 | **Lightweight triage** | Recruiter-set candidate `status` + per-proposal `outcome`; per (candidate × req), never global | 1 |
| C7 | **Outreach** | Mass email with a simple consent/unsubscribe flag (CAN-SPAM); send is built | 1 |
| C8 | **Talent CRM + feedback capture** | Reusable per-org candidate pool; capture decisions/corrections/outcomes to learn over time | 1 capture → 3 learn |

---

## 5. Personas & Tenancy

**Tenancy (locked):** the tenant **is** the org, which **is** a staffing agency. Many recruiters belong to one org. Isolation is via Postgres RLS on `org_id`; one shared Supabase Postgres serves all orgs, but each org's data is private and invisible to every other org — functionally each org has its own database. **Every recruiter in an org sees all of that org's candidates and résumés** — there is no per-recruiter or per-client visibility scoping inside an org.

**No cross-org link.** The same person (and the same résumé) may exist independently in multiple orgs as separate records with **no link between them**. There is **no global `candidate_identity` table** and no shared talent pool — confirmed absent in the codebase per [`EXTRACTION_REPORT.md`](../EXTRACTION_REPORT.md) §1. Within a single org, dedupe by normalized email is fine; cross-org linkage is not.

**Candidates have no app login in v1.** A candidate is a data record an org's recruiters manage; candidates do not sign in, see scores, or manage their own profile in Phase 1. Consent for outreach is a simple flag a recruiter records, plus an unsubscribe path (see [§14](#14-outreach)).

| Persona | Scope | Decides? |
|---|---|---|
| Recruiter (org member) | All candidates/résumés/reqs in their own org | **Yes** — sets candidate `status` and proposal `outcome` |
| Org admin | Manage the org's members; same data scope | Yes; also user management |

There is no client-hiring-manager persona, no candidate persona, no auditor persona, and no platform-super-admin break-glass flow in this lean design.

---

## 6. The Screening Workflow & Lightweight Triage

```
Recruiter signs in (Supabase Auth, scoped to their org)
→ upload résumé(s) (single / bulk) → parse into structured fields
→ authenticity flags computed at upload (advisory)
→ upload JD → CORE vs NICE weighted skills + completeness score (recruiter confirms)
→ match + rank candidates vs the JD (transparent 0.8·core + 0.2·nice fit)
→ generate 15 screening questions (5×3 tiers) + answer keys, grounded in résumé ∩ JD
→ recruiter conducts the screen, grades answers
→ lightweight triage: set candidate.status + create/advance a proposal (outcome per req)
→ mass outreach to a consent-eligible audience
```

**Lightweight triage — explicitly no GREEN/AMBER/RED machine.** Triage is two small, recruiter-set fields, captured per (candidate × req), never as a global label on a person:

- `candidate.status` — a pipeline state on the candidate: `new → contacted → screening → submitted`.
- `proposal.outcome` — the result of proposing a candidate to a specific requisition: `proposed → interviewing → rejected → hired`, with an optional free-text `reason`.

There is **no GREEN/AMBER/RED state machine and no reason-code taxonomy.** A candidate rejected for one req is unaffected for any other; outcomes are scoped to the proposal row. These two fields, plus the recruiter's skill re-tiering and parse corrections, are the day-one feedback signal the product learns from later.

---

## 7. Domain Data Model & Multi-Tenant Schema

PostgreSQL on Supabase, with `pgvector` enabled (used from Phase 2). Every tenant-scoped table carries `org_id uuid NOT NULL` and an RLS policy keyed on the `org_id` claim in the Supabase Auth JWT (see [§8](#8-auth--tenant-isolation)). UUID primary keys; `created_at timestamptz NOT NULL`. The real tables:

| Table | Key columns | Notes |
|---|---|---|
| **organization** | `id`, `name`, `created_at`, `deleted_at` | Tenant root = a staffing agency. RLS keyed on `id`. |
| **app_user** | `id`, `org_id`, `email`, `status`, `created_at`, `deleted_at` | A recruiter, homed in one org. Backed by a Supabase Auth user. |
| **membership** | `id`, `org_id`, `user_id`, `role`, `created_at` | Ties a user to an org with a role (recruiter / admin). No per-client/per-req scope. |
| **candidate** | `id`, `org_id`, name + contact PII fields, `consent_state` (`pending`/`opted_in`/`unsubscribed`), `consent_source`, `status` (`new`/`contacted`/`screening`/`submitted`), `created_at`, `deleted_at` | Org-scoped. Soft-delete via `deleted_at`; hard-delete on request. Within-org dedupe by normalized email. |
| **resume** | `id`, `org_id`, `candidate_id`, `version`, `content_hash`, `storage_uri`, `content_type`, `parsed_jsonb`, `is_current`, `superseded_by`, `created_at` | Immutable, versioned — a new upload is a new row, never an update. `parsed_jsonb` holds the structured parse. |
| **requisition** | `id`, `org_id`, `title`, `location`, `employment_type`, `openings`, `status` (`open`/`on_hold`/`filled`), `jd_text`, `created_at`, `deleted_at` | A job opening with its JD. |
| **jd_skill** | `id`, `org_id`, `requisition_id`, `name`, `tier` (`core`/`nice`), `weight` (0..1), `sort_order` | The CORE/NICE weighted rubric the matcher reads; recruiter-confirmed. |
| **proposal** | `id`, `org_id`, `candidate_id`, `requisition_id`, `outcome` (`proposed`/`interviewing`/`rejected`/`hired`), `reason`, `decided_by`, `decided_at`, `created_at` | Candidate × req outcome. The per-req half of triage. |
| **audit log** | `id`, `org_id`, `actor_id`, `action`, `entity_type`, `entity_id`, `occurred_at` (+ optional before/after) | A simple **append-only** activity log of key actions (invariant #4). No hash chain. |
| **embedding** | `id`, `org_id`, `owner_type`, `owner_id`, `model_id`, `dim`, `vector`, `created_at` | pgvector rows for semantic matching. **Used from Phase 2**; an HNSW index covers KNN, and RLS filters KNN by `org_id`. |

**Deliberately dropped from the data model** (present in the retired Python schema; not carried into the TypeScript target): the provenance tables `parse_run` / `scoring_run` / `generation_run` and the tall `score` table; `tenant_key` (per-tenant envelope-encryption DEK); `consent_ledger` (replaced by the simple `candidate.consent_state` flag + audit log); any demographics / protected-class table (never existed — see [`EXTRACTION_REPORT.md`](../EXTRACTION_REPORT.md) §1); and any `candidate_identity` / cross-org linkage table (confirmed absent). The `client` entity, per-recruiter scoping, and the old role lookup collapse into the flat org/recruiter model of [§5](#5-personas--tenancy).

**Soft-delete & retention.** Tenant entities carry `deleted_at` for soft-delete (RLS reads append `AND deleted_at IS NULL`). A hard-delete-on-request path removes the candidate, their résumé blobs in Storage, and their rows — pragmatic GDPR/CCPA hygiene, no crypto-shred ceremony ([DECISIONS D5](DECISIONS.md#d5-data-retention--deletion)).

---

## 8. Auth & Tenant Isolation

**Auth = Supabase Auth.** Recruiters sign in through Supabase Auth; each user belongs to exactly one org. The user's `org_id` is carried as a **claim in the Supabase Auth JWT**. The Next.js backend holds the Supabase session server-side and issues queries through `supabase-js` so that every Postgres request runs under that user's JWT.

**Isolation = Postgres RLS reading the JWT claim.** Every tenant-scoped table has an RLS policy of the form `org_id = (auth.jwt() ->> 'org_id')::uuid` (with `id` standing in for `org_id` on `organization`). Because Supabase issues queries under a role that is subject to RLS and the claim is set by the verified JWT, a recruiter can only ever read or write their own org's rows — including pgvector KNN queries, which inherit the same predicate and so cannot match across orgs. This is the single load-bearing isolation control and invariant #1.

> **This replaces the prior pattern.** The retired Python backend used a dedicated **non-`BYPASSRLS` Postgres role** (`manfriday_app`) and set `app.current_org` per transaction with `SET LOCAL` from a self-minted EdDSA JWT (see [`EXTRACTION_REPORT.md`](../EXTRACTION_REPORT.md) §1). The TypeScript target drops the bespoke role + GUC + JWT-mint machinery and uses **Supabase Auth + RLS on the `org_id` JWT claim** directly. Same structural guarantee, far less moving infrastructure.

There is no SSO/SCIM, no OpenFGA/ReBAC, no SPIFFE/SPIRE, and no per-request internal-JWT mint in this design — those are not needed for one org-isolated recruiter tool.

---

## 9. JD Ingestion & CORE/NICE Skill Extraction

A requisition's `jd_text` is turned into a structured, weighted, **recruiter-confirmed** skill rubric — the artifact the matcher ([§11](#11-matching--fitment)) reads.

**Skill taxonomy: Lightcast Open Skills, self-hosted.** The canonical skill backbone is the free **Lightcast Open Skills** download, self-hosted in Postgres (license per [DECISIONS D13](DECISIONS.md#d13-lightcast-license)). It is seeded initially by the existing **~49-skill lexicon** (a precision-biased `canonical → aliases` map covering common software/technical staffing skills, per [`EXTRACTION_REPORT.md`](../EXTRACTION_REPORT.md) §3) and grows into the broader Lightcast vocabulary. Matching surface terms to canonical skills is case-insensitive and edge-bounded on alphanumerics so `C++`, `C#`, `Node.js`, `k8s` resolve cleanly.

**Extraction today, and where it goes.** Per [`EXTRACTION_REPORT.md`](../EXTRACTION_REPORT.md) §3, the current extractor runs the lexicon over `jd_text` and **suggests every found skill as `tier="core"`, `weight=1.0`** — there is no automatic must-have-vs-nice classification or weight inference yet. The recruiter then **re-tiers and re-weights** those suggestions and confirms them; only confirmed `jd_skill` rows become the rubric. **The recruiter override always wins** — suggestions are advisory and are never persisted until confirmed. Smarter CORE/NICE inference (section-heading cues, modal phrasing, optional LLM judgment) is a later additive improvement behind the same confirm-the-rubric interface.

**Completeness score.** A separate deterministic 0–100 rating tells the recruiter how "ready" a JD is, via weighted checks (title, location, employment type, JD text length, presence of ≥3 core skills, presence of ≥1 nice skill), each returning a present/hint result so the recruiter knows what to add.

---

## 10. Résumé Parsing

**Deterministic, local, v1.** Per [`EXTRACTION_REPORT.md`](../EXTRACTION_REPORT.md) §3, parsing is a regex + lexicon pipeline with no network call and no LLM: bytes → text (routed by content-type / filename / magic bytes; PDF and DOCX extractors, falling back to plain text and degrading to empty text rather than crashing on a corrupt file) → field extraction (skills via the Lightcast-seeded lexicon, an experience-years estimate from explicit "N years" mentions and dated ranges, contact-presence booleans, link domains, text length). The output is a reproducible `parsed_jsonb` document.

Parsing runs the same way for single uploads and bulk uploads (one candidate per file). It is **immutable**: a new résumé upload creates a new `resume` row (`version`, `content_hash`, `is_current`, `superseded_by`), never an in-place edit.

**LLM later, behind the same interface.** When LLM-assisted parsing earns its cost (richer field extraction, implied-skill inference), it slots in behind the same parser interface that returns `parsed_jsonb` — the matcher and UI do not change. This is an [§17](#17-optional-llm-use) additive upgrade, not a v1 requirement.

---

## 11. Matching / Fitment

Matching is a **transparent lexical skill-overlap** score, quoted verbatim from the implementation ([`EXTRACTION_REPORT.md`](../EXTRACTION_REPORT.md) §2):

```
fit_fraction = 0.8 · core_coverage + 0.2 · nice_coverage      # CORE dominates
fit          = round(fit_fraction · 100)                       # 0..100 integer
```

Each **coverage** is the weighted fraction of that tier's skills that are present on the candidate's parsed résumé:

```
core_coverage = (sum of weights of present CORE skills) / (sum of weights of all CORE skills)
nice_coverage = (same, over the NICE tier)
```

"Present" is a **case-insensitive exact match** of a `jd_skill.name` against the résumé's parsed canonical skills — no fuzzy or semantic match in v1. If a JD has only one tier, fit is scored on that tier alone. The endpoint returns not just the number but the **per-skill breakdown** (`matched`, `missing_core`, and each skill's `tier`/`weight`/`present`), so a recruiter sees exactly which skills drove the score; ranking is `fit desc` with a stable tie-break. There is no recency, experience-years, domain, or seniority term folded in, and **no authenticity signal is ever folded into fit** — flags are reported separately ([§12](#12-authenticity--plausibility-flags-at-upload)).

**Phase-2 upgrade: embeddings / hybrid via pgvector.** The accuracy upgrade is to add **dense semantic matching** — embed résumé and JD skill text via an embedding API, store vectors in the `embedding` table, and run pgvector KNN (RLS-scoped by `org_id`) to credit synonyms and related skills the exact-match misses, fused with the lexical signal. This layers on top of the transparent base above; the lexical breakdown remains the explainable backbone, and the embedding store is the same one folded into matching from Phase 2 onward (so the old standalone "RAG-at-scale" subsystem reduces to this one note).

---

## 12. Authenticity / Plausibility Flags at Upload

At upload, a bounded set of **sub-agent checks** produces **advisory flags** — a "fake résumé" / plausibility signal for the recruiter. This is deliberately small and human-gated, **not** a heavyweight continuous-agent fleet and **not** an EEOC-style fraud-detection subsystem.

- **Deterministic rules (first and primary).** Cheap, reproducible checks over `parsed_jsonb` and résumé text — extending the existing advisory-flags pattern (`matching/flags.py` today: `no_contact`, `no_skills_detected`, `sparse_resume`, `no_experience_signal`, per [`EXTRACTION_REPORT.md`](../EXTRACTION_REPORT.md) §2), ported to TypeScript and broadened with plausibility rules such as **implausible experience↔skill-count ratios** (e.g. "10 years experience" alongside 55 distinct skills), **timeline inconsistencies**, and **within-org duplicates**.
- **Optional LLM analysis (additive).** Where a fuzzy judgment helps (e.g., responsibility/seniority mismatch, templated-text suspicion), an optional LLM pass can add a flag with a short rationale. It is never required for the feature to work.

Every output is **advisory only**: a flag with a severity and a short explanation, surfaced to the recruiter. Flags are **never auto-rejecting, never folded into the fit score, and the recruiter decides** what to do. This is the lean replacement for the old "Fake-Experience & Skill-Inflation Detection" section — same human-in-the-loop spirit, a fraction of the machinery.

---

## 13. Screening Question & Answer-Key Generation

For a given candidate × JD, the engine produces a **structured screen**: **15 questions — 5 SIMPLE, 5 MEDIUM, 5 HARD** — each **grounded in the intersection of the résumé and the JD** (the CORE skills the candidate actually claims), and each carrying a **structured JSON answer key** (expected points with weights, a concise model answer, and partial-credit guidance) so a recruiter who is not a domain expert can grade defensibly.

- **Tiers, operationally:** SIMPLE = single-concept recall; MEDIUM = apply a concept / combine 2–3 facts; HARD = open-ended design/judgment under constraints, including résumé-probing depth.
- **Recruiter grades; AI-assist optional.** The recruiter scores answers against the key. An optional AI-assist pass can pre-suggest a score against the expected points, but the **recruiter makes the final call** ([DECISIONS D12](DECISIONS.md#d12-screening-administration--ai-assist-grading)). The UI must **not pre-select** a suggested score or verdict.
- Generation can be deterministic-templated where that suffices and LLM-assisted where it adds quality ([§17](#17-optional-llm-use)); either way the output is the same structured `{question, tier, answer_key}` shape.

There is no GREEN/AMBER/RED advancement banding here — grading feeds the recruiter's lightweight triage ([§6](#6-the-screening-workflow--lightweight-triage)), nothing more.

---

## 14. Outreach

Mass email outreach to a consent-eligible audience, with **send built** (no longer gated). Audience selection reuses the matcher: filter an org's candidates by fit against a requisition and by consent eligibility.

- **Consent flag.** Each candidate carries `consent_state` (`pending` / `opted_in` / `unsubscribed`) plus a `consent_source`. The outreach audience excludes `unsubscribed` candidates.
- **CAN-SPAM.** Every send includes a working **unsubscribe** path (which flips the candidate to `unsubscribed`) and a valid **sender identification**. This is the lean, pragmatic compliance posture for outreach — no broader consent ledger.

Sending uses a transactional email provider (the exact provider is a rebuild decision); deliverability is a real operational risk tracked in [§18](#18-risk-register).

---

## 15. Technology Stack & Background Work

| Layer | Choice | Notes |
|---|---|---|
| Frontend / UI | **Next.js 15 (App Router) + React 19**, TypeScript strict, on **Vercel** | Already built; switches from the mock data seam to the real backend without a rewrite. |
| UI components | shadcn/ui + Radix + Tailwind, TanStack Table/Query, Zustand | As built in `web/`. |
| Backend | **TypeScript — Next.js Route Handlers / Server Actions** | No separate Python/FastAPI service. Deterministic parsing/matching/completeness/flags run here. |
| DB + vectors | **Supabase Postgres + pgvector** | One DB for rows and (Phase 2) embeddings; HNSW index for KNN. |
| Object storage | **Supabase Storage** | Immutable résumé / JD originals; size caps + MIME-by-content checks. |
| Auth | **Supabase Auth** | Recruiter accounts; `org_id` claim drives RLS. |
| Background work | **TS-friendly pattern** — Supabase scheduled functions, or a queue (Inngest / Trigger.dev / QStash), or Vercel cron | For bulk parsing, batched outreach sends, and Phase-2 embedding backfills. The **pattern** is fixed; the **exact pick is a rebuild decision**. |
| Email | Transactional email provider (TBD at rebuild) | CAN-SPAM unsubscribe + sender ID. |
| LLM (optional) | **Vercel AI SDK** (`ai` package) + a provider plugin (`@ai-sdk/anthropic` / `@ai-sdk/openai`) | Provider-agnostic, called directly from TS. `generateObject` for authenticity reasoning + question drafting; `embed`/`embedMany` for Phase-2 embeddings. No router/redaction seam. |

**Removed from the prior stack** (do not reintroduce): AWS (ECS Fargate / KMS / S3 / VPC), Neon, Temporal, WorkOS, Redis + Arq, and Terraform. Infra is Supabase + Vercel; deploys are Vercel previews per PR.

**Background-work pattern.** Anything that is not a fast synchronous request — bulk résumé parsing, batched outreach sends, Phase-2 embedding backfills — runs as a scheduled/queued job in a TypeScript-friendly mechanism (Supabase scheduled functions, an Inngest/Trigger.dev/QStash queue, or Vercel cron). The job inherits the org scope from its trigger and writes through the same RLS-governed path as request handlers.

---

## 16. Security & PII

Candidate résumés are still PII, so the posture is **pragmatic GDPR/CCPA hygiene**, not a heavyweight compliance stack.

- **Tenant isolation** is the primary control: Postgres RLS on the `org_id` JWT claim ([§8](#8-auth--tenant-isolation)), covering relational and pgvector queries.
- **Auth** via Supabase Auth; no candidate logins in v1.
- **Soft-delete + hard-delete on request.** `deleted_at` for soft-delete; a hard-delete path purges a candidate's rows and their Storage blobs on request ([DECISIONS D5](DECISIONS.md#d5-data-retention--deletion)).
- **CAN-SPAM** for outreach: working unsubscribe + sender identification ([§14](#14-outreach)).
- **Sandboxed file parsing.** Treat uploaded résumés as untrusted input: validate **MIME by content** (not extension), enforce **size caps**, and disable external-entity resolution / macros in document parsers. Parse in an isolated worker.

**Explicitly NOT in this design:** no Presidio redaction-before-egress seam, no per-tenant envelope encryption / crypto-shred, no hash-chained audit log (the audit log is a plain append-only activity table — invariant #4), no segregated demographics store, no adverse-action notices, and no governed feature registry. These belonged to the retired EEOC posture and are removed.

---

## 17. Optional LLM Use

LLM use is **optional and additive** everywhere. The product's core loop — parse, match, completeness, flags, screening structure — works deterministically with **zero model calls**. When a model genuinely helps, the backend calls it through the **Vercel AI SDK** (the [`ai`](https://sdk.vercel.ai) package) directly from TypeScript — a single, provider-agnostic seam over Anthropic / OpenAI / etc. Concretely:

- **Authenticity analysis** ([§12](#12-authenticity--plausibility-flags-at-upload)) — `generateObject` (AI SDK) returns a typed, schema-validated advisory flag with a short rationale, on top of the deterministic rules. Optional.
- **Screening-question drafting** ([§13](#13-screening-question--answer-key-generation)) — `generateObject` authors the `{question, tier, answer_key}` structures against a Zod schema. Optional.
- **Phase-2 semantic matching** ([§11](#11-matching--fitment)) — `embed` / `embedMany` (AI SDK) call an embedding model to populate the pgvector store.

Why the Vercel AI SDK: it is the TS-native, Vercel-first abstraction (the app already deploys on Vercel), it makes the model provider a one-line swap, and `generateObject` gives schema-validated structured output without a bespoke router. There is **no in-house multi-model router and no mandatory redaction seam** — those were part of the retired architecture and are gone. The model provider (e.g. `@ai-sdk/anthropic` or `@ai-sdk/openai`) is a config choice, not an architectural one. Cost discipline is a simple **per-screen / per-candidate ceiling** ([DECISIONS D6](DECISIONS.md#d6-per-candidate--per-screen-cost-ceiling)), monitored at the call site, with cheap models for bulk/simple tasks and a stronger model reserved for the few high-value calls. Deeper, multi-step LLM agents and tool-using workflows are an **optional Phase-3+** consideration, not part of the lean loop.

---

## 18. Risk Register

| Risk | Why it matters | Mitigation |
|---|---|---|
| **Org-isolation regression** | A bug that lets one org read another's candidates is the platform-ending failure. | RLS on the `org_id` JWT claim is the structural backstop (incl. pgvector KNN); test cross-org access with a deny-by-default suite, including vector queries. |
| **Over-engineering / scope creep** | The original design's biggest threat: building heavyweight infra for a small product so it never ships. | Keep the stack to Supabase + Vercel; gate every addition (embeddings, agents, queues) behind a real usage trigger; ship the loop to one design-partner agency first. |
| **LLM cost** | Optional LLM calls can quietly dominate cost if unbounded. | Per-screen/per-candidate ceiling ([DECISIONS D6](DECISIONS.md#d6-per-candidate--per-screen-cost-ceiling)); deterministic-first; cheap models for bulk, strong model only for high-value calls. |
| **Parsing accuracy** | A weak parse degrades matching and screening quality. | Deterministic v1 with reproducible output; capture recruiter corrections from day one; add LLM-assisted parsing behind the same interface when it earns its cost. |
| **Email deliverability** | Mass outreach can hit spam filters or harm sender reputation. | Reputable transactional provider, CAN-SPAM unsubscribe + sender ID, sensible send rates, monitor bounce/complaint rates. |

---

## 19. Open Decisions

Product and licensing calls that shape (but do not block) the lean build live in [`docs/DECISIONS.md`](DECISIONS.md). The live ones for this design:

- [D1 — Candidate model & consent](DECISIONS.md#d1-candidate-model--consent)
- [D3 — Vendor posture & terms of service](DECISIONS.md#d3-vendor-posture--terms-of-service)
- [D5 — Data retention & deletion](DECISIONS.md#d5-data-retention--deletion)
- [D6 — Per-candidate / per-screen cost ceiling](DECISIONS.md#d6-per-candidate--per-screen-cost-ceiling)
- [D8 — Infrastructure: Supabase + Vercel](DECISIONS.md#d8-infrastructure-supabase--vercel)
- [D9 — Triage states & feedback capture](DECISIONS.md#d9-triage-states--feedback-capture)
- [D10 — Placement / outcome tracking](DECISIONS.md#d10-placementoutcome-tracking)
- [D11 — Initial vertical & role mix](DECISIONS.md#d11-initial-vertical--role-mix) (software/technical staffing is the first vertical)
- [D12 — Screening administration & AI-assist grading](DECISIONS.md#d12-screening-administration--ai-assist-grading)
- [D13 — Lightcast license](DECISIONS.md#d13-lightcast-license)
