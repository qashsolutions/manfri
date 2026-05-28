# ManFriday — Product Requirements Document (PRD)

> Companion to [`ARCHITECTURE.md`](ARCHITECTURE.md) (how), [`ROADMAP.md`](ROADMAP.md) (when), [`DECISIONS.md`](DECISIONS.md) (open calls + proposed defaults), and [`PHASE_0.md`](PHASE_0.md) (the foundation build).
> This PRD is the **what** and **for whom**. It assumes the proposed defaults in `DECISIONS.md`; if one is overridden, revisit the requirements that cite it.
>
> **Scope of this PRD:** the whole product at a glance, then a precise **MVP (Phase 1) cut line**. Requirements are tagged **[MVP]** (Phase 1), **[P2]**…**[P6]** (later phase), or **[ALL]** (cross-cutting invariant). IDs (`FR-*`, `NFR-*`) are for traceability.

---

## Table of Contents
1. [Vision & One-Liner](#1-vision--one-liner)
2. [Target Users & Jobs-to-Be-Done](#2-target-users--jobs-to-be-done)
3. [Product Principles (non-negotiable)](#3-product-principles-non-negotiable)
4. [Product Scope by Phase](#4-product-scope-by-phase)
5. [MVP Definition (Phase 1 cut line)](#5-mvp-definition-phase-1-cut-line)
6. [Functional Requirements by Capability](#6-functional-requirements-by-capability)
7. [Key User Flows](#7-key-user-flows)
8. [Triage State Machine](#8-triage-state-machine)
9. [Non-Functional Requirements](#9-non-functional-requirements)
10. [Success Metrics / KPIs](#10-success-metrics--kpis)
11. [MVP Acceptance Criteria](#11-mvp-acceptance-criteria)
12. [Assumptions, Dependencies & Out-of-Scope](#12-assumptions-dependencies--out-of-scope)

---

## 1. Vision & One-Liner

**ManFriday is multi-tenant AI for recruiting and candidate screening that gives recruiters an explainable, reproducible, human-decided screening loop** — turning a job description and a stack of resumes into evidence-backed fitment scores, tiered screening questions with answer keys, and a defensible GREEN/AMBER/RED triage — for both **staff-augmentation agencies** (one agency, many client companies) and **direct-hire companies**, on one codebase.

The wedge is **trust and defensibility**: every score traces to evidence, every decision is made by a human and audited, and the platform is built to survive EEOC scrutiny — the opposite of an opaque "AI résumé screener."

## 2. Target Users & Jobs-to-Be-Done

(Full personas + permissions in [ARCHITECTURE → Personas](ARCHITECTURE.md). Summary here.)

| User | Primary job-to-be-done |
|---|---|
| **Agency recruiter** *(primary MVP user)* | "Screen this stack of candidates against this JD, fast and defensibly, and give my client a shortlist I can stand behind." |
| **Agency admin** | "Manage my team, my client relationships, and our scoring standards; prove we screen fairly." |
| **Client hiring manager** | "Show me a vetted shortlist with the reasoning, let me give feedback, and don't waste my time." |
| **Candidate** | "Let me submit my resume, control my data, and be assessed on my merits." |
| **Compliance / auditor** | "Prove who decided what, on what basis, and that we aren't producing adverse impact." |

**MVP focuses on the agency recruiter** (the daily user who feels the pain) at a **single design-partner agency** in the **software/technical staffing** vertical ([D11](DECISIONS.md#d11-initial-vertical--role-mix)).

## 3. Product Principles (non-negotiable)

These are product requirements, not aspirations. They mirror the engineering invariants in [`CLAUDE.md` §4](../CLAUDE.md).

- **P-1 Human decides, AI suggests.** No candidate is ever auto-rejected or auto-advanced. A human sets GREEN/AMBER/RED with a reason code. **[ALL]**
- **P-2 Every number has evidence.** No opaque "fit: 78." Each sub-score cites the resume/JD spans behind it. **[ALL]**
- **P-3 Reproducible.** Re-running a score with the same pinned inputs yields the same result. **[ALL]**
- **P-4 Auditable.** Every decision-affecting action is in an immutable, attributable trail. **[ALL]**
- **P-5 Fair by construction.** Protected-class signals are excluded from scoring; the product is monitored for adverse impact (live from P2). **[ALL]**
- **P-6 Tenant-isolated.** A user can never see another tenant's data — including via search/AI. **[ALL]**
- **P-7 Don't over-automate the risky parts.** Authenticity verdicts and triage stay human; AI assists. **[ALL]**

## 4. Product Scope by Phase

The product is delivered in phases (detail in [`ROADMAP.md`](ROADMAP.md)). At a product level:

| Phase | What the *product* can do |
|---|---|
| **0** | (Foundation — no user-facing product yet.) A recruiter can log in to an isolated tenant, upload a resume, and see it stored immutably + audited. |
| **1 ★ MVP** | The full single-agency screening loop: JD → weighted CORE/NICE skills → evidence-backed fitment → tiered Q&A + answer keys → **human** triage → redacted shortlist + feedback capture. |
| **2** | Adverse-impact dashboards, faithful adverse-action notices, demographic self-ID collection — the platform becomes *defensible at volume*. |
| **3** | Many tenants; enterprise SSO/SCIM; the redaction wall between agency recruiters and client hiring managers; ATS import; commercial parser. |
| **4** | Continuous background agents re-ranking the talent pool; advisory fraud/authenticity flags; hardened cited RAG. |
| **5** | Per-client preference learning as a bounded, audited personalization delta. |
| **6** | Isolated tier, private inference, multi-jurisdiction breadth, candidate self-service depth. |

## 5. MVP Definition (Phase 1 cut line)

**MVP = the smallest slice that delivers daily recruiter value AND proves the "explainable, reproducible, human-decided" thesis end to end, producing the audited decision events every later phase learns from.**

### In scope (MVP)
- One design-partner **agency** tenant (RLS on, but onboarded as a single tenant), software/technical roles.
- **JD ingestion** (paste + file upload) → CORE/NICE weighted skill extraction, span-grounded, recruiter-overridable, version-pinned.
- **Candidate ingestion** (PDF/DOCX upload + talent-pool reuse within the org) → parse → normalize → dedupe.
- **Fitment scoring** as a transparent weighted composite of evidence-backed sub-scores against a frozen per-req `ScoringSpec`, on a **redacted** profile.
- **Screening Q&A generation:** per-(skill, tier) pool of simple/medium/hard questions with **structured JSON answer keys/rubrics**, grounded in JD ∩ resume.
- **Recruiter screen capture + manual grading** (AI-assist optional, no auto-grade) → **human GREEN/AMBER/RED** with reason code.
- **Redacted shortlist view + structured feedback capture** (the minimal "client" surface; [D9](DECISIONS.md#d9-un-owned-spine-components)).
- **Talent pool** with per-(candidate × req) screens; RED is non-terminal.
- Full **provenance + audit + redaction** inherited from Phase 0.

### Out of scope (MVP) — deferred, and we say so
- Adverse-impact monitoring **at scale** (P2 — MVP runs under contractual cover, audit trail captures everything for retrospective analysis).
- Enterprise SSO/SCIM (P3 — MVP uses in-house auth), multi-tenant onboarding at scale (P3).
- ATS import/write-back (P3), commercial resume parser (P3).
- Continuous background agents, fraud/authenticity detection, hardened RAG-at-scale (P4).
- Client preference learning / personalized ranking (P5).
- Async recorded video screening; candidate self-service portal depth (P6).

## 6. Functional Requirements by Capability

Mapped to capability domains C1–C8 (ARCHITECTURE → Capability Map).

### C1 — Requisition & JD Intelligence
- **FR-1.1 [MVP]** Recruiter creates a requisition with metadata (role, seniority, location, employment type, client, comp band) and provides a JD via **paste or PDF/DOCX/HTML upload**.
- **FR-1.2 [MVP]** The system parses the JD into a structured **Requirement Graph**: each requirement tagged **CORE/NICE**, assigned a **weight (0–1)**, normalized to the skill taxonomy, with an **evidence quote / char-span** in the JD.
- **FR-1.3 [MVP]** Every extracted requirement is **span-grounded** — it must map to a verbatim substring of the JD; hallucinated requirements are rejected (hard gate).
- **FR-1.4 [MVP]** The recruiter can **edit CORE/NICE labels and weights**; recruiter edits always win and are logged as training signal.
- **FR-1.5 [MVP]** On confirmation, the weight set is **version-pinned** to the req (it *is* the scoring rubric).
- **FR-1.6 [MVP]** High-legal-risk requirement types (work-auth, location, experience-year floors, language) are **flagged**; they cannot become hard CORE screen-outs without an admin override + recorded **job-relatedness justification**.
- **FR-1.7 [P3]** Import JDs from ATS (Greenhouse/Lever/Ashby/Workday via Merge.dev).

### C2 — Candidate Ingestion
- **FR-2.1 [MVP]** Upload resumes (PDF native + scanned, DOCX); files are virus-scanned and parsed in a sandboxed worker.
- **FR-2.2 [MVP]** Parse into a versioned `ParsedResume` with **per-field provenance** (source span, page, confidence). Resumes are **immutable versions** (new upload = new row).
- **FR-2.3 [MVP]** **Dedupe** against the existing pool (name+email+phone+content-hash).
- **FR-2.4 [MVP]** Capture **consent** at ingestion as an immutable ledger event; distinguish candidate-submitted vs recruiter-sourced ([D1](DECISIONS.md#d1-candidate-consent--cross-client-reuse-model)).
- **FR-2.5 [MVP]** Reuse a parsed candidate across the org's reqs (the talent pool) under the consent model.
- **FR-2.6 [P3]** OCR at volume via managed Document Intelligence; commercial parser backbone.

### C3 — Fitment Scoring
- **FR-3.1 [MVP]** Score each candidate against the **pinned `ScoringSpec`** on the defined parameters (CORE coverage, NICE coverage, depth/recency, domain match, experience-level fit, authenticity confidence *(reported separately)*, logistics fit).
- **FR-3.2 [MVP]** Each parameter score carries **evidence spans** (resume/JD citations) and a short rationale — **no parameter is an unexplained number**.
- **FR-3.3 [MVP]** The composite is a **transparent weighted sum** of the sub-scores; the breakdown is always visible.
- **FR-3.4 [MVP]** Scoring runs on a **redacted** profile (no name/grad-year/school/address in inputs).
- **FR-3.5 [MVP]** Every score links to a `scoring_run` pinning model + prompt + weights + input hash; **"regenerate this exact score" works**.
- **FR-3.6 [MVP]** Authenticity confidence is **never silently folded** into the advance/reject decision.
- **FR-3.7 [MVP]** The recruiter can **override** any sub-score or the composite (logged with reason).

### C4 — Authenticity / Fraud Signals
- **FR-4.1 [P4]** Surface advisory **signals** (inflated tenure, claims without project evidence, impossible timelines, template markers) as an immutable `IntegrityReport`.
- **FR-4.2 [ALL]** Authenticity signals are **advisory only** — never auto-reject, never folded into fitment, never shown to clients. (Invariant holds even before C4 ships.)
- **FR-4.3 [P4]** Candidate **right-to-respond** on MEDIUM/HIGH flags; AI-text detection is a weak corroborating signal only, never an accusation.

### C5 — Screening Question & Answer-Key Generation
- **FR-5.1 [MVP]** Generate, per relevant (skill, tier), a **pool of 3–5 questions** at **simple/medium/hard**, grounded in **JD-CORE ∩ resume claims**.
- **FR-5.2 [MVP]** Each question has a **structured JSON answer key/rubric**: weighted expected points, acceptable synonyms, red flags, partial-credit guidance, score thresholds.
- **FR-5.3 [MVP]** Difficulty is **Bloom-anchored** and separately verified by an LLM-as-judge check; bad questions are filtered.
- **FR-5.4 [MVP]** The recruiter **curates** (edit/approve/regenerate) questions before use.
- **FR-5.5 [MVP]** Answer keys are **role-gated** and reveals are audited (anti-leak).
- **FR-5.6 [P2]** Questions pass a **bias review** (no protected-class-proxy probes) before use.

### C6 — Triage & Screen Capture
- **FR-6.1 [MVP]** Recruiter records the screen, grades answers **manually** against the rubric (AI-assist optional; **no auto-grade**, [D12](DECISIONS.md#d12-response-modality--ai-assist-grading)).
- **FR-6.2 [MVP]** Recruiter sets **GREEN/AMBER/RED**; AI may *suggest* a state with rationale + evidence, but the **UI must not pre-select it**.
- **FR-6.3 [MVP]** Setting any state requires a **reason code** (from a v1 controlled taxonomy, [D9](DECISIONS.md#d9-un-owned-spine-components)); RED requires affirmative human action.
- **FR-6.4 [MVP]** Every transition writes an **append-only audit event** {actor, from, to, reason, timestamp, AI-suggestion-at-time, rubric/spec version}.
- **FR-6.5 [MVP]** Triage is **per (candidate × req)**; the same candidate can be GREEN for one req and RED for another.

### C7 — Client Review & Feedback
- **FR-7.1 [MVP]** Submit **GREEN** candidates as a **redacted shortlist** with rationale (no fraud signals, no RED candidates, no internal notes). **AMBER is never auto-submitted** ([D10](DECISIONS.md#d10-ats-write-back-placement-lifecycle--amber-auto-submit)).
- **FR-7.2 [MVP]** Capture **structured + free-text client feedback** and interview outcome (the input boundary for later preference learning).
- **FR-7.3 [P3]** Full client portal with per-client redaction-wall configuration enforced server-side.

### C8 — Talent CRM & Preference Learning
- **FR-8.1 [MVP]** Candidates are **first-class, req-independent** entities reusable across the org's reqs; freshness/consent TTLs apply.
- **FR-8.2 [P4]** Background agents continuously re-assess and re-rank the pool against open reqs.
- **FR-8.3 [P5]** Per-client **preference model** personalizes ranking as a **bounded delta** that can never cross GREEN/RED and is bias-screened before activation.

## 7. Key User Flows

**Flow A — Screen a candidate (the core loop) [MVP]:**
`Recruiter creates req → pastes/uploads JD → reviews & confirms CORE/NICE weights → uploads/selects candidates → system scores each (evidence-backed) → recruiter reviews fitment breakdown → generates & curates tiered questions → conducts/records screen, grades answers → sets GREEN/AMBER/RED with reason → submits GREEN shortlist to client → records client feedback.`

**Flow B — Reuse a candidate for a new req [MVP]:**
`Recruiter opens new req → searches talent pool (RLS-scoped) → selects existing candidate → system scores against the *new* req's ScoringSpec → independent triage (prior RED elsewhere does not carry over).`

**Flow C — Recruiter overrides extraction/score [MVP]:**
`Recruiter flips a NICE→CORE label / adjusts a weight / overrides a sub-score → change logged as training signal + audit event → re-score uses the updated, re-pinned spec.`

## 8. Triage State Machine

States: `UNSCREENED → SCREENING → {GREEN | AMBER | RED}`, plus `SUBMITTED`, `CLIENT_ACCEPTED`, `CLIENT_REJECTED`, `WITHDRAWN`.

- Only a **human** sets GREEN/AMBER/RED (AI suggests). **RED requires a reason.**
- **AMBER → GREEN/RED** requires a re-screen or new evidence.
- **RED is not terminal globally** — the candidate re-enters the pool for other reqs.
- Agency admin can **override** a recruiter's state (logged with reason); the client cannot set internal triage but their accept/reject drives `CLIENT_*`.
- Every transition is an append-only audit event feeding adverse-impact monitoring (live from P2).

## 9. Non-Functional Requirements

- **NFR-1 Explainability [ALL]** — every score/triage is reconstructable parameter-by-parameter from stored evidence + provenance.
- **NFR-2 Reproducibility [ALL]** — identical pinned inputs → identical score (temp 0 + response cache). Target **100%**.
- **NFR-3 Auditability [ALL]** — append-only, hash-chained audit; unbroken-chain verification job.
- **NFR-4 Tenant isolation [ALL]** — RLS on every tenant table incl. pgvector; **0 cross-tenant leaks** in the CI probe.
- **NFR-5 Security/PII [ALL]** — C3 PII envelope-encrypted; redaction-before-egress; ZDR-only providers; sandboxed parsing; prompt-injection defenses on resume text.
- **NFR-6 Performance [MVP]** — JD extraction < 10s synchronous or graceful async; p95 DB query < 50ms with RLS on; score polling responsive.
- **NFR-7 Cost [MVP]** — ≤ ~$0.20 per fully-screened candidate target; hard per-tenant token budget ([D6](DECISIONS.md#d6-per-candidate--per-req-cost-ceiling)).
- **NFR-8 Accessibility [MVP]** — WCAG-grade UI primitives (Radix); ADA accommodation off-ramp at every gate.
- **NFR-9 Data rights [ALL]** — consent ledger; crypto-shred deletion preserving de-identified decision metadata ([D5](DECISIONS.md#d5-retention-vs-deletion-policy)).

## 10. Success Metrics / KPIs

**MVP (Phase 1):**
- A design-partner recruiter **completes a real screen unassisted**.
- **Recruiter agreement with AI-suggested triage** is tracked *with evidence of genuine review* — sub-N-second accepts flagged as rubber-stamps (automation-bias guard).
- **Span-grounding gate rejects ≥ 95%** of injected phantom requirements (test).
- **Score reproducibility = 100%** (identical inputs → identical score).
- JD extraction **< 10s** synchronous or graceful async.
- **0 cross-tenant leaks** in the CI probe (inherited from Phase 0 gate).
- **100% of AI writes carry a run id** (enforced by constraint).

**Leading product signals (post-MVP):** time-to-shortlist per req, % candidates with complete evidence-backed scores, client feedback capture rate, talent-pool reuse rate.

## 11. MVP Acceptance Criteria

MVP is "done" when, for the design-partner agency:
1. A recruiter can run **Flow A end to end** in the product, unassisted, on a real JD + real candidates.
2. Every fitment score shows a **parameter-by-parameter evidence breakdown**, and "regenerate this score" reproduces it exactly.
3. No triage state can be written **without a human actor + reason code** (verified by attempting a system-only write and being rejected).
4. The **span-grounding gate**, **reproducibility**, and **cross-tenant leak** CI gates are green.
5. Generated questions come with **structured JSON answer keys**, are recruiter-curated, and answer-key reveals are audited.
6. A **redacted shortlist** can be produced for a client with **no** fraud signals / RED candidates / internal notes, and structured feedback is captured.
7. The full loop's events are in the **immutable audit trail**, reproducible for a retrospective fairness review.

## 12. Assumptions, Dependencies & Out-of-Scope

**Assumptions** (the proposed defaults in [`DECISIONS.md`](DECISIONS.md) — ratify or override):
- Candidate is **org-scoped**, reusable across the org's clients under blanket-with-revocation consent ([D1](DECISIONS.md#d1-candidate-consent--cross-client-reuse-model)).
- Compliance floor = **US-baseline EEOC** for MVP ([D4](DECISIONS.md#d4-jurisdictional-compliance-floor)).
- **Software/technical staffing** vertical first ([D11](DECISIONS.md#d11-initial-vertical--role-mix)).
- **Recruiter-administered/written** screening, **manual grading** ([D12](DECISIONS.md#d12-response-modality--ai-assist-grading)).
- **Neon** infra for MVP, **no real PII until DPA + encryption confirmed** ([D8](DECISIONS.md#d8-infrastructure--vpc-posture)).

**Dependencies:** Phase 0 foundation ([`PHASE_0.md`](PHASE_0.md)) must ship first (RLS, provenance, router, redaction, audit). Lightcast Open Skills data ([D13](DECISIONS.md#d13-lightcast-license)).

**Hard dependencies on the owner/counsel before the design partner's real candidates are onboarded:** [D2](DECISIONS.md#d2-demographic-data-source--sufficiency) (demographics), [D3](DECISIONS.md#d3-agency-vs-client-eeoc-liability-allocation) (liability posture), [D5](DECISIONS.md#d5-retention-vs-deletion-policy) (retention/deletion).

**Out of scope for MVP:** everything tagged [P2]–[P6] above and in [`ROADMAP.md`](ROADMAP.md) — adverse-impact monitoring at scale, SSO/SCIM, ATS, commercial parser, agents, fraud detection, RAG-at-scale, preference learning, isolated tier, video screening.
