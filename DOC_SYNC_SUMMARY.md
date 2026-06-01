# DOC_SYNC_SUMMARY — lean-rebuild docs pivot (2026-05-31)

A reviewable, per-file record of the documentation rewrite that brings every doc onto the **ratified lean
direction**: ManFriday is a **lean recruiter tool on TypeScript + Supabase + Vercel** — the heavyweight
EEOC-compliance + AWS posture is dropped, the Next.js UI stays, and the existing Python backend is being retired
and rebuilt in TypeScript (a separate code effort). **This was a docs-only change** — no application code,
migrations, or infra were touched (see "Not changed" at the end).

Branch: `docs-ts-pivot`. Working tree left changed for review (not committed).

## Canonical changes applied everywhere
- **Stack:** Next.js on Vercel (built) + **TypeScript backend** (Route Handlers / Server Actions) + **Supabase**
  (Postgres + pgvector + Storage + Auth). Background work via a TS-friendly pattern (Supabase scheduled
  functions / Inngest / Trigger.dev / QStash / Vercel cron).
- **Isolation:** Postgres **RLS keyed on the `org_id` claim in the Supabase Auth JWT** — replaces the old
  non-`BYPASSRLS` role + `SET LOCAL` GUC + in-house EdDSA-JWT pattern.
- **Removed everywhere:** AWS (Fargate/KMS/S3/VPC), Neon, Temporal, WorkOS, Redis/Arq, Terraform; the entire
  EEOC posture (adverse-impact/4-5ths, demographics/BISG, adverse-action notices, governed feature registry);
  Presidio redaction-before-egress; per-tenant envelope encryption / crypto-shred; hash-chained audit;
  run-provenance (`*_run`) + tall `score` tables; the multi-model router seam; the wedge/premium split.
- **Invariants** collapsed from 11 to **4**: (1) org isolation via RLS is absolute (incl. pgvector); (2) a human
  recruiter decides, AI never auto-rejects; (3) capture decisions/outcomes from day one to learn later; (4) a
  plain append-only audit log.
- **Tenancy:** tenant = org = staffing agency; many recruiters per org all share the org's data; **no cross-org
  link, no `candidate_identity` table**; within-org dedupe by normalized email.
- **Phases** collapsed from 6 compliance-gated to **3 lean**: (1) the real loop live; (2) accuracy upgrades
  (embeddings/hybrid via pgvector); (3) learn-over-time.

---

## Per-file changes

### `CLAUDE.md` (anchor; rewritten)
- **Removed:** the EEOC "non-negotiable thesis," the 11 engineering invariants, the AWS/Neon/Temporal/WorkOS/Arq
  stack table, the 7-phase compliance map, the wedge→premium GTM, provenance/redaction/crypto/hash-chain glossary.
- **Rewrote:** status banner (lean direction + code status), problem/goal/thesis, personas & tenancy (org = agency,
  all recruiters share org data, no cross-org link), screening workflow, architecture-at-a-glance, the stack
  table, the 3-phase map, glossary, repo layout (Python backend flagged "being retired").
- **Added:** the 4 slim invariants; a "Removed (do not reintroduce)" list; a pointer to `EXTRACTION_REPORT.md` as
  the port-from source of truth; working conventions reoriented to "lean is the point."

### `README.md` (rewritten)
- **Removed:** "employment-decision software under EEOC scrutiny" framing; the AWS/Neon/Terraform repo-layout
  note; the Python/pnpm+uv quickstart; the hash-chained-audit "non-negotiables."
- **Rewrote:** one-liner (lean recruiter tool, transparent + human-decided, learns over time); doc index; stack
  table (Supabase + Vercel + TS); repo layout (services/ flagged retiring).
- **Added:** the slim non-negotiables; a note that `SETUP.md` is legacy and being revised for the TS rebuild.

### `STATUS.md` (rewritten)
- **Removed:** "EEOC-defensible" goal, the wedge ($23/$10/premium) GTM, the ✅ Phase-0-compliance-skeleton +
  47-tests dashboard, the old 1/2/3+ phase mapping, the "compliance layer on top of Supabase / counsel before
  PII" infra notes.
- **Rewrote:** goal (lean tool that learns), a "direction = the lean pivot" section (dropped vs kept), a "what
  exists today (port-from baseline)" section grounded in `EXTRACTION_REPORT.md`, and the lean Phase 1/2/3 plan
  (all ⬜, since the TS rebuild is next).
