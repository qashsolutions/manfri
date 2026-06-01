# Phase 1 Build Plan — The Real Loop on TypeScript + Supabase + Vercel

> **Status:** buildable plan for the lean rebuild. The Next.js UI in `web/` is **built and stays**; the
> Python backend (`services/api` FastAPI + `services/workers` Arq) is being **retired** and rebuilt in
> **TypeScript**. This doc describes the **TypeScript target**; the Python code is the *port-from* source.
> Pairs with [`CLAUDE.md`](../CLAUDE.md), [`STATUS.md`](../STATUS.md), [`docs/ARCHITECTURE.md`](ARCHITECTURE.md),
> [`docs/PRD.md`](PRD.md), [`docs/WEDGE_UI.md`](WEDGE_UI.md), [`docs/SUPABASE.md`](SUPABASE.md),
> [`docs/DECISIONS.md`](DECISIONS.md), and the code-grounded [`EXTRACTION_REPORT.md`](../EXTRACTION_REPORT.md).

## 0. What this delivers

The **real recruiter loop, live**, on Supabase + Vercel — no mock data in production:

A recruiter signs in to their org (a staffing agency; many recruiters share the org's data). They build the
org's **résumé database** by **uploading résumés (single + bulk)**, which are **parsed** into structured
fields. **At upload**, each résumé gets **advisory authenticity flags** (deterministic rules + optional LLM)
that surface for a human — they never auto-reject. The recruiter uploads a **job description**, which is
broken into weighted **CORE / NICE** skills with a **completeness score**. They get a **transparent ranked
list** of best-fit candidates (`fit = 0.8·core_coverage + 0.2·nice_coverage`, 0–100), generate **15
screening questions** (5 simple / 5 medium / 5 hard) with answer keys to screen and grade candidates, apply
**lightweight triage** (a candidate status + a proposal outcome — no GREEN/AMBER/RED), **send mass
outreach** (real email, with consent/unsubscribe + a CAN-SPAM footer), and **capture feedback**.

The four slim invariants hold throughout: org isolation via Postgres RLS (incl. pgvector); a human decides
(AI never auto-rejects); capture data now, learn later; a plain append-only audit log. The EEOC/compliance
posture from the old plan is **gone** — compliance here is pragmatic GDPR/CCPA (soft-delete + hard-delete on
request) and CAN-SPAM, nothing more.

## 1. Decisions locked

See [`docs/DECISIONS.md`](DECISIONS.md) for the full rationale on each.

| Area | Decision | Ref |
|---|---|---|
| Backend & host | **TypeScript** backend (Next.js Route Handlers / Server Actions) on **Supabase + Vercel**. No Python, no AWS/Neon, no Temporal/Redis/Arq, no Terraform. | [D8](DECISIONS.md#d8-infrastructure-supabase--vercel) |
| Auth & isolation | **Supabase Auth** for org + recruiter; isolation = **Postgres RLS keyed on the `org_id` claim in the Supabase Auth JWT** (no non-BYPASSRLS role + `SET LOCAL`). | [D8](DECISIONS.md#d8-infrastructure-supabase--vercel) |
| Parsing | **Deterministic v1** (text extract + regex/lexicon rules); optional LLM is additive, later. | — |
| Candidate model | **Org-isolated** candidate; the same person may exist in several orgs with **no cross-org link** (no identity table). A **simple consent flag** (`pending` / `opted_in` / `unsubscribed` + source), **not** a ledger. | [D1](DECISIONS.md#d1-candidate-model--consent) |
| Skills taxonomy | **Lightcast Open Skills** (free download, self-hosted), **seeded** by the ~49-skill lexicon ported from the Python parser. | [D13](DECISIONS.md#d13-lightcast-license) |
| Initial vertical | **Software / technical staffing first.** | [D11](DECISIONS.md#d11-initial-vertical--role-mix) |
| Triage & feedback | Lightweight: `candidate.status` + `proposal.outcome`. No GREEN/AMBER/RED. | [D9](DECISIONS.md#d9-triage-states--feedback-capture) |
| AI-assist grading | Recruiter grades the 15 screening questions; AI-assist is optional. | [D12](DECISIONS.md#d12-screening-administration--ai-assist-grading) |
| Cost ceiling | LLM is optional/additive; per-screen cost ceiling tracked. | [D6](DECISIONS.md#d6-per-candidate--per-screen-cost-ceiling) |

## 2. Schema (the real tables)

One Supabase Postgres database. Every tenant-scoped table carries `org_id` and a **Row-Level Security
policy that reads the `org_id` claim from the Supabase Auth JWT** — conceptually, the policy `USING` /
`WITH CHECK` predicate compares the row's `org_id` to `auth.jwt() -> 'org_id'` (the exact policy SQL lives in
[`docs/SUPABASE.md`](SUPABASE.md); **do not** hand-write migrations from this doc). pgvector queries are
RLS-governed the same way. This **replaces** the retiring Python model's non-BYPASSRLS app role +
transaction-local `SET LOCAL app.current_org` GUC mechanism.

**Tenancy (locked):** tenant = org = staffing agency. Many recruiters per org, **all sharing the org's
data**. The same candidate/résumé may exist in multiple orgs with **no cross-org link** — there is **no
`candidate_identity` table**. Within an org, dedupe by **normalized email**.

Real tables (all tenant-scoped + RLS on `org_id` JWT claim, except where noted):

- **`organization`** — tenant root (the agency). RLS keyed on its own `id`.
- **`app_user`** — a recruiter/user account (backed by Supabase Auth).
- **`membership`** — `(user, org, role)`; how a user belongs to an org.
- **`candidate`** — org-scoped, holds the contact **PII** directly (plain columns; **no envelope-crypto
  blob** — that `tenant_key` layer is dropped). Carries a **simple consent flag** `consent_state`
  (`pending` / `opted_in` / `unsubscribed`) + `consent_source` (not a consent ledger), a pipeline `status`,
  and a `deleted_at` for soft-delete.
- **`resume`** — **immutable, versioned** rows (`version`, `content_hash`, `is_current`, `superseded_by`,
  `storage_uri`) with the deterministic parse output in `parsed_jsonb`.
- **`requisition`** — a job opening (`title`, `location`, `employment_type`, `openings`, `status`,
  `jd_text`, …).
- **`jd_skill`** — a weighted CORE/NICE skill on a req (`name`, `tier` ∈ {`core`,`nice`}, `weight` 0..1,
  `sort_order`). This is the matcher's rubric.
- **`proposal`** — a candidate proposed to a req + its `outcome` (lightweight triage; the within-org
  history).
- **audit log** — a **plain append-only** activity log (org-scoped, INSERT-only). **Dropped:** the
  `prev_hash` hash-chain framing — it's a simple ordered log now.
- **`embedding`** — pgvector rows (RLS on `org_id`). **Present in the schema but unused in Phase 1** —
  embeddings/hybrid search arrive in Phase 2.

**Dropped from the old (Python) schema** — do **not** carry these forward: `parse_run` / `scoring_run` /
`generation_run` / `score` (run-provenance), `tenant_key` (PII envelope crypto / crypto-shred),
`consent_ledger` (replaced by the simple flag), `client` as a separate tenancy concept (the org *is* the
agency), any demographics / protected-class store, and any `candidate_identity` / cross-org link table.

## 3. Port from the retiring Python implementation

These pieces are **already implemented in Python today** (see [`EXTRACTION_REPORT.md`](../EXTRACTION_REPORT.md))
and are deterministic, network-free, and well-understood. **Re-implement each in TypeScript** — the logic
ports almost 1:1.

- **Deterministic résumé parser** (from `services/api/app/parsing/resume.py`, `extract.py`): bytes → text
  (PDF / DOCX / plain), then regexes for **email / phone / URL / years / explicit "N years" / date-ranges**
  with open-ended ranges anchored to the latest year in the doc (so a parse is reproducible). The persisted
  `parsed_jsonb` carries **non-PII signal only** (skills, total experience years, link domains, contact
  presence booleans, text length, parser version).
- **The ~49-skill lexicon** (from `services/api/app/parsing/skills.py`): the canonical→aliases map, matched
  case-insensitively and **edge-bounded on alphanumerics** (so `C++`, `C#`, `Node.js`, `k8s` match without a
  `\b` misfire), with ambiguous bare aliases (`go`, `ml`) deliberately omitted. **This lexicon is the seed
  for the Lightcast Open Skills import** (D13) — keep its precision-biased matching behavior.
- **The transparent matcher** (from `services/api/app/matching/score.py`): `fit = 0.8·core_coverage +
  0.2·nice_coverage`, each coverage = weighted fraction of that tier's skills present, scaled to a 0–100
  integer; return the `matched` / `missing_core` breakdown and the per-skill `present` list. Stable tie-break
  by `(fit desc, candidate_id)`.
- **JD completeness** (from `score.py`): the weighted checks summing to 100 (`title` 15, `location` 10,
  `employment_type` 10, `jd_text` 15 [≥200 chars], `core_skills` 30 [≥3], `nice_skills` 20 [≥1]) → score +
  per-item `present` / `hint`.
- **Advisory review flags** (from `services/api/app/matching/flags.py`): the four deterministic data-quality
  rules — `no_contact`, `no_skills_detected`, `sparse_resume` (`<500` chars), `no_experience_signal` —
  **advisory only, never folded into fit, never auto-reject, never client-facing.**
- **The 23 REST endpoint shapes** (from `packages/contracts/openapi.json` / `services/api/app/api/*`): reuse
  them as the request/response contracts for the new TS Route Handlers so the web client barely changes.
- **The web `DataProvider` contract** (the **20 methods** the UI calls, `web/lib/data/contract.ts`): the new
  TS backend must satisfy exactly this contract.

> **Not a port — these have no real code today** and are **new Phase-1 build** (§4): there is **no real
> LLM/embedding code**, **no 15-question screening generator**, **no authenticity sub-agent set**, and **no
> outreach send** in the Python repo. (The rich `matchDetail` with sub-scores and GREEN/AMBER/RED in
> `web/lib/sample-data.ts` is a static fixture, not a backend.)

## 4. New build (not ports)

- **Supabase Auth + RLS** — org + recruiter sign-in via Supabase Auth; mint/carry the `org_id` claim;
  author the RLS policies that read that claim (incl. on `embedding`).
- **Upload (single + bulk) → parse pipeline** — accept one or many files, store immutable/versioned bytes in
  **Supabase Storage**, enqueue parse work (§5), write `parsed_jsonb` + within-org email dedupe.
- **Authenticity flags at upload** — run the ported deterministic checks (§3) as files land, plus an
  **optional LLM** pass; flags are **advisory** and surface to a human, never auto-reject.
- **JD → skills + completeness** — extract candidate skills from `jd_text` via the lexicon/Lightcast set
  (recruiter re-tiers/re-weights CORE vs NICE), compute the completeness score.
- **Match / rank** — apply the ported transparent matcher and return the ranked list + breakdown.
- **The 15-question screening generator + answer keys** — generate **5 simple / 5 medium / 5 hard**
  questions grounded in the JD + résumé, with answer keys; the **recruiter grades** (AI-assist optional, per
  [D12](DECISIONS.md#d12-screening-administration--ai-assist-grading)). This is a brand-new capability.
- **Lightweight triage writes** — set `candidate.status` and `proposal.outcome`; no GREEN/AMBER/RED state.
- **Outreach SEND** — pick an **email provider** (§8), send mass outreach to the consent-eligible audience,
  honor **unsubscribe**, and append a **CAN-SPAM footer + sender identification** to every message. Record
  sends.
- **Capture feedback** — record outcomes/feedback against proposals so Phase 2/3 can learn from them
  (capture now, model later).

## 5. Background-work pattern

The deterministic parse, bulk-upload fan-out, and outreach sends run **off the request path** using a
**TypeScript-friendly** job mechanism — **Supabase scheduled functions / Inngest / Trigger.dev / QStash /
Vercel cron** (final choice in §8). This **replaces the retiring Arq + Redis worker** (`services/workers`)
entirely. Jobs are idempotent and re-runnable; bulk upload fans out one parse task per file and surfaces job
state to the import UI.

## 6. Web wiring

The existing `web/` UI is **unchanged**. It reads only from `@/lib/data`, which selects a provider via
`DATA_SOURCE`. To go live, **flip `DATA_SOURCE` to the new TypeScript backend** and point its API base at the
Route Handlers. Because both providers implement the same `DataProvider` contract, page changes are minimal —
mock stays the dev default.

**Five UI methods are currently unbacked** (the Python `api.ts` throws "not available in this phase" for
them); **Phase 1 must now back all five**, since screening and outreach become real:

- `getImportQueue` — bulk-upload queue state (now backed by the §5 job states).
- `getMatchDetail` / screening — the 15-question screening view (now backed by the §4 generator).
- `listCampaigns` — outreach campaigns (now backed by real sends).
- `getEmailTemplates` — outreach templates.
- `getOutreachStats` — outreach send/open/reply metrics.

## 7. Build sequence (PR-sized steps)

1. **Supabase project + schema/RLS** — provision the project; create the real tables (§2); author the RLS
   policies reading the `org_id` JWT claim (incl. `embedding`); enable pgvector.
2. **Auth** — Supabase Auth sign-in for org + recruiter; thread the `org_id` claim end-to-end.
3. **Upload + parse** — Supabase Storage for résumé bytes; port the parser + lexicon (§3); single + bulk
   upload → parse via the §5 job pattern; within-org email dedupe.
4. **Authenticity flags** — run the deterministic checks at upload; wire the optional LLM pass.
5. **JD + skills + completeness** — JD upload, CORE/NICE extraction (Lightcast-seeded), recruiter
   re-tier/re-weight, completeness score.
6. **Match** — the transparent ranked-match endpoint + breakdown.
7. **Screening questions** — the 15-question generator (5/5/5) + answer keys + recruiter grading.
8. **Triage** — `candidate.status` + `proposal.outcome` writes; capture feedback.
9. **Outreach send** — email provider, consent/unsubscribe, CAN-SPAM footer + sender ID, recorded sends.
10. **Web wiring** — flip `DATA_SOURCE` to the TS backend; back the five formerly-unbacked methods (§6);
    verify the full loop end-to-end on Supabase + Vercel.

## 8. Open sub-decisions (light)

- **Email provider** — pick one for real sends (e.g. Resend / Postmark / SES-equivalent) that supports
  unsubscribe handling and clean deliverability; needed before outreach send is real.
- **Per-screen cost ceiling** — set the LLM cost ceiling per screen now that screening/LLM is optional but
  additive ([D6](DECISIONS.md#d6-per-candidate--per-screen-cost-ceiling)).
- **Dedupe key** — confirm **normalized email** as the within-org dedupe key (no cross-org dedupe).
- **Background-job mechanism** — confirm the §5 choice (Supabase scheduled functions / Inngest / Trigger.dev
  / QStash / Vercel cron).

## 9. Compliance posture (light)

There is **no hard PII gate, no counsel sign-off (D2/D3/D5), and no EEOC/adverse-impact requirement** in this
plan — that whole posture is removed. Pragmatic only:

- Pick an **email provider** and stand up basic **ToS / privacy** + a compliant **CAN-SPAM** footer.
- Honor **deletes** — soft-delete (`deleted_at`) plus **hard-delete on request** (GDPR/CCPA).
- Outreach respects **consent / unsubscribe** (the simple candidate consent flag).

The data-region / DPA negotiations, demographic-data gates, and agency↔client EEOC-liability questions from
the old plan are **dropped**.
