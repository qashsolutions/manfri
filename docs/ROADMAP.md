# ManFriday — Phased Roadmap

> Companion to ARCHITECTURE.md, PRD.md, DECISIONS.md.

## Sequencing rationale

ManFriday is a lean recruiter tool for software/technical staffing agencies, built on
Next.js 15 / React 19 (Vercel) with a TypeScript backend (Next.js Route Handlers / Server
Actions) over Supabase Postgres + pgvector, Supabase Storage, and Supabase Auth. The
roadmap is three phases, ordered around getting real value into a recruiter's hands fast and
then making it sharper:

1. **Ship the real loop first.** Phase 1 puts the whole recruiter workflow — accounts,
   résumé upload + parse, JD → CORE/NICE skills, transparent match/rank, screening questions,
   lightweight triage, and outreach send — live end-to-end. A useful, complete loop beats a
   polished sub-component.
2. **Add accuracy second.** Phase 2 upgrades the parts users will push on once they live in the
   product daily: semantic/hybrid matching via pgvector, better parsing, and ranking tuned by
   the feedback Phase 1 captured.
3. **Add learning third.** Phase 3 closes the loop — captured feedback and outcomes feed
   measurable improvement over time — and parks the genuinely optional, demand-driven extras
   (deeper agents, ATS integration, more verticals) behind it.

Four invariants hold across all three phases:

1. **Org isolation via RLS is absolute**, including pgvector KNN queries. Every tenant-scoped
   table carries `org_id`; isolation is enforced by Postgres Row-Level Security keyed on the
   `org_id` claim in the Supabase Auth JWT, never by application-layer filtering alone.
2. **A human recruiter makes the call.** AI suggests, assists, and flags; it never auto-rejects
   a candidate or sets an outcome on its own.
3. **Capture data now, learn later.** Decisions, recruiter corrections, and outcomes are
   recorded from day one so Phases 2–3 have something real to learn from.
4. **Plain append-only audit log** of key actions (uploads, sends, status/outcome changes).

