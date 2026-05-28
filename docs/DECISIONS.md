# ManFriday — Decision Log (Proposed Defaults Awaiting Ratification)

> Companion to [`ARCHITECTURE.md`](ARCHITECTURE.md), [`ROADMAP.md`](ROADMAP.md), [`PRD.md`](PRD.md), and [`PHASE_0.md`](PHASE_0.md).
>
> **Purpose:** The architecture left a set of product/legal questions open (ARCHITECTURE → *Open Decisions for the Product Owner*). Building on blanks is how a project stalls. So each open question below has a **proposed default** with rationale, so the owner can **ratify or override** rather than start cold. The PRD and Phase 0 spec are written *assuming these defaults*; flipping one means revisiting the docs that cite it.
>
> **Status legend:**
> - 🟡 **PROPOSED** — Claude's recommended default; safe to build on provisionally; owner should confirm.
> - ⚖️ **NEEDS COUNSEL** — a legal/contractual call; proposed posture is a starting point for counsel, **not** legal advice, and must be ratified before the gated phase ships.
> - 🟢 **RATIFIED** — owner confirmed (none yet).
> - 🔴 **OVERRIDDEN** — owner chose differently (record the choice + date).
>
> **How to ratify:** edit the **Status** line (and add a one-line note + date). When a decision changes the design, update the cited section of `ARCHITECTURE.md`/`PRD.md`/`PHASE_0.md` and the relevant part of `CLAUDE.md`.

---

## Index