- **Added:** explicit Supabase-Auth-+-RLS-on-JWT-claim infra; open decisions trimmed to email-provider / cost /
  light-ToS.

### `docs/ARCHITECTURE.md` (rewritten; 1245 → 321 lines)
- **Removed:** the entire EEOC Compliance/Bias-Auditing/Adverse-Impact section; the heavyweight
  Fake-Experience/Skill-Inflation section; Client Preference Learning; the Agentic Architecture & Multi-Model
  Router section; RAG-at-scale; the heavyweight risk register; all AWS/Neon/Temporal/WorkOS/Arq/Terraform/
  Presidio/envelope/hash-chain/`*_run`/`tenant_key`/`consent_ledger`/demographics references.
- **Rewrote:** System Overview (Browser → Next.js/Vercel → TS backend → Supabase); Auth & Tenant Isolation (RLS
  on the JWT `org_id` claim, with an explicit "replaces the old role+GUC pattern" note); flat org=agency tenancy;
  JD extraction (Lightcast Open Skills, seeded by the ~49-skill lexicon; today's all-as-core@1.0 behavior +
  recruiter re-tier); résumé parsing (deterministic v1); matching (the `0.8·core + 0.2·nice` formula).
- **Added:** Capability Map; lightweight triage (status + proposal outcome, no GREEN/AMBER/RED); 15-question
  screening generator; lean Authenticity-Flags-at-Upload section; Outreach (send built); a 5-row lean Risk
  Register; Optional LLM Use; Open Decisions pointing at the live DECISIONS anchors.

### `docs/ROADMAP.md` (rewritten)
- **Removed:** all six compliance-gated phases (0–6); the compliance-before-scale rationale; the MVP-cut-line
  framing; the standing run-provenance convention; every spike (cross-tenant leak / span-grounding /
  demographic-legality / proxy-leakage / fraud-flag-bias / bias-transfer); OpenFGA/SPIFFE/Merge.dev; the wedge.
- **Rewrote:** into the lean 3-phase sequence, each with Goal / Scope / Explicitly-deferred / Dependencies /
  qualitative Success-signals.
- **Added:** the new stack + slim invariants context; a forward-only 1→2→3 dependency note; "honest notes"
  (the main risk is over-engineering / reintroducing the dropped stack; watch LLM cost; deliverability matters).

### `docs/PRD.md` (rewritten)
- **Removed:** the "built to survive EEOC scrutiny" wedge; the client-hiring-manager and compliance/auditor
  personas; principles P-2/P-3/P-4/P-5 (evidence-provenance, reproducibility-100%, hash-chain, fair-by-
  construction); span-grounding-as-hard-gate, frozen `ScoringSpec`, run-provenance, redaction-before-scoring,
  IntegrityReport/fraud FRs, the GREEN/AMBER/RED state machine + reason-code taxonomy; ZDR/envelope NFRs; Neon/AWS.
- **Rewrote:** vision (lean tool that learns); recruiter + org-admin personas; principles → the 4 invariants +
  transparent matching + don't-over-automate; the phase table; the Phase-1 cut line; capabilities C1–C8 retagged
  `[P1]/[P2]/[P3]`; flows; lean NFRs (RLS / perf / cost ≤~$0.20 (D6) / accessibility / soft+hard delete (D5)).
- **Added:** the pivot note; within-org dedupe / no-`candidate_identity`; a lightweight-triage section; qualitative
  success metrics + Phase-1 acceptance criteria; assumptions/deps citing the live DECISIONS anchors.

### `docs/DECISIONS.md` (rewritten per the ratified dispositions)
- **D1** simplified to org-scoped / all-org-visible / no-cross-org-link + a simple consent flag → **RATIFIED**.
- **D2** (demographics) → **REMOVED** (tombstone heading kept). **D4** (jurisdictional floor) → **REMOVED**.
  **D7** (adverse-impact client protocol) → **REMOVED**.
- **D3** reframed to "vendor / tool, standard SaaS ToS + CAN-SPAM" → **NEEDS LIGHT COUNSEL** (dropped EEOC-liability
  framing).
- **D5** simplified to soft + hard delete on request (dropped crypto-shred + de-identified retention) → **RATIFIED**.
- **D6** (cost ceiling) kept → **PROPOSED**.
- **D8** replaced with **Supabase + Vercel + RLS-on-JWT-claim** (no AWS/VPC) → **RATIFIED**.
- **D9** simplified to lightweight status + proposal outcome + a feedback form (dropped adverse-action notices,
  reason-code taxonomy, score-calibration governance) → **RATIFIED**.