There is no EEOC/adverse-impact posture, no demographics collection, no run-provenance, and no
redaction/router seam. Candidate data is PII handled with pragmatic GDPR/CCPA hygiene
(soft-delete + hard-delete on request); outreach follows CAN-SPAM. See DECISIONS.md
([#d1](DECISIONS.md#d1-candidate-model--consent),
[#d5](DECISIONS.md#d5-data-retention--deletion),
[#d8](DECISIONS.md#d8-infrastructure-supabase--vercel),
[#d9](DECISIONS.md#d9-triage-states--feedback-capture)) for the governing calls.

---

## Phase 1 — The Real Loop, Live on Supabase + Vercel

**Goal:** A recruiter at a staffing agency can sign in, build up a résumé database, post a job,
see ranked candidate matches with a transparent fit score, generate screening questions, set a
lightweight triage state, and run a consent-respecting outreach campaign — the complete daily
workflow, live on Supabase + Vercel.

**Scope:**
- **Accounts & org isolation (Supabase Auth).** Org (= staffing agency) and recruiter accounts;
  many recruiters per org sharing the org's data. Strict org isolation via Postgres RLS keyed on
  the `org_id` claim in the Supabase Auth JWT. The same candidate/résumé may exist independently
  in multiple orgs with no cross-org link; within-org dedupe by normalized email is fine.
  ([#d1](DECISIONS.md#d1-candidate-model--consent),
  [#d8](DECISIONS.md#d8-infrastructure-supabase--vercel))
- **Résumé upload + parse.** Single and bulk upload into Supabase Storage; deterministic v1
  parser (regex/lexical field extraction → skills, experience estimate, contact presence) with
  no LLM dependency. LLM-assisted parsing is a Phase-2 upgrade.
- **Authenticity / plausibility flags at upload.** Bounded sub-agent checks run as résumés land:
  deterministic rules (implausible experience-vs-skill-count, timeline inconsistencies,
  duplicates) plus an optional LLM check, surfaced as **advisory** flags. The recruiter decides;
  flags never auto-reject and are never folded into the fit score.
- **JD → CORE/NICE skills + completeness.** A posted JD is parsed against the self-hosted skills
  taxonomy into suggested skills; the recruiter confirms and re-tiers them as CORE vs NICE with
  weights. A deterministic 0–100 completeness score nudges the recruiter toward a well-specified
  req. ([#d13](DECISIONS.md#d13-lightcast-license))
- **Transparent match / rank.** Lexical skill-overlap fit, `0.8·core_coverage +
  0.2·nice_coverage`, scored 0–100, with a per-skill matched/missing breakdown the recruiter can
  read and trust. No black-box score. ([#d6](DECISIONS.md#d6-per-candidate--per-screen-cost-ceiling))
- **Screening-question generator + answer keys.** Per candidate × req, generate 15 questions —
  5 SIMPLE, 5 MEDIUM, 5 HARD — grounded in the résumé and JD, each with a model answer key. The
  recruiter grades; AI-assisted grading is optional, never automatic.
  ([#d12](DECISIONS.md#d12-screening-administration--ai-assist-grading))
- **Lightweight triage.** Recruiter-set `candidate.status` and `proposal.outcome`, per
  (candidate × req). No GREEN/AMBER/RED machine, no reason-code taxonomy — just the states a
  recruiter actually uses. ([#d9](DECISIONS.md#d9-triage-states--feedback-capture),
  [#d10](DECISIONS.md#d10-placementoutcome-tracking))
- **Outreach send.** Mass email/outreach with a simple consent/unsubscribe flag and CAN-SPAM
  compliance (physical address, working unsubscribe, honored opt-outs). Send IS built in this
  phase. ([#d3](DECISIONS.md#d3-vendor-posture--terms-of-service))
- **Capture feedback from day one.** Every decision, correction, and outcome is recorded behind
  the plain append-only audit log so later phases have real signal to learn from.

**Explicitly deferred:** semantic/embedding matching (Phase 2); LLM-assisted parsing at quality
(Phase 2); feedback-tuned ranking (Phase 2); the learn-over-time loop (Phase 3); deeper agents,
ATS integration, additional verticals (Phase 3, optional).

**Dependencies:** none — this is the entry point. Reuses the existing built Next.js UI in `web/`
against the live data source.

**Success signals (qualitative):** a real recruiter completes the full loop unassisted — upload
résumés, post a JD, see ranked matches, generate and grade screening questions, set triage, and
send an outreach campaign — on live Supabase + Vercel; the skill-overlap match feels useful and
explainable rather than arbitrary; advisory flags catch obviously thin/implausible résumés
without getting in the way; and decisions/outcomes are being captured for later use.

---

## Phase 2 — Accuracy Upgrades

**Goal:** Make matching, parsing, and ranking noticeably sharper now that recruiters are living in
the product daily and the system has captured real usage to learn from.

**Scope:**
- **Semantic / hybrid matching via pgvector.** Add embeddings (via an embedding API, stored in
  pgvector with org-scoped RLS) so matching captures semantic proximity — "React" ↔ "frontend",
  related-skill credit — not just case-insensitive exact overlap. Hybrid lexical + dense ranking
  layered over the Phase-1 transparent score, keeping the breakdown explainable.
- **Better parsing.** Upgrade the deterministic v1 parser with LLM-assisted extraction (called
  directly from TypeScript via the Vercel AI SDK, optional and additive) for richer skill detection,
  CORE-vs-NICE inference, seniority, and cleaner field extraction, with deterministic rules as the
  fallback backbone.
- **Feedback-tuned ranking.** Use the decisions/corrections/outcomes captured in Phase 1 to tune
  ranking — surface what recruiters actually advance, de-emphasize what they consistently reject —
  while keeping a human in the loop and the score legible.

**Explicitly deferred:** the full learn-over-time loop and continuous improvement (Phase 3);
deeper agents, ATS integration, more verticals (Phase 3, optional).

**Dependencies:** Phase 1 (a live loop generating the matches, parses, and feedback this phase
sharpens). LLM/embedding spend stays within the per-candidate / per-screen cost ceiling
([#d6](DECISIONS.md#d6-per-candidate--per-screen-cost-ceiling)).

**Success signals (qualitative):** matches surface relevant candidates that the exact-overlap
matcher missed; recruiters trust the upgraded matching enough to lean on it; parsed skills and
tiers need fewer manual corrections; ranking visibly reflects how this org's recruiters actually
screen.

---

## Phase 3 — Learn Over Time

**Goal:** Close the loop — turn the accumulated feedback and outcomes into measurable, ongoing
improvement — and treat the heavier extensions as optional, demand-driven work that sits behind it.

**Scope:**
- **Learn-over-time loop.** Systematically feed captured feedback and placement/screen outcomes
  ([#d10](DECISIONS.md#d10-placementoutcome-tracking)) back into matching, ranking, and
  question quality, so the product gets better with use within each org. Org isolation still holds:
  learning happens per org, never across the org boundary
  ([#d1](DECISIONS.md#d1-candidate-model--consent)).
- **Optional later (demand-driven):**
  - Deeper agents — more autonomous sourcing/screening assists, still advisory and human-gated.
  - ATS integration — import/export with the agencies' existing applicant-tracking systems.
  - More verticals — software/technical staffing is the first vertical
    ([#d11](DECISIONS.md#d11-initial-vertical--role-mix)); other role families come only when
    demand justifies the taxonomy and parsing work.

**Explicitly deferred:** anything not pulled in by real customer demand. The optional items above
ship only when a customer need or contract makes them worth building.

**Dependencies:** Phase 2 (sharper matching/ranking to improve on) and the feedback corpus
accumulated across Phases 1–2.

**Success signals (qualitative):** the product demonstrably improves with use — recruiters notice
that matches, questions, and rankings get better over weeks of feedback; an org's accumulated
decisions make the next screen faster and more accurate; and any optional extension that does ship
is pulled by a concrete customer need rather than pushed speculatively.

---

## Cross-Phase Dependency Note

The chain is simple and strictly forward: **Phase 1 → Phase 2 → Phase 3.** Phase 1 stands up the
complete live loop and starts capturing feedback. Phase 2 needs that loop and its captured data to
make matching/parsing/ranking more accurate. Phase 3 needs Phase 2's sharper foundation plus the
feedback accumulated across both prior phases to learn over time; its optional extensions
(agents / ATS / more verticals) are gated on customer demand, not on the schedule.

## Honest Notes

- **The main risk is over-engineering** — sliding back toward the heavyweight stack this pivot
  deliberately dropped (AWS/Fargate/KMS, Temporal, WorkOS, Redis/Arq, an EEOC/adverse-impact
  layer, a mandatory redaction/router seam, run-provenance and hash-chained crypto-audit). Resist
  reintroducing any of it. Stay on Supabase + Vercel + TypeScript; keep the four invariants and
  nothing more.
- **Keep LLM cost in check.** LLM and embedding use is optional and additive, called directly from
  TypeScript via the Vercel AI SDK. The unit-economics knob is which model runs which task; hold spend
  under the per-candidate / per-screen cost ceiling
  ([#d6](DECISIONS.md#d6-per-candidate--per-screen-cost-ceiling)) and prefer deterministic methods
  where they suffice.
- **Deliverability matters for outreach.** Mass email lives or dies on inbox placement and clean
  list hygiene — honor unsubscribes immediately, keep CAN-SPAM compliance tight, and monitor
  bounce/complaint rates so the sending domain stays trusted.
