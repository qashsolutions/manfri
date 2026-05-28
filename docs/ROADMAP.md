# ManFriday — Phased Roadmap

> Companion to ARCHITECTURE.md.

**MVP cut line:** The MVP cut line is the END of Phase 1: a single design-partner agency can run the full explainable screening loop — JD ingestion with CORE/NICE weighted skill extraction (span-grounded, recruiter-overridable, version-pinned), candidate fitment scoring as a transparent weighted composite of evidence-backed sub-scores against a frozen per-req ScoringSpec, tiered (simple/medium/hard) screening questions with structured JSON answer keys, and HUMAN-set GREEN/AMBER/RED triage with reason codes — all running on the Phase 0 foundation (multi-tenant RLS, immutable run-provenance, hash-chained audit, PII redaction-before-egress, thin multi-model router). MVP runs at low volume with one tenant under contractual cover; full adverse-impact monitoring, multi-tenant scale, SSO, continuous agents, fraud detection, and preference learning are all ABOVE the line (Phases 2–5). The cut line is drawn here because this is the smallest slice that (a) delivers daily recruiter value, (b) proves the load-bearing 'explainable, reproducible, human-decided' thesis end to end, and (c) produces the audited decision events that every later phase depends on to learn from, secure, scale, and automate.

**Sequencing rationale:** Two principles drive the order. FIRST, compliance-before-scale: every capability that makes or influences an employment decision sits behind three first-class controls — immutable run-provenance + hash-chained audit, enforced human-in-the-loop with reason codes, and adverse-impact (4/5ths + significance) monitoring — and each control is BUILT BEFORE the feature that needs it. This is why Phase 0 ships the provenance/audit/redaction floor before any decision logic, and why Phase 2 (adverse-impact monitoring) is a hard gate placed BEFORE multi-tenant scale (Phase 3) and before any automated influence (agents Phase 4, preference learning Phase 5): you cannot run the 4/5ths rule on a population you never measured, and scaling or personalizing an unmonitored decision system is the exact liability the digest repeatedly warns against. SECOND, de-risk the uncertain AI early: each phase opens with a time-boxed spike on its riskiest unknown — Phase 0 a cross-tenant leak probe (RLS/pgvector/worker), Phase 1 a span-grounding/hallucination spike, Phase 2 a demographic-data legality+volume spike, Phase 4 agent cross-tenant+cost and fraud-flag-bias spikes, Phase 5 a proxy-leakage and cross-client bias-transfer spike — so an architectural dead-end fails cheap rather than at volume. SSO, agents, and RAG are deliberately threaded in at the points where they add value without preceding the controls they need: enterprise SSO/SCIM (Phase 3) is procurement table-stakes that adds nothing to decision quality, so it waits until the audited loop exists to be worth securing; durable agentic continuous assessment + hardened RAG (Phase 4) requires Phase 3's SPIFFE-scoped workload identity and Phase 2's monitoring to catch agent-amplified bias; and client preference learning (Phase 5) is sequenced dead last among AI features because it is the single most bias-sensitive capability (it can launder a client's protected-class bias as 'personalization') and can only be made safe atop live adverse-impact monitoring with auto-dampening, the bandit exploration machinery from Phase 4, and an accumulated corpus of audited feedback from all prior phases. Fraud/authenticity detection rides into Phase 4 (not earlier) because it is advisory-only and its false positives are bias-laden, so it needs the same monitoring fence. The dependency chain is strictly: Phase 0 underpins all; Phase 1 needs only 0; Phase 2 needs a real loop (1) to instrument and gates 3/4/5; Phase 3 needs 2 and provides scoped identity for 4; Phase 4 needs 2+3 and provides ranking/exploration infra for 5; Phase 5 needs 2+4 plus accumulated feedback; Phase 6 is demand/contract/regulation-triggered.

## Phased Roadmap

This roadmap sequences ManFriday from foundations to a continuously-assessing agentic platform. The organizing principle is **compliance-before-scale**: any capability that *makes or influences an employment decision* (scoring, triage suggestion, fraud flagging, personalized ranking) must sit behind three first-class controls — (1) immutable run-provenance + hash-chained audit trail, (2) enforced human-in-the-loop with reason codes, (3) adverse-impact (4/5ths + significance) monitoring — and those controls are built *before* the feature that needs them, not bolted on after. The second principle is **de-risk the uncertain AI early**: each phase opens with a time-boxed spike on its riskiest unknown (span-grounded extraction, demographic-data legality, proxy leakage, cross-tenant vector leak) so we fail cheap instead of discovering an architectural dead-end at volume.

A standing convention applies to **every** phase that writes an AI output: no score, triage suggestion, parse, question, or ranking may be persisted without a `*_run` row pinning `model_id + prompt_version + params + weight_set + input_hash`. This is enforced by a DB constraint + a single router code path, never by convention. Violating it later is the single most expensive mistake (renders decisions unexplainable and indefensible), so it ships in Phase 0.

---

### Phase 0 — Foundations, Tenancy Spine & Compliance Skeleton (the no-shortcuts base)

**Goal:** Stand up the multi-tenant data spine, the provenance/audit machinery, and the model-router seam so that *every* later feature inherits isolation, reproducibility, and auditability for free. No employment-decision logic yet — this phase exists to make the rest defensible.

**Why first:** The digest's most severe, recurring risks are structural (cross-tenant leak via RLS gap or pgvector, un-provenanced scores, mutable audit logs). These cannot be retrofitted — a single code path that writes a score without a `scoring_run`, or one pgvector query missing the `org_id` filter, is a platform-ending breach or an indefensible decision. Build the floor before anyone stands on it.

**Scope:**
- PostgreSQL 16 + pgvector on Neon (branch-per-PR economics). Shared-schema multi-tenancy with **Row-Level Security** keyed on `org_id`, non-`BYPASSRLS` app role, `SET LOCAL` GUCs. Client modeled as a row inside the agency org; `tenant_type` flag distinguishes agency vs direct-hire (one code path).
- **The provenance spine:** `parse_run / scoring_run / generation_run` tables; tall `score` table (one row per parameter with `rationale_text` + `evidence_refs`); immutable versioned `resume` rows (`content_hash`, `is_current`, `superseded_by`); version-pinned `requisition_skill` weight sets.
- **Append-only, hash-chained `audit_event`** (INSERT-only DB grants, `prev_hash` chain). WORM/S3 Object Lock anchoring of the chain head deferred to Phase 1, but the chain itself starts now.
- **Thin in-house multi-model router** exposing `generate(task, input, schema, policy)`, LiteLLM underneath only for SDK normalization. Versioned prompts in git. Structured-output (JSON-schema) enforcement + self-repair. Content-hash response cache (reproducibility + cost).
- **Presidio-based PII redaction/tokenization stage** between app and router — no service may call a provider directly. Sandboxed, network-egress-denied file-parsing workers (gVisor/Firecracker; XXE/macro disabled; content-based MIME validation).
- Cross-language contract: REST + OpenAPI 3.1 (FastAPI → openapi-typescript), CI drift gate. Next.js BFF with HttpOnly encrypted session cookie minting short-lived (5-min) EdDSA internal JWTs carrying `org_id/client_id/roles`. Arq + Redis for background jobs.
- Infra: ECS Fargate for Python/workers in one VPC; Next.js on Vercel; KMS; Sentry; self-hosted Langfuse (in-VPC LLM observability); feature flags.
- **PII isolation:** encrypted `candidate.pii_jsonb`, per-tenant envelope encryption (per-tenant DEK wrapped by KMS KEK) enabling crypto-shred deletion.

**Spike (de-risk):** Cross-tenant leak probe — automated test proving a pgvector KNN query and an Arq worker *cannot* return another tenant's rows even with a deliberately omitted app-layer filter (RLS must catch it). This validates the whole isolation thesis before any candidate data exists.

**Compliance gates established (not yet "passed" — built):** provenance constraint, hash-chained audit log, PII segregation + crypto-shred, redaction-before-egress.

**Deliverables:** Running multi-tenant skeleton; one recruiter can log in (in-house auth only), upload a resume into an isolated tenant, and see it stored immutably and audited. No scoring yet.

**Dependencies:** none (entry point).

**Success metrics:** Cross-tenant leak probe passes in CI (0 leaks across RLS, pgvector, and worker paths). 100% of AI writes carry a run id (enforced by constraint, verified by a test that attempts a bare insert and is rejected). p95 DB query < 50ms with RLS predicate on. Audit chain verification job confirms an unbroken hash chain.

**Duration:** 8–10 weeks.

---

### Phase 1 — MVP: Explainable Single-Tenant Screening Loop (★ MVP CUT LINE ★)

**Goal:** A recruiter for *one agency* can take a JD → see CORE-vs-NICE skills with weights → score a candidate on transparent sub-scores with evidence spans → generate tiered screening questions with structured answer keys → and **manually** set GREEN/AMBER/RED triage with a reason code, fully audited. This is the smallest thing that delivers daily value and proves the explainable-decision thesis end to end.

**Why here / sequencing rationale:** This is the product's core loop. It must ship before agentic continuous assessment (Phase 4), enterprise SSO (Phase 3), and preference learning (Phase 5) because those all *depend on* having a working, audited, explainable screening event to learn from, secure, and automate. We deliberately keep it single-tenant-shaped (RLS is on, but we onboard one design-partner agency) and human-driven to validate quality before scaling decisions.

**Scope:**
- **JD ingestion & skill extraction:** Lightcast Open Skills taxonomy self-hosted in Postgres (ltree hierarchy, per-skill embeddings); hybrid extraction = JSON-schema-constrained LLM primary + deterministic taxonomy resolver + **hard span-grounding gate** (no requirement not literally in the JD) + cheap NER recall net. CORE-vs-NICE inferred from section membership + modal phrasing, LLM only for ambiguous prose, **recruiter correction always overrides**. Weights seeded from extraction, recruiter-editable in-UI, **version-pinned at confirmation**.
- **Resume parsing & fitment:** Phase-1 ships **LLM-only constrained extraction** (validate cheaply; commercial parser deferred to Phase 2 at volume) layered on a deterministic backbone where possible. Fitment = **weighted composite of independent sub-scores**, each by cheapest defensible method (deterministic rules for countables, pgvector cosine for semantic proximity, LLM-as-judge only for qualitative). Two-tier skill matching (ontology/alias lexical + embedding cosine with thresholds). Per-req **frozen ScoringSpec** (skills, weights, thresholds, pinned model/embedding versions, temperature 0). Scoring runs on a **redacted** profile.
- **Screening Q&A generation:** per-(skill, tier) **pool of 3–5 questions** scoped per JD (reuse + anti-cheat + EEOC consistency control); **structured JSON answer keys** (weighted expected_points, synonyms, red_flags, partial-credit, thresholds); Bloom-anchored difficulty + separate LLM-as-judge verification. RAG over a small curated Skill Canon for job-relatedness. Progressive key reveal + role-gated access, all reveals/scores audited. Recruiter grades manually with AI-assist optional (AI auto-grade deferred to avoid automation bias before calibration).
- **Triage:** per-(candidate × req) state, **always human-set with a reason code**; AI only *suggests* with rationale + evidence spans. RED requires affirmative human action.

**Spike (de-risk, run at phase start):** Span-grounding & hallucination spike — measure on a labeled JD/resume gold set whether the grounding gate actually prevents phantom requirements and whether the composite sub-score design holds up vs. the tempting "single LLM fit score" shortcut. This is the make-or-break for the explainability thesis.

**Compliance gates (must pass before onboarding the design partner's real candidates):**
- Human-in-the-loop enforced server-side: no triage state can be written without a human actor + reason code (not a UI nicety — a DB/service constraint).
- Every score traces to a frozen ScoringSpec + run provenance; "regenerate this exact score" works.
- Redaction-before-scoring verified (no name/grad-year/school/address in scoring inputs).
- Gold-set regression gate on extraction + scoring so a model/prompt change can't silently shift distributions.

**Explicitly deferred:** adverse-impact monitoring is *not yet live at scale* (Phase 2) — MVP runs with a single design-partner agency under contractual cover and low volume, with the audit trail capturing everything for retrospective analysis. Fraud detection, preference learning, continuous agents, enterprise SSO, commercial parser, ATS import — all later.

**Deliverables:** End-to-end screening for one agency, demoable: JD in → weighted skills → scored candidate with per-parameter evidence → tiered questions + keys → human triage, all audited and reproducible.

**Dependencies:** Phase 0 (router, provenance, RLS, redaction, audit).

**Success metrics:** Design-partner recruiter completes a real screen unassisted; recruiter agreement with AI-suggested triage tracked (target: high agreement *with* evidence of genuine review — flag rubber-stamping). Span-grounding gate rejects ≥95% of injected phantom requirements in test. Score reproducibility 100% (identical inputs → identical score via cache + temp 0). < 10s synchronous JD extraction or graceful async.

---

### Phase 2 — Adverse-Impact Monitoring, Bias Auditing & Hardened Provenance (the gate that unlocks scale)

**Goal:** Make the platform *defensibly* able to make/influence employment decisions at volume by standing up the EEOC machinery: voluntary demographic collection in a hard-segregated store, 4/5ths + significance monitoring at every decision gate, faithful explanations, adverse-action notices, and the build/buy split for the independent audit.

**Why here / sequencing rationale:** This is THE compliance gate that must precede multi-tenant scale (Phase 3) and any automated influence (Phases 4–5). The digest is explicit and repeated: you cannot run 4/5ths on a population you never measured, and personalization/agents amplify bias — so monitoring must be live *before* those ship. We place it right after the MVP proves the decision loop works, so we instrument a real, validated loop rather than a hypothetical one.

**Scope:**
- **Demographic data service:** voluntary self-ID (EEO-1 template), stored in a **physically/logically segregated** schema/service with its own key and role, **no read path from scoring/ranking** (BFF-blocked); joined only inside an isolated AI-Impact analytics job. BISG/name-zip inference **rejected** (digest decision).
- **Impact-monitoring engine (build):** statsmodels/scipy/fairlearn computing 4/5ths impact ratio **AND** statistical-significance tests at *every* gate (score threshold, G/A/R triage, advance, client-select, hire), intersectional (sex × race) breakdowns, small-cell suppression. Continuous monitoring with alerting; minimum-volume policy before a gate's stats are considered valid.
- **Faithful explanations:** generated from stored per-criterion attributions (SHAP for any ML components; structured rubric output + grounding citations for LLM-judged), **never** post-hoc LLM narrative. Adverse-action-style candidate notices on automated-gate rejections.
- **Independent bias audit (buy):** integrate a third-party attestation vendor (Holistic AI / Warden-class) for the LL144/Colorado-required *independent* annual audit; keep core stats in-house.
- **Router as compliance surface:** model/weight/prompt changes that touch decisions become change-controlled, model-carded, revalidated — not silent cost swaps. Eval harness gates promotions on quality **and subgroup fairness deltas**.
- **Audit hardening:** WORM/S3 Object Lock anchoring of the hash-chain head; retention reconciliation (pseudonymize PII on deletion request but retain de-identified decision metadata under legal-basis exception for the SoL window).
- **De-identified retention purge:** scheduled job NULLs PII per `pii_retention_days` while preserving de-identified score/triage rows (keeps the 4/5ths denominator intact).

**Spike (de-risk):** Demographic-data legality + volume spike — with counsel, validate the consent/collection mechanism and stress-test whether small tenants/niche roles will ever reach statistically valid self-ID volume (drives the pooled-baseline / minimum-volume policy decision flagged as open).

**Compliance gates (now fully operational — this phase IS the gate):** 4/5ths + significance live at all gates; faithful explanations; segregated demographics with proven non-use (proxy-correlation probe); WORM audit; change-controlled decision models.

**Explicitly deferred:** automatic *dampening* of failing gates is wired but conservative (alert + require human compliance review first); full automated remediation tuned later.

**Deliverables:** Live adverse-impact dashboard per tenant; candidate adverse-action notices; passing internal proxy-leakage probe; vendor engaged for independent attestation; "prove this model never saw demographics" report.

**Dependencies:** Phase 1 (a real decision loop to instrument); Phase 0 (audit chain, provenance).

**Success metrics:** 4/5ths + significance computed at 100% of decision gates with intersectional breakdown; proxy-correlation audit shows no scoring feature correlates with a protected class above threshold; explanation-faithfulness check (attribution vs. actual computation) passes; independent auditor can replay any decision from provenance.

---

### Phase 3 — Multi-Tenant Scale, Enterprise SSO & ATS Onboarding (open the doors)

**Goal:** Move from one design-partner agency to many agencies + direct-hire companies, with enterprise-grade identity, SCIM provisioning, the redaction wall between agency recruiters and client hiring managers, and ATS import for real-world candidate inflow.

**Why here / sequencing rationale:** SSO/SCIM is enterprise-*procurement* table-stakes but contributes nothing to the core decision quality, so it's deliberately threaded in *after* the audited decision loop and monitoring exist — there's no point securing a loop that isn't yet defensible. Multi-tenant scale must wait until adverse-impact monitoring (Phase 2) is live, because scaling an unmonitored decision system is the exact liability the digest warns against.

**Scope:**
- **Enterprise identity (buy WorkOS):** SAML 2.0 / OIDC SSO, **SCIM 2.0** directory sync, per-connection enterprise admin; gated behind an enterprise plan tier. Candidate identities stay **in-house** (passwordless magic-link + OTP), separate from the per-connection IdP (cost + breach-surface). Fast de-provisioning on SCIM revoke.
- **Authorization at scale:** **OpenFGA (ReBAC)** modeling org → client → req and recruiter-acting-on-behalf-of-client relationships, RBAC for auditability ("who could see this candidate?"), Postgres RLS as the DB backstop.
- **Redaction wall (server-side):** enforced in the data layer, not UI — hiding protected-class proxy fields (name, photo, grad year) from client hiring managers per compliance/per-client config; fraud signals and raw flags **suppressed from clients**. Verified against export/API/AI-rationale re-exposure paths.
- **ATS import (buy Merge.dev):** unified connector for Greenhouse/Lever/Ashby/Workday rather than per-vendor builds.
- **Commercial resume parser (buy Affinda/Textkernel)** for the deterministic backbone now that volume justifies the per-doc fee over LLM token cost; LLM stays for inferred skills/seniority only.
- **Workload identity (SPIFFE/SPIRE):** mTLS + scoped JWT so background jobs run with the originating principal's tenant scope — prerequisite for safe agents in Phase 4.
- **WORM-anchored audit** and per-tenant token budgets enforced.

**Spike (de-risk):** Redaction-wall bypass spike — red-team exports, API responses, and AI-generated rationale text for any path that re-exposes a redacted proxy field to a client. Plus a PgBouncer `SET LOCAL` context-bleed test (connection-pool tenant leak).

**Compliance gates (must pass before opening to new tenants):** redaction wall enforced server-side and red-teamed; SCIM de-provisioning timely; access audit complete (every principal, including service accounts, logged for "who accessed this candidate"); per-new-tenant adverse-impact monitoring auto-enabled (no opt-out).

**Explicitly deferred:** continuous agentic re-ranking (Phase 4), preference learning (Phase 5), db-per-tenant isolated tier (Phase 6, only if a contract forces it).

**Deliverables:** Multiple agencies + direct-hire companies onboarded with SSO/SCIM; ATS-imported candidates flowing in; client hiring managers see only redacted, client-appropriate views; commercial parser in production.

**Dependencies:** Phase 2 (monitoring must auto-enable per tenant); Phase 1 (the loop being secured); Phase 0 (RLS, JWT seam).

**Success metrics:** SSO login + SCIM provision/de-provision round-trip < target SLA; redaction-bypass red-team finds 0 leaks; ATS import populates candidates with correct provenance; no cross-tenant access in production audit review; per-tenant token budgets enforced.

---

### Phase 4 — Durable Agentic Continuous Assessment & RAG-at-Scale (the differentiator, fenced)

**Goal:** Introduce the continuously-running agents that re-assess, sort, rank, and build the reusable candidate database — but as **advisory-only**, human-gated, tenant-scoped workflows on durable orchestration, with RAG hardened for explainable, cited grounding.

**Why here / sequencing rationale:** Agents are the highest-leverage feature *and* the highest-risk vector (cross-tenant leak, runaway cost, automation bias, biased fraud flags). They are gated last among the AI features because they require *everything* prior: scoped workload identity (Phase 3), live adverse-impact monitoring to catch agent-amplified bias (Phase 2), the audited decision loop they operate on (Phase 1), and the router/provenance floor (Phase 0). Shipping agents before these would be the digest's worst-case scenario realized.

**Scope:**
- **Durable orchestration: Temporal** introduced now (Arq stays for fast synchronous parse/score). LangGraph inside Temporal activities for individual agent reasoning graphs. Deterministic workflow IDs (idempotency), per-activity retries/backoff, signals for human-in-the-loop injection, timers for the re-ranking loop; replayable history doubles as audit trail.
- **Two-stage recall-then-score:** pgvector ANN + SQL must-have filters select a candidate slice; only top-K get full LLM fitment scoring. **Nightly batch cron re-scores only pairs whose inputs changed** (cost control). Batch API for bulk re-scoring.
- **RAG hardening:** stay on **pgvector HNSW** (co-located, RLS-filtered, no separate vector DB yet); structured semantic chunking with char-offset spans for citations; **hybrid retrieval** (Postgres FTS/BM25 + dense ANN, RRF fusion) + **cross-encoder reranker** (Cohere Rerank 3 or self-hosted bge-reranker-v2-m3); pinned per-index embedding model with self-hosted open-weights fallback for PII-sensitive tenants; **Ragas + LLM-judge + sampled human review as a CI gate**, every retrieval logged. SQL (not RAG) for ranking, counts, timeline/overlap math.
- **Fraud / authenticity detection** ships here as a fenced agent: **evidence-based advisory flags only**, never auto-reject, **never folded into fitment**, reported separately. Two-tier (deterministic Tier-A timeline/coverage math primary; LLM Tier-B advisory, reliability-discounted). AI-text detection a **weak corroborating signal only**, never standalone, never surfaced as accusation. Resume-vs-Q&A contradiction checks constrained to cited spans. Immutable `IntegrityReport` + recruiter adjudication; raw flags suppressed from clients. Candidate right-to-respond on MEDIUM/HIGH flags.
- **Agent governance:** outputs flow to a **proposed-actions queue** gated by human confirmation + a **policy gate that blocks auto-reject on protected-class proxies**. Agents run with the spawning principal's scope (never ambient all-tenant authority). Contextual bandit / capped exploration to prevent feedback-loop collapse and re-test under-surfaced candidates.
- **Talent-pool freshness:** TTL + re-consent cadence; re-assessment never ranks on expired-consent or stale-skill data.

**Spike (de-risk):** (a) Agent cross-tenant + cost spike — prove a fan-out agent can't exceed its tenant scope and can't trigger a retry-storm token blowup (hard per-step budgets). (b) Fraud-flag bias spike — measure whether Tier-B + AI-text signals fire unevenly across groups *before* exposing flags to recruiters.

**Compliance gates (must pass before agents act on real candidates):** agents advisory-only verified (no side-effecting tool can commit a triage without a human); fraud flags pass adverse-impact + proxy-correlation audit; RAG faithfulness CI gate green (no hallucinated skills); per-step token budgets + per-tenant caps enforced; every agent action tied to model+prompt+inputs+human-override in the audit trail.

**Explicitly deferred:** preference learning / personalized ranking (Phase 5) — agents here rank on *client-agnostic merit* only; per-client taste comes next.

**Deliverables:** Continuous re-ranking loop populating a reusable, consent-fresh candidate DB; advisory fraud flags with right-to-respond; hardened cited RAG feeding screening; all agent runs replayable and audited.

**Dependencies:** Phase 3 (SPIFFE scoped identity, multi-tenant volume); Phase 2 (monitoring to catch agent-amplified bias); Phase 1 (the scoring loop agents operate).

**Success metrics:** Agent cross-tenant probe = 0 leaks; re-ranking loop cost stays within per-tenant budget under load test; fraud-flag false-positive rate measured and no statistically significant group skew; RAG faithfulness ≥ target on CI gold set; 0 agent-initiated triage commits without human confirmation.

---

### Phase 5 — Client Preference Learning & Personalized Ranking (the most bias-sensitive feature, last)

**Goal:** Learn each client's screening taste (qualitative + quantitative) to personalize ranking — as a **bounded delta on top of client-agnostic merit**, never crossing the GREEN/RED boundary, never auto-rejecting, and continuously audited for proxy-laundered bias.

**Why last / sequencing rationale:** This is, by the digest's own repeated warning, the feature most likely to "learn and amplify a client's protected-class bias and launder it as personalization." It is sequenced dead last among AI features because it can only be made safe *on top of* live adverse-impact monitoring with automatic dampening (Phase 2), the exploration machinery to prevent feedback-loop collapse (Phase 4), and a substantial corpus of audited feedback (accumulated across Phases 1–4). Shipping it earlier would mean learning preferences with no way to detect the bias it encodes.

**Scope:**
- **Three-level hierarchical model** (per-req over per-client over global prior) with empirical-Bayes / feedback-volume-weighted shrinkage (`w_eff = α·w_req + β·w_client + γ·w_global`) — solves cold-start and sparsity; new clients lean on the global prior.
- **LambdaMART (LightGBM lambdarank)** optimizing NDCG over an ordinal outcome ladder as primary re-ranker; L2-regularized logistic/linear feature-weight model as interpretable fallback + cold-start default.
- **Embedding-based collaborative warm start** (k-NN in client-embedding space via pgvector) — *gated* by the cross-tenant bias-transfer check below.
- **Contextual bandit** (Thompson sampling / LinUCB) injecting capped exploratory candidates — prevents collapse, doubles as fairness re-test.
- **LLM-generated Client Preference Card** is advisory and human-editable, **never a silent score input**.
- **Bounded personalization:** delta caps how far taste overrides merit; hard rule that personalization can never move a candidate across GREEN/RED; human accountable for every advance/reject.
- **Bias controls (core of this phase):** exclude protected attributes + **curated proxy blocklist** (school, name, ZIP, employment gaps) from features; **periodic proxy-leakage probe tests**; continuous 4/5ths monitoring **on recommendations** with **automatic dampening to the audited prior on failure**. Learned preferences themselves run through adverse-impact + proxy screening **before** they influence ranking. Per-client preference model requires human approval before activation. Drift detection (6–9 month recency half-life) with retrain. Reason-code integrity guards against gaming.

**Spike (de-risk, run first):** Proxy-leakage + bias-amplification spike — on historical feedback, prove the proxy blocklist + output monitoring actually catches a client whose past decisions disparately rejected a protected group, and that warm-start k-NN does **not** transfer one client's bias to another via embedding similarity (the cross-tenant bias-propagation risk).

**Compliance gates (must pass before any personalized rank reaches a recruiter):** learned preferences pass adverse-impact + proxy audit *before activation*; automatic dampening-to-prior on 4/5ths failure verified live; personalization-delta bound enforced server-side (cannot cross G/R); cross-client bias-transfer probe clean; preference model activation requires human approval.

**Business/legal protocol (flagged open question, must be decided here):** what happens when a client's own decisions repeatedly fail 4/5ths — silently dampen, warn, refuse to personalize, or escalate. This is a contract + liability decision, not just engineering.

**Deliverables:** Per-client personalized ranking as a bounded, audited delta; advisory Preference Cards; live recommendation-side adverse-impact monitoring with auto-dampening; preference-model approval workflow.

**Dependencies:** Phase 4 (exploration, agent ranking infra); Phase 2 (adverse-impact monitoring + auto-dampening); accumulated feedback corpus from all prior phases.

**Success metrics:** Personalization improves NDCG / advance-rate vs. merit-only baseline on held-out feedback **while** passing recommendation-side 4/5ths; proxy-leakage probe finds no protected-class proxy among active features; auto-dampening triggers correctly on synthetic biased-client test; 0 personalized ranks cross the GREEN/RED boundary.

---

### Phase 6 — Hardening, Isolated-Tier Escape Hatch & Regulatory Breadth (steady-state)

**Goal:** Scale economics, satisfy contractual data-isolation demands, broaden multi-jurisdiction compliance, and address self-service/candidate-rights depth.

**Why here:** These are demand-driven, not blocking. The digest explicitly keeps db-per-tenant, dedicated vector DB, Aurora migration, and multi-jurisdiction coverage as deferred-until-forced decisions.

**Scope:**
- **Isolated tier (db-per-tenant)** as a paid escape hatch *only when a contract (government / regulated / data-residency) forces it* — everything already keys on `org_id`, so it's an escape hatch, not a fork.
- **Aurora migration** from Neon at steady-state scale (VPC-locality, PITR SLAs); **dedicated vector DB (Qdrant)** *only if* the pgvector-to-Qdrant trigger (vector count / QPS ceiling) fires.
- **Self-hosted private-inference tier** (open-weights, zero-egress) for maximum-sensitivity tenants; BYOK / tenant-held keys making super-admin break-glass technically impossible for top-tier clients.
- **Multi-jurisdiction compliance breadth** (NYC LL144 specifics, Colorado SB205, Illinois, California ADS) layered on the EEOC baseline; regulatory-whiplash adaptability.
- **Candidate self-service depth:** right-to-human-review, deletion, score/status visibility — calibrated per-jurisdiction and per agency-vs-direct mode.
- **Non-English JD/resume ingestion** (elevates ESCO multilingual value) if the target market requires it.

**Compliance gates:** per-jurisdiction monitoring profiles validated; candidate-rights flows reconciled with litigation-hold retention; isolated-tier inherits all prior gates.

**Deliverables:** Isolated-tier offering; private-inference tier; multi-state compliance; candidate self-service portal.

**Dependencies:** all prior phases; specific contracts/regulations as triggers.

**Success metrics:** isolated-tier tenant provisioned with zero shared-data paths; private-inference tenant runs end-to-end with zero external egress; jurisdiction-specific audit passes; candidate deletion request honored while decision-trail integrity preserved.

**Duration:** ongoing / demand-driven.

---

### Cross-Phase Dependency Summary

- **Phase 0 → everything** (router, provenance, RLS, redaction, audit are universal prerequisites).
- **Phase 1 (MVP)** needs only Phase 0.
- **Phase 2 (adverse-impact)** needs a real decision loop (Phase 1) to instrument — and **must precede** any scaling (3) or AI-influence (4, 5).
- **Phase 3 (scale/SSO)** needs Phase 2's monitoring to auto-enable per new tenant; provides **SPIFFE scoped identity** that Phase 4 agents require.
- **Phase 4 (agents/RAG/fraud)** needs Phase 3's scoped identity + Phase 2's monitoring; provides the exploration + ranking infra Phase 5 builds on.
- **Phase 5 (preference learning)** needs Phase 2 (auto-dampening), Phase 4 (exploration), and an accumulated feedback corpus — hence last.
- **Phase 6** is demand-/contract-/regulation-triggered.

### Honest Effort Notes

- Phases 0–2 are the unglamorous majority of the de-risking work and the legal moat; resist pressure to compress them to reach "the AI features" — the digest's catastrophic risks all live in skipping them.
- The single biggest delivery risk is **black-box creep** under deadline pressure (collapsing the evidence-tree composite into one LLM "fit score"). The frozen-ScoringSpec + tall score-table + gold-set regression gate exist specifically to make the shortcut harder than doing it right.
- **Automation bias** (recruiters rubber-stamping suggestions) is a process risk no architecture fully solves; the reason-code requirement and recruiter-agreement tracking are partial mitigations, monitored from Phase 1 on.