- **D10** kept, **rationale reframed** from "adverse-impact denominator" to "outcome truth for learning" → **RATIFIED**.
- **D11** (software/technical staffing first) kept → **RATIFIED**. **D13** (Lightcast free download, seeded by the
  49-skill lexicon) kept → **RATIFIED**.
- **D12** simplified to recruiter-administered 15-question screening, manual grade, AI-assist optional (dropped
  automation-bias gating) → **RATIFIED**.
- **Rewrote** the "reconciled stack notes" appendix (Supabase Auth not WorkOS/Clerk; TS background pattern not
  Arq/Temporal; plain audit not hash-chain; no demographics/BISG/4-5ths/redaction/envelope). Fixed the D8/D10
  heading slugs so cross-doc anchors resolve.

### `docs/PHASE_0.md` (rewritten; 302 → 80 lines)
- **Removed:** the entire buildable Phase-0 compliance-skeleton spec — the 17-section TOC, illustrative DDL, the
  14 work packages (WP 0.1–0.14), the leak-probe spike matrix, CI/exit criteria, "BUILT — 47 tests" status, and
  all AWS/Neon/Terraform infra.
- **Rewrote** into a concise "Foundation & Setup (formerly Phase 0)" note: a RETIRED banner (pointing to
  `EXTRACTION_REPORT.md` for where the Python build lives) + "what the lean foundation actually is" (Supabase
  project + RLS-on-JWT-claim + Supabase Auth + the Next.js UI seam + Vercel).
- **Added:** an old→new mapping table marking each old concern "survives in spirit" or "dropped."

### `docs/PHASE_1_BUILD.md` (rewritten)
- **Removed:** the "hard gate before real PII / counsel sign-offs D2/D3/D5 / region+DPA" section; FastAPI / Arq+Redis
  / OpenAPI-drift-gate / Presidio / envelope / `tenant_key` / non-BYPASSRLS+`SET LOCAL` as go-forward; the dropped
  tables; GREEN/AMBER/RED; the `$29`/wedge framing.
- **Rewrote** into the buildable TS-on-Supabase Phase-1 plan: locked decisions (cross-linked to DECISIONS), the
  real schema with RLS-on-JWT-claim (candidate gets a simple consent flag, not a ledger), and a clean
  **port-vs-new-build** split (parser+lexicon, matcher, completeness, flags, endpoint shapes, the 20-method
  DataProvider contract are **ports**; Supabase Auth+RLS, the 15-question screening generator, authenticity flags,
  outreach **send** are **new**).
- **Added:** the 5 formerly-unbacked UI methods Phase 1 must now back; a TS-friendly background pattern; a PR-sized
  build sequence; a light GDPR/CCPA + CAN-SPAM note replacing the PII gate.

### `docs/WEDGE_UI.md` (light rewrite; structure preserved)
- **Removed:** AWS/Neon; EdDSA-JWT/TOTP (→ Supabase Auth); "encrypted-at-rest / per-tenant key" wording; the
  consent-gated **cross-org pool** framing and the "proposal history (cross-org)" + "organizations" tab; the
  "compliance toggles" setting; the cross-org-pool and adverse-impact-monitoring open questions.
- **Rewrote:** intro (UI for the lean Supabase+Vercel tool); the core-flow block (the lean loop with authenticity
  flags at upload + the `0.8·core + 0.2·nice` fit + 15 screening questions + within-org feedback); the candidate
  model line (org-scoped, no cross-org link); `/candidates/[id]` and `/settings` notes; the "Compliance is
  visible" convention → "Trust is visible."
- **Kept** (still accurate to `web/`): the route map, the file hierarchy, the design-system note, and the
  "no AI in the UI / functional naming" convention.

### `docs/SUPABASE.md` (rewritten)
- **Removed:** the "ManFriday runs its own compliance layer on top" framing; the non-`BYPASSRLS` `manfriday_app`
  role + `SET LOCAL` GUCs + in-house EdDSA auth + KMS-envelope `ObjectStore`; "we do NOT use Supabase
  Auth/PostgREST"; the PII-gate/counsel-sign-off banner; the Python-alembic connection-string/`.env.cloud`/
  `supabase_validate.sh` flow.
- **Rewrote** into "Supabase — ManFriday's backend platform": create a project + enable pgvector; Supabase Auth
  with an `org_id` claim; the RLS pattern reading `auth.jwt() ->> 'org_id'`; a private per-org Storage bucket;
  Vercel/local env secrets.
