# ManFriday — Product Requirements Document (PRD)

> Companion to [`ARCHITECTURE.md`](ARCHITECTURE.md) (how), [`ROADMAP.md`](ROADMAP.md) (when), [`DECISIONS.md`](DECISIONS.md) (open calls + ratified defaults), [`PHASE_1_BUILD.md`](PHASE_1_BUILD.md) (the build plan), and [`EXTRACTION_REPORT.md`](../EXTRACTION_REPORT.md) (what actually exists in the repo today).
> This PRD is the **what** and **for whom**. It assumes the ratified defaults in `DECISIONS.md`; if one is overridden, revisit the requirements that cite it.
>
> **Scope of this PRD:** the whole lean product at a glance, then a precise **Phase 1 cut line**. Requirements are tagged **[P1]** (Phase 1), **[P2]** / **[P3]** (later phase), or **[ALL]** (cross-cutting invariant). IDs (`FR-*`, `NFR-*`) are for traceability.
>
> **Pivot note.** ManFriday is a **lean recruiter tool** on **TypeScript + Supabase + Vercel**. The Next.js UI in `web/` is built and stays; the backend is being (re)built in TypeScript (Next.js Route Handlers / Server Actions) against Supabase. The earlier heavyweight EEOC-compliance platform posture (adverse-impact monitoring, segregated demographics, hash-chained provenance, redaction-before-scoring, AWS hosting) has been **dropped**. Candidate data is PII and is handled pragmatically (GDPR/CCPA-grade soft/hard delete + CAN-SPAM), not under a formal EEOC defense.

---