| ID | Decision | Status | Blocks |
|---|---|---|---|
| [D1](#d1-candidate-consent--cross-client-reuse-model) | Candidate consent & cross-client reuse model | 🟡 PROPOSED | Phase 0 schema |
| [D2](#d2-demographic-data-source--sufficiency) | Demographic-data source & sufficiency | 🟡⚖️ PROPOSED / NEEDS COUNSEL | Phase 0 reserved schema; Phase 2 |
| [D3](#d3-agency-vs-client-eeoc-liability-allocation) | Agency-vs-client EEOC liability allocation | ⚖️ NEEDS COUNSEL | Contracts/DPA; audit schema |
| [D4](#d4-jurisdictional-compliance-floor) | Jurisdictional compliance floor | 🟡⚖️ PROPOSED / NEEDS COUNSEL | Scope of Phase 2/6 |
| [D5](#d5-retention-vs-deletion-policy) | Retention vs deletion policy | 🟡⚖️ PROPOSED / NEEDS COUNSEL | Phase 0 schema; deletion jobs |
| [D6](#d6-per-candidate--per-req-cost-ceiling) | Per-candidate / per-req cost ceiling | 🟡 PROPOSED | Router routing; parser build/buy |
| [D7](#d7-protocol-when-a-client-repeatedly-fails-45ths) | Protocol when a client repeatedly fails 4/5ths | ⚖️ NEEDS COUNSEL | Phase 5 |
| [D8](#d8-infrastructure--vpc-posture) | Infrastructure / VPC posture | 🟡 PROPOSED | Phase 0 infra; PII landing |
| [D9](#d9-un-owned-spine-components) | Un-owned spine components (assessment delivery, client portal, reason codes, …) | 🟡 PROPOSED | Phase 1 scope freeze |
| [D10](#d10-ats-write-back-placement-lifecycle--amber-auto-submit) | ATS write-back, placement lifecycle & AMBER auto-submit | 🟡 PROPOSED | Phase 1 vs 3 scope |
| [D11](#d11-initial-vertical--role-mix) | Initial vertical / role mix | 🟡 PROPOSED | Taxonomy reliance; eval gold set |
| [D12](#d12-response-modality--ai-assist-grading) | Response modality & AI-assist grading | 🟡 PROPOSED | Phase 1 grading UI |
| [D13](#d13-lightcast-license) | Lightcast license (paid API vs free download) | 🟡 PROPOSED | Phase 1 taxonomy ingest |

---

## D1. Candidate consent & cross-client reuse model
**Status:** 🟡 PROPOSED · **Blocks:** Phase 0 data model (candidate partitioning), the reusable talent pool.

**Decision (proposed):** A candidate is **org-scoped** — one canonical candidate record per agency org — and **reusable across that org's clients** under a **blanket-with-revocation** consent captured at ingestion, with a **24-month TTL from last activity** and a re-consent prompt at expiry. **Cross-*org* (cross-tenant) sharing is OFF** by default and never happens without counsel-approved, anonymized, contractual opt-in. Consent is recorded as immutable events in a `consent_ledger` (timestamp, purpose, source, policy version). **Recruiter-sourced** candidates carry weaker consent and stricter retention defaults than **candidate-submitted** ones, flagged on the record.

**Rationale:** The reusable, org-wide talent pool is the headline value, and shared-schema RLS makes cross-client reuse *inside* an org trivial. Cross-*tenant* reuse is the legal landmine, so it is off by default (consistent with ARCHITECTURE's reconciliation: "client-embedding space is per-agency-only unless counsel approves anonymized opt-in"). Data-controller/processor split: in **agency mode** the agency is controller and ManFriday is processor; in **direct mode** the company is controller. This is the minimum model that lets Phase 0 fix the `org_id`-scoped `candidate` table without re-partitioning later.

**Alternatives rejected:** *Client-partitioned candidate* (kills cross-client reuse, the value prop); *globally shared candidate* (cross-tenant leak + consent nightmare).

---

## D2. Demographic-data source & sufficiency
**Status:** 🟡 PROPOSED / ⚖️ NEEDS COUNSEL · **Blocks:** Phase 0 reserved schema; Phase 2 monitoring.

**Decision (proposed):** **Voluntary self-ID only** (EEO-1 template), **no BISG / name-ZIP inference anywhere — ever.** Stored in a **physically/logically segregated** demographics service with its own key and role and **no read path from scoring/ranking** (BFF-blocked), joined only inside an isolated AI-impact analytics job. A **minimum-cell-size policy** (suppress + declare "inconclusive" below a counsel-set N, with pooling across role-family/time) gates whether a gate's stats are valid. **Collection UI ships in Phase 2** (when monitoring goes live); Phase 0 only **reserves** the segregated schema and the non-readable boundary.

**Counsel must confirm:** that voluntary self-ID is binding for our model; the consent text + owner; the minimum-cell N; and whether anonymized cross-tenant pooled baselines are permissible for small tenants/niche roles.

**Rationale:** Matches ARCHITECTURE's reconciliation exactly. The entire EEOC defense rests on this data existing at adequate volume; BISG is both legally fraught and explicitly rejected.

---

## D3. Agency-vs-client EEOC liability allocation
**Status:** ⚖️ NEEDS COUNSEL · **Blocks:** contracts/DPAs; the audit schema's "accountable principal" fields.

**Decision (proposed posture, for counsel to ratify):** Position ManFriday as a **vendor/processor — a tool, not the employer's agent** — and make that posture *defensible by construction*: every employment-affecting decision records the **accountable human principal + their org role** in the immutable audit trail, so "ManFriday is a tool, the human decided" is provable. Contracts/DPAs must codify the controller/processor split with both agencies and their client companies, plus indemnification and who owns the bias audit.

**Rationale:** The "human decides, AI suggests" invariant only limits liability if the audit schema can *prove* a human decided. Phase 0 builds those fields regardless of the legal posture, so this decision doesn't block the schema — but it must be ratified before the design partner signs.

---

## D4. Jurisdictional compliance floor
**Status:** 🟡 PROPOSED / ⚖️ NEEDS COUNSEL · **Blocks:** scope of Phase 2 and Phase 6.

**Decision (proposed):** **US-baseline EEOC** for the MVP (Phases 0–1), run with a **single design-partner agency under contractual cover** at low volume. **Architect** so NYC LL144 + Colorado SB205 + Illinois (intersectional reporting, independent annual audit, AI-video rules) can be **layered in Phase 2/6 without rework** — i.e., don't over-build to all jurisdictions now, but don't paint into a corner (keep demographics segregated, audit immutable, explanations faithful from day one).

**Rationale:** The roadmap already defers multi-jurisdiction breadth to Phase 6 and gates monitoring at Phase 2. Building to every state law at MVP is expensive and premature; the load-bearing controls are jurisdiction-agnostic.

---

## D5. Retention vs deletion policy
**Status:** 🟡 PROPOSED / ⚖️ NEEDS COUNSEL · **Blocks:** Phase 0 schema (`deleted_at`, crypto-shred), scheduled deletion jobs.

**Decision (proposed):** **One authoritative policy.** On deletion request or TTL expiry: **crypto-shred / NULL C3 PII** (per-record/per-tenant key destruction) and **hard-delete resume blobs + embeddings**, while **retaining de-identified decision metadata** (scores, triage, run provenance, counts) under a **documented legal-hold basis** for the EEOC/OFCCP statute-of-limitations window. Row-level demographic links are **pre-aggregated then purged**. Default `pii_retention_days = 730` (24 months from last activity); **placed candidates retained longer** (contract/tax). Per-state variants (Illinois BIPA, California) layered in Phase 6.

**Counsel must confirm:** the minimal de-identified record we may lawfully retain to keep the 4/5ths denominator valid, and the legal-hold basis + duration.

**Rationale:** You cannot audit fairness on a deleted population, but you must honor deletion rights — crypto-shred PII while keeping de-identified decision metadata is the standard reconciliation, already in ARCHITECTURE.

---

## D6. Per-candidate / per-req cost ceiling
**Status:** 🟡 PROPOSED · **Blocks:** router routing aggressiveness; LLM-only-vs-commercial-parser build/buy.

**Decision (proposed):** Provisional target **≤ ~$0.20 per fully-screened candidate** at MVP (typical low cents), enforced by a **hard per-tenant monthly token budget + alerts** in the router. Routing: **mid-tier model by default** for parse/extract, **frontier model only** for nuanced fitment judgment + question generation, with **escalation on low confidence**; Batch API for non-interactive bulk re-scoring; prompt + response caching on stable JD/rubric prefixes. **LLM-only resume parsing in Phase 1**; commercial parser deferred to **Phase 3** when volume makes the per-doc fee beat token cost.

**Rationale:** Matches the cost-model sketch. A provisional number unblocks the build; the owner should replace it with the real unit-economics target once volume is known.

---

## D7. Protocol when a client repeatedly fails 4/5ths
**Status:** ⚖️ NEEDS COUNSEL · **Blocks:** Phase 5 (not earlier).

**Decision (proposed posture):** **Warn + require human compliance review + automatically dampen personalization to the audited prior; escalate on repeat. Never silently personalize for a known-discriminating client.** This is a customer-relationship + liability decision counsel must ratify before Phase 5 ships.

**Rationale:** Silently personalizing for a client whose own decisions disparately reject a protected group risks making the platform a *knowing* participant. Not a Phase 0/1 blocker — recorded now so it isn't forgotten.

---

## D8. Infrastructure / VPC posture
**Status:** 🟡 PROPOSED · **Blocks:** Phase 0 infra choices; *must be settled before real candidate PII lands*.

**Decision (proposed):** Phase 0/1 on **Neon** (serverless Postgres + pgvector, branch-per-PR economics) for velocity, with an **explicitly planned Aurora-in-VPC migration** before Phase 3 scale. **Hard rule: no real candidate PII lands in Neon until** a signed DPA, US-region pinning, and the envelope-encryption posture are confirmed (until then, dev/test uses synthetic data only). For the strictest tenants, **in-VPC RDS / db-per-tenant** is the Phase 6 escape hatch. Super-admin **break-glass = logged + time-boxed** at MVP; **BYOK / tenant-held keys** deferred to Phase 6.

**Rationale:** Honors both the DX argument for Neon and the "decide before PII lands" warning by gating PII on contractual + encryption readiness. Everything keys on `org_id`, so the Aurora/isolated-tier move is a migration, not a fork.

---

## D9. Un-owned spine components
**Status:** 🟡 PROPOSED · **Blocks:** Phase 1 scope freeze.

**Decision (proposed):** Scope the components ARCHITECTURE flagged as un-owned:
- **Assessment delivery & response capture:** **written + recruiter-administered live** screening; **defer async recorded video** (and its AI-video-law surface) to a later phase.
- **Client portal / feedback interface:** MVP = a **redacted shortlist view + a structured feedback form** (the input boundary for preference learning). Built in Phase 1; for the single design partner it can start as a simple shared view + form, not a full portal.
- **Triage state machine:** canonical `UNSCREENED → SCREENING → {GREEN|AMBER|RED}` + `SUBMITTED/CLIENT_ACCEPTED/CLIENT_REJECTED/WITHDRAWN`, with **AMBER recovery** (re-screen/new evidence to move) and **non-terminal RED** (per-req, candidate re-enters pool). Specified in Phase 1.
- **Communications / adverse-action-notice service:** **stub** in Phase 1 (record the event); full notice generation in Phase 2 with faithful explanations.
- **Reason-code taxonomy:** define a **v1 controlled vocabulary** for triage reasons in Phase 1 (required by the human-set-triage invariant).
- **Score-calibration / threshold governance:** thresholds live in the per-req frozen `ScoringSpec`; **owner/admin-configurable with governance + audit**, Phase 1.

**Rationale:** These are the input/output boundaries of the core loop; leaving them unowned would let Phase 1 scope drift. Each is scoped to the minimum that proves the loop.

---

## D10. ATS write-back, placement lifecycle & AMBER auto-submit
**Status:** 🟡 PROPOSED · **Blocks:** Phase 1 vs Phase 3 scope honesty.

**Decision (proposed):** **ATS import/write-back deferred to Phase 3** (Merge.dev unified connector). The **`placement` table exists from Phase 1** (outcome ground truth + adverse-impact denominator) but is populated manually until integrations land. **Only GREEN candidates are submitted to clients**; **AMBER is never auto-submitted** — a recruiter must affirmatively promote AMBER→GREEN first.

**Rationale:** Keeps Phase 1 honest and small; capturing placement outcomes early is cheap and feeds later learning. AMBER auto-submit would push low-confidence candidates to clients and erode trust.

---

## D11. Initial vertical / role mix
**Status:** 🟡 PROPOSED · **Blocks:** how heavily we lean on Lightcast tech depth; the eval gold set.

**Decision (proposed):** Launch focused on **software / technical staffing** (where Lightcast Open Skills has the best depth and our screening-question generation is strongest), with the architecture general enough to broaden to professional staffing later. Build the Phase 1 **gold set** (labeled JD/resume pairs for the span-grounding + scoring regression gates) from this vertical.

**Rationale:** A focused vertical sharpens extraction/scoring quality and makes the design-partner demo credible; breadth (O*NET/ESCO reliance, larger custom overlay) is a later expansion.

---

## D12. Response modality & AI-assist grading
**Status:** 🟡 PROPOSED · **Blocks:** Phase 1 grading UI + automation-bias controls.

**Decision (proposed):** MVP = **recruiter-administered live or written** answers, **graded manually by the recruiter** against the structured JSON rubric, with **AI-assist optional** (AI surfaces the rubric + a suggested score the recruiter can accept/override). **No AI auto-grade** at launch — it is withheld until the recruiter-agreement / automation-bias metrics are calibrated. The UI must **not pre-select** the AI suggestion.

**Rationale:** Directly serves the human-in-the-loop and automation-bias invariants. Auto-grade before calibration is exactly the rubber-stamping risk the architecture warns about.

---

## D13. Lightcast license
**Status:** 🟡 PROPOSED · **Blocks:** Phase 1 taxonomy ingestion.

**Decision (proposed):** Start on the **free Lightcast Open Skills open-data download** self-hosted in Postgres (ltree + per-skill embeddings), accepting its refresh-cadence/rate limits for MVP. Move to the **paid API/license** only if refresh cadence or coverage becomes a real constraint at volume.

**Rationale:** The free download is sufficient to prove the loop for one design partner; the paid license is a volume/coverage decision deferrable past MVP.

---

## Decisions already reconciled in ARCHITECTURE (recorded here for traceability)

These were resolved in ARCHITECTURE → *Reconciliation & Resolved Trade-offs*; listed so they aren't re-litigated:

- **Auth:** WorkOS for enterprise SSO/SCIM; in-house passwordless magic-link for candidates; **Clerk dropped**.
- **Background engine:** Arq + Redis in Phase 1; Temporal in Phase 2+ (continuous agents are **not** a Phase 1 promise).
- **Audit source of record:** the hash-chained `audit_event` table in *all* phases (not Temporal history).
- **AuthZ:** RLS + scoped JWT for MVP; OpenFGA/SPIFFE deferred.
- **Demographics:** voluntary self-ID, segregated, **no BISG** (see [D2](#d2-demographic-data-source--sufficiency)).
- **Score recomputation:** model/prompt/embedding pinned per `ScoringSpec` per req; a version upgrade never retroactively re-scores an open req (re-score only as one new batch for the whole req).
- **Pre-human filtering:** the recall stage is a **monitored selection gate** (excluded candidates logged + counted in 4/5ths), not neutral search.
- **AI-text detection:** removed from any candidate-affecting path; blind/redacted screening default-on.