- **Added:** a note that `db/supabase_validate.py` belongs to the retiring Python backend and is out of scope.

---

## Step 0 verification patch (2026-06-01)

A follow-up pass confirmed the rewritten docs specify the four core Phase-1 behaviors. Three were already
**PRESENT**; one was **thin and got patched**:
- **Fake-résumé detection at upload — PRESENT** (`docs/ARCHITECTURE.md` §12 + `docs/PRD.md` C2 / FR-2.1–2.2):
  bounded sub-agent advisory checks (incl. the 10yr/55-skill implausibility, timeline inconsistencies,
  duplicates), optional LLM pass, never auto-reject, extends `flags.py`, not a continuous fleet.
- **15 screening questions — PRESENT** (`ARCHITECTURE` §13 + `PRD` C5 / FR-5.1–5.2): 5 SIMPLE / 5 MEDIUM /
  5 HARD, grounded in résumé ∩ JD, structured JSON answer keys, recruiter-graded, AI-assist optional.
- **Consent/unsubscribe flag — PRESENT** (`ARCHITECTURE` §7 + §14, `PRD` FR-7.1–7.3, `DECISIONS` D1):
  `candidate.consent_state` (`pending`/`opted_in`/`unsubscribed`) + `consent_source`; CAN-SPAM unsubscribe;
  `consent_ledger` explicitly replaced by the flag.
- **How the TS backend calls LLMs — ADDED.** §17 previously said only "a provider SDK directly from
  TypeScript." Patched `ARCHITECTURE.md` §17 + the §15 stack table to name a concrete TS-native approach: the
  **Vercel AI SDK** (`ai` package) with a provider plugin (`@ai-sdk/anthropic` / `@ai-sdk/openai`) —
  `generateObject` for authenticity flags (§12) and screening-question authoring (§13), `embed`/`embedMany`
  for Phase-2 embeddings (§11). Aligned the same naming in `CLAUDE.md` (§8 note + §9 stack row) and
  `ROADMAP.md` (Phase-2 + honest-notes mentions).

## Core Objective + coverage scorecard (2026-06-01)

Documented the project's north-star objective and a living, honest build scorecard. Docs-only.
- **`CLAUDE.md`** — added a top section **"Core Objective & Tenancy (north star)"** (the six recruiter
  capabilities + the implemented tenancy/visibility model), added a `0.` TOC entry linking to it, and added a
  **§16 working convention**: every plan/design/build/test step is measured against the six capabilities, and
  work mapping to none is flagged as **scope creep first**.
- **`OBJECTIVE.md` (new)** — the canonical objective (mirrored) + a **coverage scorecard**: DONE 2 (map/rank #4,
  authenticity flags #5) · PARTIAL 3 (store+browse done but **filter NOT-BUILT** incl. **`vertical` has no
  field**; JD extraction **deterministic/all-core, "make robust" planned**; skills **reorder/reweight done but
  ADD not in the UI** — route accepts it) · NOT-BUILT 1 (**mass email** — audience only). Notes **bulk upload
  deferred**, and lists the built **15-question screening feature** flagged **"confirm core vs secondary"** (not
  one of the six). Every claim cites code + names the gap.
- **`docs/PRD.md` §1** + **`docs/ARCHITECTURE.md` §1** — added a "Canonical objective" pointer so there is
  **one** objective statement (both defer to `CLAUDE.md`/`OBJECTIVE.md` instead of restating it).

## Not changed (out of scope for this docs-only pass)
- **Code & infra:** `web/`, `services/` (the Python backend being retired), `packages/`, `infra/`, `db/` —
  untouched. No migrations run, no Supabase connection made.
- **`EXTRACTION_REPORT.md`** — the code inventory produced earlier; left as-is and now referenced by the docs as
  the port-from source of truth.
- **`SETUP.md`** — left as the legacy Python/pnpm+uv workspace guide (flagged in `README.md` as being revised for
  the TS rebuild); not in the rewrite scope.

## Consistency checks run
- No lingering current-tense EEOC/AWS/Neon/Temporal/WorkOS/Arq/Terraform/Presidio/crypto/hash-chain references —
  every remaining mention is in an explicit "removed / dropped / retired / superseded / port-from" framing.
- All `docs/DECISIONS.md#dN-…` cross-references resolve to real heading slugs; D2/D4/D7 removed-anchors appear only
  in the DECISIONS index as tombstones.
- All inter-doc `.md` links resolve; all internal/TOC section anchors resolve (validated programmatically — 0
  unresolved).