## Table of Contents
1. [Vision & One-Liner](#1-vision--one-liner)
2. [Target Users & Jobs-to-Be-Done](#2-target-users--jobs-to-be-done)
3. [Product Principles](#3-product-principles)
4. [Product Scope by Phase](#4-product-scope-by-phase)
5. [Phase 1 Definition (cut line)](#5-phase-1-definition-cut-line)
6. [Functional Requirements by Capability](#6-functional-requirements-by-capability)
7. [Key User Flows](#7-key-user-flows)
8. [Lightweight Triage](#8-lightweight-triage)
9. [Non-Functional Requirements](#9-non-functional-requirements)
10. [Success Metrics](#10-success-metrics)
11. [Phase 1 Acceptance Criteria](#11-phase-1-acceptance-criteria)
12. [Assumptions, Dependencies & Out-of-Scope](#12-assumptions-dependencies--out-of-scope)

---

## 1. Vision & One-Liner

**ManFriday is a lean recruiter tool** — a résumé database, advisory authenticity flags, JD→candidate matching, a 15-question screening pack, lightweight triage, and mass candidate outreach — all **transparent and human-decided**, that **learns over time from the feedback and outcomes recruiters capture**.

It is built for staffing agencies (the tenant) and the recruiters inside them. The product turns a stack of résumés plus a job description into a ranked shortlist with a defensible, plain-English score, screening questions a recruiter can actually use, and an outreach list — without pretending to be an opaque auto-screener and without auto-rejecting anyone. **Software / technical staffing is the first vertical.**

## 2. Target Users & Jobs-to-Be-Done

| User | Primary job-to-be-done |
|---|---|
| **Recruiter** *(primary user)* | "Find, screen, and rank candidates against this JD fast and transparently, generate questions to screen them, and reach out to the right people — all from one tool." |
| **Org admin** | "Manage my agency's team and seats; everyone in my org shares the same candidate/req/outreach data." |

A **candidate** is a *contacted person*, not a user — candidates have **no app login in Phase 1**. (A candidate self-service surface is a possible later phase, not committed here.)

There is **no "client hiring manager" persona and no "compliance / auditor" persona** in this product. Within an org, all recruiters see all of the org's data; there is no per-recruiter or per-client visibility scoping.

## 3. Product Principles

These are product requirements, not aspirations. They mirror the four engineering invariants in [`CLAUDE.md`](../CLAUDE.md) plus two product-level commitments.

- **P-1 Org isolation is absolute. [ALL]** A recruiter can never see another org's data — including via search, matching, or vector similarity. Tenant isolation is enforced by Postgres Row-Level Security keyed on the `org_id` claim in the Supabase Auth JWT, on every tenant-scoped table (including pgvector).
- **P-2 Human decides; the tool suggests. [ALL]** No candidate is ever auto-rejected or auto-advanced. The product surfaces matches, flags, questions, and answer keys; a recruiter makes every call.
- **P-3 Capture data now, learn later. [ALL]** Recruiter decisions, overrides (e.g. skill re-tiering), screen grades, proposal outcomes, and feedback are captured from day one so later phases can tune matching and ranking.
- **P-4 Plain, append-only audit. [ALL]** Decision-affecting actions are written to a simple append-only activity log (who did what, when). It is an activity trail, not a hash-chained legal record.
- **P-5 Transparent matching.** Fit is a plain, inspectable formula (weighted CORE/NICE skill coverage), never an opaque "fit: 78" black box. The recruiter can see exactly which skills matched and which CORE skills are missing.
- **P-6 Don't over-automate the risky parts.** Authenticity/plausibility judgments and triage stay human. The tool produces advisory flags and suggestions; it never converts them into an automated reject or an automated triage state.

## 4. Product Scope by Phase

| Phase | What the *product* can do |
|---|---|
| **1 — Real loop, live** | The full recruiter loop running on Supabase + Vercel: org/recruiter accounts → résumé upload (single + bulk) → deterministic parse → advisory authenticity flags at upload → JD upload → CORE/NICE weighted skills + completeness → transparent match/rank → 15 screening questions (5/5/5) with answer keys, recruiter-graded → lightweight triage → mass outreach email with consent/unsubscribe → feedback/outcome capture. |
| **2 — Accuracy upgrades** | Better matching (embeddings + hybrid BM25/dense retrieval via pgvector), better résumé/JD parsing, and feedback-tuned ranking that uses the outcomes captured in Phase 1. |
| **3 — Learn over time** | Deeper assistance (optional agents), ATS integration, additional verticals beyond software/technical staffing, and richer feedback-driven personalization. |

## 5. Phase 1 Definition (cut line)

**Phase 1 = the smallest slice that runs the real recruiter loop end to end on Supabase + Vercel, transparent and human-decided, capturing the decisions and outcomes that Phase 2/3 learn from.**

### In scope (Phase 1)
- **Org + recruiter accounts** via Supabase Auth; org isolation via RLS on the `org_id` JWT claim; all recruiters in an org share the org's data.
- **Résumé ingestion** — single upload and bulk upload; deterministic parse into non-PII signal (skills, experience estimate); immutable versioned résumé rows; within-org dedupe by normalized email.
- **Advisory authenticity / plausibility flags at upload** — deterministic data-quality and plausibility rules (implausible experience ↔ skill-count, timeline inconsistencies, duplicates, sparse/no-contact résumé); recruiter decides; never auto-reject.
- **JD intelligence** — JD upload → CORE/NICE weighted skills + a completeness score. (Today's extractor suggests every found skill as CORE @ weight 1.0; the recruiter re-tiers and re-weights, and the recruiter's confirmed rubric is what matching reads.)
- **Transparent match & rank** — `fit = 0.8·core_coverage + 0.2·nice_coverage`, 0–100, with the matched/missing-CORE breakdown visible.
- **Screening Q&A** — generate **15 questions (5 simple / 5 medium / 5 hard)** grounded in the résumé + JD, each with a model **answer key**; the recruiter grades; AI-assist grading optional.
- **Lightweight triage** — recruiter-set candidate pipeline status and proposal outcome (see [§8](#8-lightweight-triage)).
- **Mass outreach email** — audience selection, a simple consent/unsubscribe flag, CAN-SPAM-compliant send. **Send is in scope.**
- **Feedback & outcome capture** — proposal outcomes and recruiter corrections recorded for later learning.
- **Data rights** — soft-delete + hard-delete-on-request for candidate PII.

### Out of scope (Phase 1) — deferred, and we say so
- **Embeddings / hybrid semantic matching** (pgvector ANN + BM25 fusion) — **[P2]**. Phase 1 matching is exact case-insensitive skill overlap.
- **Feedback-tuned ranking** (using captured outcomes to adjust scores/order) — **[P2]/[P3]**.
- **Better parsing** (LLM-assisted extraction, OCR at volume) beyond the deterministic v1 parser — **[P2]**.
- **Deeper agents, ATS integration, additional verticals** — **[P3]**.
- Candidate self-service login; per-client / per-recruiter visibility scoping; any EEOC adverse-impact monitoring, demographics collection, or formal compliance tooling (intentionally not part of this product).

## 6. Functional Requirements by Capability

Mapped to the lean capability domains C1–C8.

### C1 — Résumé Database & Ingestion
- **FR-1.1 [P1]** Recruiter uploads résumés one at a time (PDF / DOCX / text); files are size-capped and malware-scanned.
- **FR-1.2 [P1]** Recruiter uploads résumés in **bulk** (many files), one candidate created per file.
- **FR-1.3 [P1]** Each résumé is **deterministically parsed** into non-PII signal: normalized skills (from the self-hosted skills lexicon), an experience-years estimate, link domains, and presence-only contact booleans. Raw email/phone are detected for the candidate record but not written into the parse output.
- **FR-1.4 [P1]** Résumés are **immutable, versioned rows** — a re-upload for the same candidate creates a new version (with content hash + `is_current`), never an in-place edit.
- **FR-1.5 [P1]** **Within-org dedupe by normalized email** — a new résumé matching an existing candidate's email attaches to that candidate. There is **no cross-org link**; the same person in two orgs is two unrelated records (no `candidate_identity` / shared-pool table).
- **FR-1.6 [P2]** LLM-assisted parsing and OCR-at-volume for harder résumés.

### C2 — Authenticity Flags (advisory)
- **FR-2.1 [P1]** At upload, a sub-agent runs **deterministic plausibility/quality checks** over the parsed résumé and surfaces advisory **flags** with a severity (e.g. no contact, no skills detected, sparse résumé, no experience signal, implausible experience ↔ skill-count, timeline inconsistency, suspected duplicate).
- **FR-2.2 [ALL]** Authenticity flags are **advisory only** — they are **never** auto-rejections, are **never** folded into the fit number, and the recruiter decides what to do. (Optional LLM corroboration may be added later; it remains advisory.)

### C3 — JD Intelligence
- **FR-3.1 [P1]** Recruiter creates a requisition with metadata (title, location, employment type, openings) and provides JD text.
- **FR-3.2 [P1]** The system suggests skills found in the JD as **CORE/NICE weighted** rows. *Today's extractor suggests every found skill as `tier=core, weight=1.0`*; the recruiter **re-tiers and re-weights** them.
- **FR-3.3 [P1]** **Recruiter override always wins.** Suggestions are not persisted until the recruiter confirms; the confirmed `jd_skill` set (name / tier / weight / sort order) is the rubric matching reads.
- **FR-3.4 [P1]** The system computes a **JD completeness score** (0–100) over title / location / employment type / JD text length / CORE skill count / NICE skill count, with per-item hints.

### C4 — Matching & Ranking
- **FR-4.1 [P1]** For a requisition, the system ranks candidates by a **transparent fit**: `fit = 0.8·core_coverage + 0.2·nice_coverage` (each coverage = weighted fraction of that tier's skills present; if only one tier exists, fit = that tier's coverage), rounded to a 0–100 integer.
- **FR-4.2 [P1]** "Present" is a case-insensitive exact skill-name match; the breakdown returns matched skills and **missing CORE** skills so the score is fully inspectable. Ranking is `fit desc`, stable tie-break by candidate.
- **FR-4.3 [P2]** Upgrade matching with **embeddings + hybrid (BM25 + dense) retrieval via pgvector** for semantic proximity, and feed captured feedback into ranking.

### C5 — Screening Q&A
- **FR-5.1 [P1]** For a candidate × requisition, generate **15 screening questions** — **5 simple, 5 medium, 5 hard** — grounded in the résumé + JD.
- **FR-5.2 [P1]** Each question carries a structured **JSON answer key** (expected points / acceptable answers / notes) the recruiter screens against.
- **FR-5.3 [P1]** The recruiter **grades** answers; **AI-assist grading is optional** ([D12](DECISIONS.md#d12-screening-administration--ai-assist-grading)) and never replaces the recruiter's call.

### C6 — Triage
- **FR-6.1 [P1]** The recruiter sets the candidate's **pipeline status** (`new → contacted → screening → submitted`) and a **proposal outcome** (`proposed / interviewing / rejected / hired`), per candidate × requisition.
- **FR-6.2 [ALL]** Triage is **human-set**. There is **no GREEN/AMBER/RED state machine and no reason-code taxonomy** — just the simple status and outcome fields above ([D9](DECISIONS.md#d9-triage-states--feedback-capture)).
- **FR-6.3 [P1]** A candidate's outcome on one requisition does not carry over to another — triage is per `(candidate × req)`.

### C7 — Outreach
- **FR-7.1 [P1]** Build a **mass outreach audience** (e.g. candidates above a fit threshold for a req, filtered by consent state).
- **FR-7.2 [P1]** Send mass email to that audience, honoring a simple per-candidate **consent / unsubscribe flag** and **CAN-SPAM** requirements (unsubscribe link, identification). **Send is built.**
- **FR-7.3 [P1]** Unsubscribes/opt-outs update the candidate's consent flag and exclude them from future sends.

### C8 — Talent CRM & Feedback Capture
- **FR-8.1 [P1]** Candidates are **first-class, reusable entities within the org** — the same candidate can be matched and proposed against many of the org's requisitions.
- **FR-8.2 [P1]** Proposal **outcomes** and recruiter **corrections** (skill re-tiering/re-weighting, triage changes) are **captured** so later phases can learn ([D10](DECISIONS.md#d10-placementoutcome-tracking)).
- **FR-8.3 [P2]/[P3]** Use the captured feedback to **tune ranking** and personalize results over time.

## 7. Key User Flows

**Flow A — Screen a candidate (the core loop) [P1]:**
`Recruiter creates a req → adds JD text → reviews suggested skills and re-tiers/re-weights CORE vs NICE → uploads/selects candidates → system ranks each by transparent fit (matched vs missing CORE visible) → recruiter reviews advisory flags → generates 15 screening questions (5/5/5) with answer keys → conducts/records the screen and grades answers → sets status / proposal outcome → adds qualifying candidates to an outreach audience.`

**Flow B — Reuse a candidate for a new req [P1]:**
`Recruiter opens a new req → searches the org's candidate pool (RLS-scoped to the org) → selects an existing candidate → system ranks them against the new req's confirmed skill rubric → independent triage (an outcome on another req does not carry over).`

**Flow C — Recruiter overrides a skill tier/weight [P1]:**
`Recruiter flips a suggested CORE skill to NICE (or adjusts its weight) → the change is captured and becomes the confirmed rubric → re-ranking uses the updated rubric. Recruiter override always wins over the suggestion.`

## 8. Lightweight Triage

Triage in this product is **two simple, recruiter-set fields**, per `(candidate × req)`:

- **Candidate pipeline status:** `new → contacted → screening → submitted`.
- **Proposal outcome:** `proposed → interviewing → rejected → hired`.

There is **explicitly no GREEN/AMBER/RED state machine, no reason-code taxonomy, and no automated transition.** The recruiter sets these directly; the tool never sets them and never auto-rejects ([D9](DECISIONS.md#d9-triage-states--feedback-capture)). An outcome on one req is independent of any other req for the same candidate.

## 9. Non-Functional Requirements

- **NFR-1 Org isolation [ALL]** — RLS keyed on the `org_id` JWT claim on **every** tenant-scoped table, including pgvector. **0 cross-tenant leaks** is the bar (verified by a leak probe).
- **NFR-2 Performance [P1]** — responsive UI; reasonable parse and match latency (parse and rank complete promptly for a normal stack; long-running bulk work runs in the background). No hard p95 SLA committed in Phase 1.
- **NFR-3 Cost [P1]** — target **≤ ~$0.20 per screened candidate** including any optional LLM assistance ([D6](DECISIONS.md#d6-per-candidate--per-screen-cost-ceiling)).
- **NFR-4 Accessibility [P1]** — WCAG-grade UI primitives (Radix/shadcn).
- **NFR-5 Data rights [ALL]** — candidate PII supports **soft-delete and hard-delete on request**; outreach honors consent/unsubscribe and CAN-SPAM ([D5](DECISIONS.md#d5-data-retention--deletion)).

There are intentionally **no** NFRs for reproducibility-as-100%, hash-chained provenance, redaction-before-scoring, ZDR-only-providers, or adverse-impact / fair-by-construction monitoring — those belonged to the dropped EEOC posture.

## 10. Success Metrics

Phase 1 success is qualitative and loop-completion-focused:
- A recruiter can **run Flow A end to end** on a real JD and a real stack of candidates, unassisted.
- **Matching feels useful** — the ranked shortlist and the matched/missing-CORE breakdown are something a recruiter trusts and acts on.
- **Feedback and outcomes are being captured** — proposal outcomes and recruiter corrections are landing for later learning.
- **0 cross-tenant leaks** — verified by the isolation/leak probe.

**Leading product signals (later):** time-to-shortlist per req, talent-pool reuse rate, outreach response rate, and (Phase 2+) measurable lift from feedback-tuned ranking.

## 11. Phase 1 Acceptance Criteria

Phase 1 is "done" when:
1. A recruiter can run **Flow A end to end** in the product on Supabase + Vercel, unassisted, with real candidates.
2. Fit shows a **transparent breakdown** (matched skills + missing CORE), not an opaque number, and recruiter skill overrides change the result.
3. **Bulk upload** ingests many résumés (one candidate per file) with deterministic parse and within-org email dedupe.
4. Generating a screen yields **15 questions (5/5/5)** grounded in the résumé + JD, each with an answer key, and the recruiter can grade them.
5. **Mass outreach send works** and honors consent/unsubscribe + CAN-SPAM.
6. **Org isolation holds** — the cross-tenant leak probe is green.
7. Candidate PII can be **hard-deleted on request**, and recruiter decisions/outcomes are recorded for later learning.

## 12. Assumptions, Dependencies & Out-of-Scope

**Assumptions** (ratified defaults in [`DECISIONS.md`](DECISIONS.md)):
- A candidate is **org-scoped** with a simple consent flag (`pending / opted_in / unsubscribed`) and a source; no cross-org sharing ([D1](DECISIONS.md#d1-candidate-model--consent)).
- ManFriday is a **software vendor / processor**, not the employer's agent; terms-of-service / vendor posture per ([D3](DECISIONS.md#d3-vendor-posture--terms-of-service)).
- **Software / technical staffing** is the first vertical ([D11](DECISIONS.md#d11-initial-vertical--role-mix)).
- Screening is **recruiter-administered with manual grading**; AI-assist grading is optional ([D12](DECISIONS.md#d12-screening-administration--ai-assist-grading)).
- Infrastructure is **Supabase + Vercel** ([D8](DECISIONS.md#d8-infrastructure-supabase--vercel)).

**Dependencies:**
- A provisioned **Supabase project** (Postgres + pgvector + Storage + Auth) and a Vercel deployment.
- The self-hosted **Lightcast Open Skills** dataset (free download), seeded by the existing ~49-skill lexicon ([D13](DECISIONS.md#d13-lightcast-license)).

**Out of scope for Phase 1:** everything tagged **[P2]** / **[P3]** above — embeddings/hybrid matching, feedback-tuned ranking, LLM-assisted parsing/OCR-at-volume, deeper agents, ATS integration, and additional verticals — plus candidate self-service login and any EEOC/compliance tooling (not part of this product).
