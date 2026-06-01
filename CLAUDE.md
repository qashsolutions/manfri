# ManFriday — Project Context (CLAUDE.md)

> **Read this first.** This file is the canonical, always-loaded context anchor for the ManFriday
> project so we never lose the thread across sessions. It is a *map and a contract*, not the full
> design — the deep reasoning lives in [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) and
> [`docs/ROADMAP.md`](docs/ROADMAP.md). When those and this file disagree, the docs win on detail;
> this file wins on "what must never be violated."
>
> **Status:** Phase 0 **built · pushed (`qashsolutions/manfri`) · CI green**, and **Phase 1 (the wedge — Compliant Talent CRM) is well underway** on branch `phase-0-foundations`. **85 tests green** (mypy strict + ruff). Landed so far, all CI green: **1.1** org-isolated product schema + RLS · **1.2** deterministic résumé parser + Arq parse job · **1.3** FastAPI product endpoints (23 ops, OpenAPI→TS) · **1.4** web `api` provider wired + `force-dynamic` (mock stays dev/CI default) · **1.5 Supabase DB validated** — full suite (85) + cross-tenant leak probe run **against the live Supabase Postgres**; `manfriday_app` confirmed non-BYPASSRLS, 0 rows leak without the org GUC (`db/supabase_validate.py`, synthetic data). Next: Supabase **Storage** + email-send + **Vercel** — and ratify the ⚖️ [`DECISIONS.md`](docs/DECISIONS.md) items with counsel before real candidate PII lands. Live execution tracker: [`STATUS.md`](STATUS.md). See [§15 Where We Are / What's Next](#15-where-we-are--whats-next).

---

## Table of Contents

1. [Problem Statement](#1-problem-statement)
2. [Goal](#2-goal)
3. [The Non-Negotiable Thesis](#3-the-non-negotiable-thesis)
4. [Engineering Invariants (do not violate)](#4-engineering-invariants-do-not-violate)
5. [What ManFriday Is (one paragraph)](#5-what-manfriday-is-one-paragraph)
6. [Personas & Tenancy Model](#6-personas--tenancy-model)
7. [The Central Screening Workflow](#7-the-central-screening-workflow)
8. [Architecture at a Glance](#8-architecture-at-a-glance)
9. [Technology Stack](#9-technology-stack)
10. [Phase Map (compliance-before-scale)](#10-phase-map-compliance-before-scale)
11. [Domain Glossary](#11-domain-glossary)
12. [Documentation Index](#12-documentation-index)
13. [Open Decisions (blocking or shaping work)](#13-open-decisions-blocking-or-shaping-work)
14. [Repository Layout](#14-repository-layout)
15. [Where We Are / What's Next](#15-where-we-are--whats-next)
16. [Working Conventions for Claude](#16-working-conventions-for-claude)

---

## 1. Problem Statement

Build the intelligence to run a recruiter's candidate-screening loop end to end:

1. **Extract** CORE (must-have) vs NICE-TO-HAVE skills from a Job Description (JD).
2. **Assess** candidate fitment against the JD.
3. **Detect** fake / embellished experience and skills in resume(s) — with strong guardrails (legally sensitive).
4. **Score** the resume against the JD on defined parameters.
5. **Generate** screening questions *and* their model answers at three tiers (simple / medium / hard), grounded in the JD + candidate resume, so recruiters can screen, score, and triage a candidate **GREEN** (approve for next round), **AMBER** (hold), or **RED** (reject) *before* the client talks to the candidate.
6. **Collect** client feedback and build an algorithm that learns how each client likes to screen — their preferences and likes, both qualitative and quantitative.
7. Run a fleet of **agents and sub-agents** that continuously assess, sort, categorize, and rank candidates and build a knowledge DB — an intelligent platform to help fulfill client requirements.

## 2. Goal

Build a **web platform in multiple phases** that includes **SSO**, **agentic features**, adds **RAG** where it genuinely helps, and lets both **companies** (direct hiring) and **staff-augmentation / staffing agencies** use the app for their respective needs on a **daily basis**.

---

## 3. The Non-Negotiable Thesis

ManFriday is **employment-decision AI under EEOC scrutiny.** Every score, question, and triage feeds a decision about a person's livelihood. That single fact drives the whole design. The thesis, repeated by every section of the architecture and validated by three independent critics:

- **No fully automated rejection.** A human makes every GREEN/AMBER/RED call.
- **Parameter-by-parameter explainability** over opaque end-to-end models — every number traces to evidence.
- **Immutable run-provenance** on every AI output (reproducible + auditable).
- **Live adverse-impact monitoring** (4/5ths rule + statistical significance) at every decision gate (Phase 2+).

The biggest threat to the project is **not** a wrong technology choice — it is the sum of individually-justifiable choices producing a system so over-weighted toward compliance/infra that it never reaches a design partner. The countermeasure is **ruthless phasing** (see [§10](#10-phase-map-compliance-before-scale)): a thin walking skeleton first, compliance controls built *before* the features that need them, and everything data-hungry deferred until real volume justifies it (**capture data now, model later**).

---

## 4. Engineering Invariants (do not violate)

These are enforced by **DB constraints and a single code path**, never "by convention." If a change would break one of these, stop and flag it.

1. **Human sets triage.** No GREEN/AMBER/RED state can be written without a human actor + a reason code — a server/DB constraint, not a UI nicety. AI only *suggests* (with rationale + evidence spans). RED requires affirmative human action.
2. **Run-provenance on every AI write.** No parse, score, question, triage suggestion, or ranking is persisted without a `*_run` row (`parse_run` / `scoring_run` / `generation_run`) pinning `model_id + prompt_version + params + weight_set + input_hash`. Regenerating the same run config must reproduce the result.
3. **RLS everywhere, including pgvector.** Every tenant-scoped table carries `org_id` with a Row-Level Security policy. The app connects as a **non-`BYPASSRLS`** role and sets `SET LOCAL app.current_org/user/role` per transaction. **pgvector KNN queries are RLS-governed too** — the single most overlooked cross-tenant RAG leak.
4. **Redaction before egress.** No service calls an LLM provider directly. A mandatory PII redaction/tokenization stage (Microsoft Presidio + resume recognizers) sits in front of the multi-model router. Tokenize (don't just strip) to preserve coreference, and keep redaction **offset-preserving** so explainability citations still resolve. Only ZDR / no-training providers for C2/C3 data.
5. **Append-only, hash-chained audit.** `audit_event` is INSERT-only (no UPDATE/DELETE grant), `prev_hash`-chained. It — **not** Temporal history — is the authoritative decision record in *all* phases.
6. **Explainability, never a black box.** Fitment/JD-weighting/preference are **transparent weighted sums of evidence-backed sub-scores**, not end-to-end opaque models. Deterministic-first: countables = SQL/arithmetic, embeddings for semantic proximity, LLM-as-judge **only** on logged "ambiguous" branches. There is no opaque "fit: 78" anywhere.
7. **Demographics segregated; no BISG.** Protected-class data is voluntary self-ID only, in a physically/logically separated store with **no read path from scoring**. No name/ZIP/BISG inference, ever.
8. **Authenticity = advisory signals only.** Fraud/inflation detection surfaces *signals* for a recruiter; it **never** auto-rejects and is **never** silently folded into the fitment score.
9. **Triage is per `(candidate × req)`**, never a global label on a person. RED-for-this-req is not RED-forever — the candidate re-enters the pool for other reqs.
10. **Resumes are immutable versioned rows.** A new upload = a new row (`content_hash`, `is_current`, `superseded_by`), never an update. Scoring pins a `resume_version`.
11. **Redaction before scoring.** Scoring runs on a redacted profile — no name / grad-year / school / address in scoring inputs.
12. **Bounded personalization (Phase 5).** Client-preference learning is a capped delta on top of client-agnostic merit that **can never move a candidate across the GREEN/RED boundary**, and learned preferences are bias-screened before they influence ranking.

---

## 5. What ManFriday Is (one paragraph)

Multi-tenant AI for recruiting and candidate screening, serving **staff-aug agencies** (one agency, many client companies) and **direct-hire companies** on **one codebase**, differentiated only by a `tenant_type` flag and an internal-vs-external `client` entity. It delivers an **explainable, reproducible, human-decided screening loop**: parse a JD into CORE-vs-NICE weighted skills (span-grounded, recruiter-overridable, version-pinned) → score each candidate as a transparent weighted composite of evidence-backed sub-scores against a frozen per-req `ScoringSpec` → generate tiered screening questions with structured JSON answer keys → human triage with reason codes. Authenticity signals, client-preference learning, and continuous-assessment agents layer on later.

## 6. Personas & Tenancy Model

**Tenancy:** shared-schema Postgres with RLS keyed on `org_id`. The agency→client relationship is **data, not a tenancy boundary**: a `Client` is a *row* inside the agency's org. A direct-hire company is an org whose single `Client` row is itself (`org.type = 'direct'`). One code path serves both.

- **Org** (root tenant: agency or direct) → **Client** (a company served; == self for direct) → **Requisition/Req** (a job) → candidates/screens/feedback hang off reqs.
- A user holds **memberships** `(user_id, org_id, role, scope)`; scope is `org`, a set of `client_id`s, or a set of `req_id`s. There is no impersonation magic.

| Persona | Scope | Sets triage? |
|---|---|---|
| Agency recruiter | assigned reqs in own org | **Yes** (human decision) |
| Agency admin | whole org | can override recruiter (logged) |
| Client hiring manager / interviewer | own client only (read-mostly, redacted view) | No — drives `CLIENT_*` accept/reject |
| Candidate | own profile only | No |
| Platform super-admin | platform ops | No (break-glass for PII, logged) |
| Auditor / Compliance | read audit + bias data | No (read-only) |

Clients see a **redacted** shortlist: no fraud signals, no RED candidates, no internal notes.

## 7. The Central Screening Workflow

```
Req intake → JD skill extraction (CORE/NICE + weights, recruiter-confirmed)
→ candidate sourcing/upload → dedupe → fitment scoring (+evidence spans)
→ authenticity signals (advisory) → screening-question generation (3 tiers + answer keys)
→ recruiter conducts/records screen → GREEN/AMBER/RED triage (human + reason code)
→ submit redacted shortlist to client → client review/interview → feedback capture
→ preference-learning loop → re-rank pool
```

**Fitment parameters** (each a transparent sub-score with evidence): CORE skill coverage, NICE skill coverage, depth/recency, domain/industry match, experience-level fit, authenticity confidence (reported *separately*, never folded in), logistics fit (location/work-auth/comp).

---

## 8. Architecture at a Glance

Request flow: **Browser → Next.js BFF (tRPC) → FastAPI Python AI services (REST/OpenAPI) → background workers → PostgreSQL 16 + pgvector.** The BFF holds an HttpOnly encrypted session and mints short-lived (5-min) EdDSA-signed internal JWTs carrying `org_id/client_id/role/consent` claims; **tokens never reach the browser.** Every LLM/embedding op goes through a **thin in-house multi-model router** that redacts PII, enforces per-sensitivity provider policy, validates structured JSON output (with self-repair), and stamps `model_id + prompt_version + input_hash` into the run tables.

Cross-cutting decisions (full rationale in [ARCHITECTURE → Cross-Cutting Decisions](docs/ARCHITECTURE.md)):

- **One multi-tenant data model, RLS-enforced** — agency and direct-hire are the same code path.
- **Thin multi-model router as the single LLM seam** — `generate(task, input, schema, policy)`; one owner, one contract; decision-path models are change-controlled and fairness-revalidated.
- **Explainability everywhere** — transparent composite, deterministic-first, never a black box.
- **Human-in-the-loop, made measurable** — the UI must NOT pre-select the AI suggestion; per-recruiter AI-agreement rate + time-to-decision are instrumented to catch rubber-stamping.
- **Immutable run-provenance + append-only audit, enforced by constraint.**
- **Demographics segregated; adverse-impact monitoring at every gate** (incl. the recall/retrieval filter — it's a selection gate, not neutral search).
- **Buy commodity, build differentiated/compliance-critical** — buy WorkOS, commercial resume parser (later), Lightcast taxonomy, Langfuse/Sentry; build the router, the scoring/fairness core, the impact-stats engine.

## 9. Technology Stack

> Phase 1 stance: **start simple, instrument heavily, defer scale** — a monolith-of-services on managed infra (no Kubernetes), but every decision path is observable, attributable, and reproducible from day one.

| Layer | Choice | Notes |
|---|---|---|
| Frontend / BFF | **Next.js 15 (App Router) + React 19**, TS strict | RSC for data-heavy dashboards; Server Actions = narrow mutation surface, not where AI logic lives |
| UI | **shadcn/ui + Radix + Tailwind v4**, TanStack Table, **TanStack Query v5**, Zustand | shadcn source-in-repo for audit/a11y; Query for long-lived polling dashboards |
| Browser ↔ BFF | **tRPC** (or Server Actions) | end-to-end TS, no codegen, same repo |
| BFF ↔ Python | **REST + OpenAPI 3.1**, `openapi-typescript` | language-neutral seam; **CI fails on contract drift**; each AI response carries `model_id/prompt_version/score_version/trace_id` |
| AI services | **Python + FastAPI** | JD extraction, resume parsing, fitment scoring, question gen |
| Background jobs | **Arq + Redis** (Phase 1) → **Temporal** (Phase 2+) | Arq is async-native, fits seconds-to-minutes pipelines; Temporal for durable long-lived/HITL/agent workflows |
| Agents (Phase 4) | **LangGraph inside Temporal activities** | step budgets enforced; never an unbounded LLM loop |
| Primary DB + vectors | **PostgreSQL 16 + pgvector 0.8 (HNSW)** | one DB for rows, scores, audit, embeddings; **Neon** (Phase 1, branch-per-PR) → **Aurora** later *(in-VPC RDS-vs-Neon is an open decision — decide before PII lands)* |
| Object storage | **S3** (SSE-KMS, presigned URLs) | resumes/JDs/PDFs immutable originals; never overwrite a resume a decision was made on |
| Search | **Postgres FTS + pgvector hybrid** (BM25 + dense, RRF) | cross-encoder reranker added Phase 4; SQL (not RAG) for counts/ranking/timeline math |
| Cache / eventing | **Redis** + Postgres outbox + Redis streams | LLM response cache keyed by `(prompt_version, model_id, content_hash)` — reproducible + cost control |
| LLM seam | **In-house multi-model router** over LiteLLM | redaction pre-hook (Presidio), per-sensitivity provider policy (ZDR/no-train only), structured-output + self-repair, content-hash cache, stamps provenance |
| Models | Provider-abstracted (Claude / OpenAI / Gemini / open) | cheap/fast model for parse/extract; frontier only for nuanced fitment + question gen; Batch API for bulk |
| Enterprise auth | **WorkOS** (SAML/OIDC SSO + SCIM) | candidates use **in-house** passwordless magic-link + OTP (off the per-MAU IdP). **Clerk dropped.** |
| AuthZ | **RBAC + scoped EdDSA JWT + Postgres RLS** | OpenFGA (ReBAC) + SPIFFE/SPIRE **deferred** until the relationship graph / service mesh justify them |
| Cloud / deploy | **AWS ECS Fargate** (Python/workers, one VPC) + **Vercel** (Next.js) | Terraform IaC; GitHub Actions CI/CD (lint, typecheck, OpenAPI diff, tests, container build) |
| Secrets / keys | **AWS KMS** envelope encryption (per-tenant DEK ⊂ KEK) | crypto-shred deletion; managed secret store; no secrets in repo |
| Observability | **OpenTelemetry** (one `trace_id` end-to-end) + **Sentry** + **Langfuse** (self-hosted, in-VPC) | + Grafana Cloud/Datadog; feature flags (LaunchDarkly/Unleash) to shadow-test + bias-audit model changes |
| File parsing | sandboxed, **egress-denied** workers (gVisor/Firecracker) | ClamAV scan, MIME-by-content, XXE/macros disabled, size caps — resumes are an untrusted prompt-injection surface |

**Cost reality:** infra is small (~$1–3k/mo Phase 1); **LLM spend dominates** (~30–80k tokens/candidate). The unit-economics knob is *which model runs which task*, monitored in Langfuse, under a hard per-tenant token budget.

## 10. Phase Map (compliance-before-scale)

Two ordering principles: **(1) compliance-before-scale** — provenance/audit/redaction floor and then adverse-impact monitoring are built *before* the features that need them; **(2) de-risk the uncertain AI early** — each phase opens with a time-boxed spike on its riskiest unknown. Full detail in [`docs/ROADMAP.md`](docs/ROADMAP.md).

| Phase | Title | One-line scope | Gates / depends on |
|---|---|---|---|
| **0** | Foundations & Compliance Skeleton | Multi-tenant RLS spine, run-provenance tables, hash-chained audit, multi-model router, Presidio redaction, in-house auth. *No decision logic yet.* Spike: cross-tenant leak probe. | entry point (8–10 wks) |
| **1** ★ | **MVP: Explainable Single-Tenant Screening Loop** ← **MVP CUT LINE** | JD→CORE/NICE weighted skills → transparent fitment sub-scores w/ evidence → tiered Q&A + JSON keys → **human** GREEN/AMBER/RED. One design-partner agency, low volume. Spike: span-grounding/hallucination. | needs Phase 0 |
| **2** | Adverse-Impact Monitoring & Bias Auditing | Segregated demographics (voluntary self-ID, no BISG), 4/5ths + significance at every gate, faithful explanations, WORM audit anchoring, 3rd-party audit vendor. **The gate that unlocks scale.** | needs a real loop (1); gates 3/4/5 |
| **3** | Multi-Tenant Scale, Enterprise SSO & ATS | WorkOS SSO/SCIM, OpenFGA at scale, server-side redaction wall (agency↔client), Merge.dev ATS import, commercial resume parser, SPIFFE workload identity. | needs Phase 2 |
| **4** | Durable Agentic Continuous Assessment & RAG-at-Scale | Temporal + LangGraph agents (**advisory-only**, human-gated), two-stage recall-then-score, hardened cited RAG, **fenced fraud detection**. The differentiator. | needs 2+3 |
| **5** | Client Preference Learning & Personalized Ranking | Hierarchical (req⊂client⊂global) model, LambdaMART, bounded delta that can't cross GREEN/RED, continuous proxy/4-5ths screening w/ auto-dampening. **Most bias-sensitive — last.** | needs 2+4 + feedback corpus |
| **6** | Hardening, Isolated-Tier & Regulatory Breadth | db-per-tenant escape hatch, Aurora/Qdrant if triggers fire, private-inference tier, multi-jurisdiction compliance, candidate self-service. | demand/contract/regulation-triggered |

> **Execution re-sequenced (2026-05-29) — wedge-first.** Go-to-market now leads with a **Wedge: Compliant Talent CRM** (resume DB + mass candidate outreach, ~$10/user, riding the Phase-0 compliance spine) as the new **Phase 1**; the explainable screening loop above (originally Phase 1) becomes the **premium Phase 2**, shifting originals 2→3 … 6→7. The compliance-before-scale ordering is preserved. This table remains the original compliance-ordered map; the **live execution sequence + green-checked status is [`STATUS.md`](STATUS.md)**.

## 11. Domain Glossary

- **JD** — Job Description.
- **CORE vs NICE** — must-have vs nice-to-have skills extracted from a JD, each weighted 0–1 and **recruiter-confirmed** (the weight vector *is* the scoring rubric, so it's version-pinned and logged).
- **Requirement Graph** — the structured, weighted, auditable artifact a parsed JD becomes; every downstream service reads from it.
- **ScoringSpec** — the per-req **frozen** config: skills, weights, thresholds, pinned model/embedding versions, temperature 0. A version upgrade never retroactively re-scores an open req.
- **Fitment** — candidate-vs-JD match, computed as a transparent weighted composite of evidence-backed sub-scores.
- **GREEN / AMBER / RED** — triage states: approve-for-next-round / hold / reject. **Always human-set**, per `(candidate × req)`.
- **Run-provenance / `*_run`** — `parse_run`, `scoring_run`, `generation_run`: snapshots making every AI output reproducible.
- **RLS** — Postgres Row-Level Security; the structural tenant-isolation backstop.
- **BFF** — Backend-for-Frontend (the Next.js layer that holds sessions and mints internal JWTs).
- **`tenant_type`** — `agency` vs `direct`; the one flag that forks behavior on a shared model.
- **IntegrityReport** — the immutable advisory object holding authenticity/fraud signals (recruiter-adjudicated; suppressed from clients).
- **Preference model** — per-client learned screening taste (Phase 5); versioned, human-approved before activation.
- **4/5ths rule** — adverse-impact threshold: a group's selection rate < 80% of the top group's rate flags potential disparate impact.
- **HITL** — human-in-the-loop.
- **ZDR** — zero-data-retention (required LLM-provider contract term for candidate data).

## 12. Documentation Index

| Doc | What's in it |
|---|---|
| **[`CLAUDE.md`](CLAUDE.md)** (this file) | Persistent context anchor: problem, goal, invariants, stack, phase map, glossary, open decisions. |
| **[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)** | The full design (1,245 lines, 13 sections). Section map below. |
| **[`docs/ROADMAP.md`](docs/ROADMAP.md)** | The 7 phases in detail with goals, scope, spikes, compliance gates, deliverables, dependencies, success metrics. |

**`docs/ARCHITECTURE.md` section map** (jump targets):
Executive Summary · System Overview · Cross-Cutting Architecture Decisions · Reconciliation & Resolved Trade-offs · **Product Decomposition, Personas & Core Workflows** (capability map C1–C8, GREEN/AMBER/RED state machine, AI-automatable vs HITL) · **Domain Data Model & Multi-Tenant Schema** (the 8–12 load-bearing tables, embeddings, reproducibility, soft-delete/retention) · **AuthN, SSO, RBAC & Tenant Isolation** · **JD Ingestion & CORE-vs-NICE Extraction** · **Resume Parsing & Fitment Scoring** · **Fake-Experience & Skill-Inflation Detection** · **Screening Question & Answer-Key Generation** · **Client Preference Learning** · **Agentic Architecture & Multi-Model Routing** · **RAG & Retrieval Design** · **Technology Stack & Observability** · **Security, PII, Privacy & Retention** · **EEOC Compliance, Bias Auditing & Adverse-Impact Monitoring** · **Consolidated Risk Register** · **Open Decisions for the Product Owner**.

> **Note on conflicts:** where the older "Technology Stack" prose still says "Clerk or WorkOS," the later **"Reconciliation & Resolved Trade-offs"** section is authoritative — **WorkOS for enterprise, in-house magic-link for candidates, Clerk dropped.** Same for: Temporal is Phase 2+ (Arq+Redis in Phase 1); BISG is rejected everywhere; OpenFGA/SPIFFE are deferred; continuous agents are Phase 4, *not* a Phase 1 promise.

## 13. Open Decisions (blocking or shaping work)

Many are **product/legal calls only the owner + counsel can make** — surface them, don't guess. **Each now has a proposed default in [`docs/DECISIONS.md`](docs/DECISIONS.md) awaiting ratification** (the PRD and Phase 0 spec assume those defaults). Highest-priority (full list in [ARCHITECTURE → Open Decisions](docs/ARCHITECTURE.md)):

- **Candidate consent & cross-client reuse model** *(Phase 0 schema blocker)* — is a candidate org-scoped, client-partitioned, or globally shared with consent gating? The reusable talent pool can't be modeled without this.
- **Demographic-data source & sufficiency** *(Phase 0 legal gate)* — confirm voluntary self-ID is binding, design the collection UX, set the minimum-cell-size policy. The entire EEOC defense rests on a data source no one has confirmed will exist at adequate volume.
- **Agency-vs-client EEOC liability** — is ManFriday the employer's agent (direct Title VII exposure) or strictly a vendor? Drives contracts/DPAs and the audit schema.
- **Jurisdictional compliance floor** — US-baseline EEOC vs NYC LL144 + Colorado SB205 + Illinois. Materially changes scope.
- **Retention vs deletion** — one authoritative policy reconciling right-to-delete (CCPA/CPRA/AEDT) with EEOC/OFCCP recordkeeping (crypto-shred PII, retain de-identified decision metadata).
- **Per-candidate/req LLM + parsing cost ceiling** — unblocks the commercial-parser-vs-LLM-only build/buy call and router routing aggressiveness.
- **Protocol when a client's own decisions repeatedly fail 4/5ths** — silently dampen, warn, refuse, or escalate? (Counsel, before launch.)
- **Infra VPC posture** — in-VPC RDS vs Neon/Vercel DX; **decide before candidate PII lands in Neon.** Plus super-admin break-glass vs BYOK.
- **Un-owned spine components to scope before Phase 1 freezes** — assessment delivery/response capture, client portal/feedback interface, the canonical triage state machine, comms/adverse-action-notice service, reason-code taxonomy, score-calibration governance.

## 14. Repository Layout

```
manfriday/
├── CLAUDE.md  README.md  SETUP.md  STATUS.md   # context anchor · intro · setup · live status
├── docs/                # ARCHITECTURE · ROADMAP · PRD · DECISIONS · PHASE_0 · PHASE_1_BUILD · WEDGE_UI
├── web/                 # Next.js 15 BFF + integrated-product UI (mocked behind a data seam)
│   ├── app/             # ✅ routes: dashboard · login · candidates(+[id]/import) · requisitions(+[id]) · outreach · settings · screening
│   └── lib/             # ✅ data/ seam (DATA_SOURCE=mock|api) · sample-data · auth (EdDSA JWT) · api
├── services/
│   ├── api/             # FastAPI: db (RLS models + Alembic), router, redaction, audit,
│   │                    #   provenance, crypto, auth, telemetry, ingestion, ✅ parsing
│   └── workers/         # Arq worker: ingest + ✅ parse_resume (workers → api workspace dep)
├── packages/
│   ├── contracts/       # OpenAPI 3.1 emitted by FastAPI → generated TS client
│   └── prompts/         # versioned prompt templates (git = version pin)
├── infra/               # Terraform skeleton (AWS + Vercel + Neon)
├── db/                  # leak-probe fixtures · pgbouncer.dev.ini · RLS p95 benchmark
├── .github/workflows/   # CI: js · python · db-gates · container
└── .claude/settings.local.json
```
*(Monorepo **built** (pnpm + uv workspaces); ✅ marks Phase-1-wedge code already landed. See [`STATUS.md`](STATUS.md) for the live step status and [§15](#15-where-we-are--whats-next).)*

## 15. Where We Are / What's Next

**Done:** problem framing, full architecture, phased roadmap, this context anchor, **PRD**, **decision log** ([`docs/DECISIONS.md`](docs/DECISIONS.md)), **buildable Phase 0 spec** ([`docs/PHASE_0.md`](docs/PHASE_0.md)), and the **Phase 0 build itself** — all 14 work packages, on branch `phase-0-foundations`, **47 tests green** locally.

**Phase 0 — built + locally validated (mypy strict + ruff + 47 pytest):**
WP 0.1 monorepo scaffold + CI shell + Terraform skeleton · 0.2 multi-tenant RLS spine · 0.3 cross-tenant leak probe (SQL / pgvector-KNN / worker / PgBouncer) · 0.4 provenance spine (run tables + tall `score`) · 0.5 append-only hash-chained audit · 0.6 immutable versioned resume + object store · 0.7 PII envelope encryption + crypto-shred · 0.8 PII redaction (Presidio) · 0.9 multi-model router · 0.10 in-house auth (EdDSA JWT → RLS, TOTP) · 0.11 Arq + Redis ingestion worker · 0.12 OpenAPI drift gate · 0.13 observability (OTel / Sentry / flags) · 0.14 exit review.

**Exit criteria — all met locally:** ① leak probe green (CI gate wired) · ② 100% AI writes carry a run id (NOT-NULL FK + bare-insert rejection) · ③ p95 RLS query < 50ms (measured ≈0.1ms — `db/bench_rls_p95.py`) · ④ audit chain verifies unbroken · ⑤ walking skeleton (login → upload → stored immutably + audited). Invariants enforced + tested: **#2** provenance · **#3** RLS isolation · **#4** redaction-before-egress · **#5** append-only audit · **#11** PII-at-rest/crypto-shred.

**Gated / not blockers:** owner ratification of [`DECISIONS.md`](docs/DECISIONS.md) ⚖️ items (D2/D3/D5/D7 — counsel) before real candidate PII; **cloud provisioning** (Neon/Vercel/AWS/KMS — local dev uses Postgres / Redis / filesystem / local-KEK stand-ins behind swappable interfaces); the CI gates run on every push to `qashsolutions/manfri` and are **green** (js · python · db-gates · container).

**Phase 1 (the wedge — Compliant Talent CRM) — in progress** (live tracker: [`STATUS.md`](STATUS.md); plan: [`docs/PHASE_1_BUILD.md`](docs/PHASE_1_BUILD.md); UI map: [`docs/WEDGE_UI.md`](docs/WEDGE_UI.md)):
- ✅ **1.1** org-isolated product schema (`candidate`/`requisition`/`jd_skill`/`proposal`/`consent_ledger`) + RLS, folded into the replayable baseline — CI green.
- ✅ **1.2** deterministic résumé parser (`services/api/app/parsing`) + Arq `parse_resume` job: bytes → reproducible **non-PII** `parsed_jsonb` + a `parse_run` (invariant #2), RLS-scoped + audited — CI green.
- ✅ **1.3** FastAPI product endpoints (candidates · résumés single+bulk · requisitions · jd_skill · transparent skill-overlap matching · completeness · proposals · outreach audience · stats), 23 ops, OpenAPI→TS regenerated — CI green.
- ✅ **1.4** web `api` data provider wired (server-side JWT mint) + `force-dynamic`; mock stays the dev/CI default; own-org list shows decrypted name (contact detail-only); Phase-2/gated surfaces throw a clear "not in this phase" — CI green.
- ⛔ **1.5** owner-provisioned **Supabase** (Postgres+pgvector + Storage) for prod · **1.6** bulk-upload UI + outreach **send** (email provider + CAN-SPAM, owner/counsel-gated).

The integrated-product UI is mocked in `web/app` behind a `DATA_SOURCE=mock|api` seam, so prod switches to real data without a rewrite. Real candidate PII (Supabase prod, `DATA_SOURCE=api`) stays gated on counsel sign-off (⚖️ D2/D3/D5) + a Supabase region/DPA.

## 16. Working Conventions for Claude

- **This is employment-decision software.** Before writing anything that touches a score, a triage, demographics, or an LLM call, re-read [§4 Invariants](#4-engineering-invariants-do-not-violate). When in doubt, the more conservative (more human-gated, more auditable, less automated) option wins.
- **Don't guess legal/product calls.** The [§13](#13-open-decisions-blocking-or-shaping-work) items are the owner's (and counsel's) to make — surface them, propose options, but don't silently pick one and build on it.
- **Respect the phasing.** Don't pull Phase 2–5 capabilities (monitoring, agents, fraud detection, preference learning) into earlier work "because it's easy now." The order is a compliance argument, not a backlog.
- **Keep the docs in sync.** When a decision is made or the design changes materially, update the relevant `docs/` section *and* the affected part of this file. If this file and the docs drift, fix it.
- **Match the codebase when code exists.** Until then, follow the stack and contracts in [§9](#9-technology-stack) / [§8](#8-architecture-at-a-glance).
- **Commit/push only when asked.** This repo is on `main` with no remote configured yet; branch before committing if work begins.
