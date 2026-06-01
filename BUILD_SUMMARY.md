# BUILD_SUMMARY — docs verify + TypeScript foundation on Supabase (2026-06-01)

Branch `docs-ts-pivot`. Working tree left changed for review (not committed/pushed).

This pass (a) verified/patched the rewritten docs and (b) stood up the lean TypeScript
foundation: a Supabase-compatible schema with RLS keyed on the `org_id` JWT claim, a
custom access-token hook, a cross-tenant leak probe, and one real end-to-end slice
(`getStats` + `listCandidates`) returning live, RLS-scoped data through new TS route
handlers. Everything was proven against a **local Postgres 16** using the exact
Supabase RLS mechanism (`request.jwt.claims`), connecting as a **non-superuser role** so
RLS actually applies — without mutating the cloud Supabase project.

---

# ADDENDUM — live Supabase cutover + real Supabase Auth (2026-06-01)

Step 1 proved the path on local Postgres with a simulated claim. This addendum re-proves the **same path on
the live Supabase project** (ref `xaazaldeqrhrwfjcwhyh`, us-east-2) with **real Supabase Auth-issued JWTs** —
the only previously-simulated part. Branch unchanged; nothing committed/pushed.

## 1. Schema cutover to live Supabase ✓
- Reset `public` (dropped the old Python/Alembic tables — synthetic only — and restored `usage` grants to
  `anon`/`authenticated`/`service_role`/`postgres`), then applied `packages/db/migrations/0001+0002` via `psql`
  in one transaction (`search_path = public, extensions`).
- Verified on the live DB: 12 tables (`organization, role, client, app_user, membership, candidate, resume,
  requisition, jd_skill, proposal, audit_event, embedding`); **`relforcerowsecurity = true` on all 11 tenant
  tables**; **11 `tenant_isolation` policies, all with `WITH CHECK`**; `public.custom_access_token_hook` and
  `public.current_org_id` installed; pgvector enabled (the `embedding` table + HNSW index).
- Created the RLS-subject role `manfriday_authenticated` (login, `bypassrls=false`), set a strong password,
  and recorded its pooler connection string in `web/.env.local` (gitignored) as `DATABASE_URL`.

## 2. Real Supabase Auth wired in the web app ✓
- `@supabase/ssr` + `@supabase/supabase-js` added. New: `web/lib/supabase/server.ts` (cookie-bound server
  client), `web/lib/supabase/browser.ts`, `web/lib/supabase/verify.ts` (Bearer-token verification),
  `web/middleware.ts` (session-cookie refresh, no-op without Supabase env), `web/app/login/actions.ts`
  (`signInWithPassword` server action). `web/app/login/page.tsx` rewired from the mock Link to a real form.
- `web/lib/server/org-context.ts` now resolves the org from a **verified Supabase session**: (1) `Authorization:
  Bearer <Supabase JWT>` → verified via Supabase Auth → `org_id` from the token; (2) gated dev override;
  (3) cookie session via `@supabase/ssr`. The dev-header override is now a fallback, not the primary path.
- Seeded 2 synthetic orgs + 1 recruiter each; created 2 **real Supabase Auth users** (Admin API) with
  `app_metadata.org_id`/`org_role`, and linked each to its `app_user` (`auth_user_id`) so the access-token hook
  is ready to drive the claim from membership once enabled.

## 3. Re-proved against live Supabase ✓ (pasted in the final proof block)
- **Isolation** as `manfriday_authenticated` (real RLS-subject role via the pooler): 0 leaks.
- **Real-JWT isolation** (`supabase-auth-proof.ts`): both users sign in via GoTrue; each JWT carries the
  correct `org_id`; **PostgREST** queries under each real token return only that org's candidates, never the
  other's, and a cross-org insert is blocked by RLS `WITH CHECK` (**HTTP 403**).
- **Logged-in slice** (`slice-proof-live.mts`): `getStats` + `/candidates` return live, org-scoped data for a
  logged-in user (real Supabase JWT as Bearer) through the route handlers — ORG A 3 candidates / 1 active req,
  ORG B 2 / 0.

## 4. Deltas — where live Supabase differed from the local simulation
1. **No superuser; `postgres`/`service_role` have `BYPASSRLS`.** Local used a superuser to bypass RLS for
   seeding; on Supabase `postgres` bypasses too (so seeding is simple), but RLS can only be *tested* via a
   non-bypass role — `manfriday_authenticated` or the `authenticated` role through a real JWT. Handled.
2. **Claim source: hook vs `app_metadata`.** The membership-driven **custom access-token hook can't be enabled
   from the DB connection** — it's project config (Supabase dashboard → Auth → Hooks, or the Management API),
   and `app.settings.jwt_secret` is unset so the key/secret can't be derived from the DB. To prove the real-JWT
   path now, I set `org_id`/`org_role` in each user's **`app_metadata`** (Admin API), which GoTrue includes in
   every issued JWT automatically, and made **`current_org_id()` read both** a top-level `org_id` (hook) and
   `app_metadata.org_id`. The hook function is installed and the users' `auth_user_id` are linked, so enabling
   the hook later sources the claim from membership with no code change. **→ remaining action for you: enable
   the Custom Access Token hook in the dashboard (or hand me a Management API token).**
3. **PostgREST passes the full nested JWT** as `request.jwt.claims` (with `app_metadata`), vs the flat
   `{org_id}` the local sim set — covered by the `current_org_id()` change above.
4. **Pooler/TLS specifics.** Connect via the Supavisor **session pooler** (`…pooler.supabase.com:5432`,
   `sslmode=require`) with the `<role>.<project_ref>` username; `postgres.js` connected fine for migrate/seed
   and as `manfriday_authenticated`.
5. **PostgREST schema-cache reload** (`notify pgrst, 'reload schema'`) was needed after the DDL so the REST API
   saw the new tables.
6. **Public-schema reset** required restoring the standard Supabase `usage` grants after `drop schema public`.

## Reproduce (live)
```bash
# 1. cutover (psql) + role password → already done; see web/.env.local DATABASE_URL
# 2. seed orgs (postgres bypasses RLS)
ADMIN=$(... normalize SUPABASE_ADMIN_URL ...); DATABASE_URL_ADMIN="$ADMIN" pnpm --filter @manfriday/db seed
# 3. proofs (load gitignored env)
set -a; . ./web/.env.local; set +a
DATABASE_URL="$(grep ^DATABASE_URL= web/.env.local | cut -d= -f2-)" pnpm --filter @manfriday/db isolation-test
DATABASE_URL_ADMIN="$ADMIN" pnpm --filter @manfriday/db exec tsx scripts/supabase-auth-proof.ts
pnpm --filter @manfriday/web exec tsx scripts/slice-proof-live.mts
```

## Security note
All secrets live only in gitignored files (`web/.env.local`, `services/api/.env.cloud`) — verified ignored,
untracked, never committed; `service_role` is under a non-`NEXT_PUBLIC_` var (server-only). A transient file
that briefly held the connection passwords was deleted. The 2 demo Auth users are synthetic (throwaway project,
synthetic data) with a fixture password.

---

## Step 0 — docs verification (PRESENT / ADDED)

| # | Item | Result | Where |
|---|---|---|---|
| 1 | Fake-résumé detection at upload (bounded advisory sub-agent checks; 10yr/55-skill, timeline, duplicates; optional LLM; never auto-reject; extends `flags.py`; not a fleet) | **PRESENT** | `docs/ARCHITECTURE.md` §12; `docs/PRD.md` C2 (FR-2.1/2.2) |
| 2 | 15 screening questions (5 SIMPLE / 5 MEDIUM / 5 HARD, grounded in résumé ∩ JD, JSON answer keys, recruiter-graded, AI-assist optional) | **PRESENT** | `docs/ARCHITECTURE.md` §13; `docs/PRD.md` C5 (FR-5.1/5.2) |
| 3 | Simple consent/unsubscribe flag on candidate (CAN-SPAM; survived `consent_ledger` removal) | **PRESENT** | `docs/ARCHITECTURE.md` §7 + §14; `docs/PRD.md` FR-7.1–7.3; `docs/DECISIONS.md` D1 |
| 4 | How the TS backend calls LLMs (router removed) — a concrete TS-native approach | **ADDED** | `docs/ARCHITECTURE.md` §17 + §15 stack table now name the **Vercel AI SDK** (`ai` + `@ai-sdk/anthropic`/`@ai-sdk/openai`): `generateObject` for items 1–2, `embed`/`embedMany` for Phase-2 embeddings. Aligned in `CLAUDE.md` (§8/§9) and `docs/ROADMAP.md`. |

`DOC_SYNC_SUMMARY.md` updated with a "Step 0 verification patch" section.

---

## Step 1 — TypeScript foundation on Supabase (what was created)

### New package: `packages/db` (`@manfriday/db`)
The lean TS data layer. Migrations are plain SQL (Supabase-compatible) applied by a TS
runner; queries use the `postgres` driver.

- **`migrations/0001_lean_baseline.sql`** — the lean schema + RLS + auth hook:
  - **Kept tables** (per `EXTRACTION_REPORT.md` column inventory): `organization`, `role`
    (global, no RLS), `client`, `app_user`, `membership`, `candidate`, `resume`
    (immutable/versioned), `requisition`, `jd_skill`, `proposal`, `audit_event`
    (**plain append-only** — hash-chain columns dropped). `embedding` lands in 0002.
  - **Dropped tables**: `tenant_key`, `parse_run`, `scoring_run`, `generation_run`,
    `score`, `consent_ledger`.
  - **Candidate PII** stored as plain columns (`name`, `email`, `phone`) — no envelope
    encryption; protected by RLS + Supabase at-rest encryption. Added a simple
    `consent_state` (`pending`/`opted_in`/`unsubscribed`) + `consent_source`, and a
    `status` pipeline column. `email_normalized` (generated) + a partial unique index
    give **within-org dedupe by normalized email**.
  - **RLS**: `tenant_isolation` policy on every tenant table via a `public.current_org_id()`
    helper that reads `request.jwt.claims ->> 'org_id'` (the Supabase Auth JWT claim;
    `organization` keyed on `id`, the rest on `org_id`), `FORCE`d, `USING` + `WITH CHECK`.
  - **Auth hook**: `public.custom_access_token_hook(event jsonb)` injects `org_id` +
    `org_role` claims from `app_user`/`membership` (looked up by `auth_user_id`), with a
    guarded grant to `supabase_auth_admin`.
  - **Role/grants**: a non-superuser `manfriday_authenticated` login role (the local
    stand-in for Supabase's `authenticated`); least-privilege grants (audit_event is
    SELECT+INSERT only). Grants also apply to `authenticated` when that role exists.
- **`migrations/0002_pgvector_embedding.sql`** — `vector` extension + `embedding` table
  (`vector(1024)`, HNSW cosine index) + RLS. Applied automatically where pgvector is
  available (Supabase + this dev box); skipped otherwise. **Phase-2** use.
- **`src/`** — `client.ts` (`getSql`, `withOrg(ctx, fn)` sets `request.jwt.claims` per
  transaction), `schema.ts` (row/result types), `queries.ts` (`dashboardStats`,
  `listCandidates` — no org filter in the SQL; RLS does the scoping), `index.ts`.
- **`scripts/`** — `migrate.ts` (tracked in `_migration`, pgvector-aware), `seed.ts`
  (two synthetic orgs A/B as owner — bypasses RLS to write both), `isolation-test.ts`
  (the leak probe).

### Auth (1.2)
Supabase Auth is the target; the SQL **custom access-token hook** (above) is what puts
`org_id`/`org_role` into the JWT from `membership`. The app/route layer sets the same
claim into `request.jwt.claims` per request (what Supabase/PostgREST do from the verified
token), so RLS reads it. Wiring the Supabase Auth **UI + session** is the next step
(`web/lib/server/org-context.ts` has the seam + a clearly-gated dev override until then).

### RLS (1.3)
Native Postgres policies on every tenant table, keyed on the JWT `org_id` claim —
replacing the retired `SET LOCAL app.current_org` GUC pattern. Verified below.

### Isolation test (1.4) — the leak probe
`pnpm --filter @manfriday/db isolation-test`, connecting as the RLS-subject role:

```
PASS  org A sees only org-A candidates  — count=3, distinct orgs=1
PASS  org B sees only org-B candidates  — count=2
PASS  org B cannot see org A's rows
PASS  org B targeted read of org A's candidate returns 0
PASS  no org claim ⇒ 0 rows visible
PASS  org B cannot insert a row scoped to org A (WITH CHECK)
ISOLATION TEST: PASS (0 leaks)
```

### One real end-to-end slice (1.5)
- **Route handlers** (web): `GET /api/v1/stats` and `GET /api/v1/candidates` resolve the
  org (`resolveOrgContext`), then `withOrg(...)` → `@manfriday/db` queries → map to the
  UI's `Stats` / `Candidate` shapes. `runtime = "nodejs"`, `dynamic = "force-dynamic"`.
- **`web/lib/data/api.ts`** rewritten: `getStats` + `listCandidates` fetch those handlers
  (forwarding cookies); **every other method throws a clear "not wired yet" error** — none
  faked. (Previously several called the now-retiring FastAPI.)
- **Proof** (`web/scripts/slice-proof.mts` — invokes the real exported `GET` handlers):

```
[ORG A] GET /api/v1/stats → 200 {"candidates":3,"activeReqs":1,"emailsSent30d":0,"responseRate":"—"}
        GET /api/v1/candidates → 200 (3)  Amara Okafor, Devin Park, Lena Vasquez
[ORG B] GET /api/v1/stats → 200 {"candidates":2,"activeReqs":0,"emailsSent30d":0,"responseRate":"—"}
        GET /api/v1/candidates → 200 (2)  Wei Chen, Sofia Marchetti
OK: getStats + listCandidates return LIVE, org-scoped Supabase data through the route handlers.
```

Live DB data, scoped per org by RLS, through the actual route handlers — different rows
and counts for A vs B, no cross-org leakage.

### Supporting changes
- `web/package.json` — added `@manfriday/db` (workspace) + `tsx` (dev).
- `web/next.config.ts` — `transpilePackages` now includes `@manfriday/db`.
- `web/.env.example` — TS-backend vars (`DATABASE_URL`, `APP_BASE_URL`, dev-org override).
- `pnpm-workspace.yaml` — allowlisted `esbuild` (backs `tsx`); pnpm had blocked its build
  script, which broke `pnpm -r`.

### How to reproduce
```bash
pnpm install
createdb -h 127.0.0.1 manfriday_dev
export DATABASE_URL_ADMIN="postgresql://$(whoami)@127.0.0.1:5432/manfriday_dev"
export DATABASE_URL="postgresql://manfriday_authenticated:devpass@127.0.0.1:5432/manfriday_dev"
pnpm --filter @manfriday/db migrate
pnpm --filter @manfriday/db seed
pnpm --filter @manfriday/db isolation-test
ALLOW_DEV_ORG_HEADER=1 pnpm --filter @manfriday/web exec tsx scripts/slice-proof.mts
pnpm -r typecheck
```

---

## Decisions made
- **Proved against local Postgres 16, not the cloud project.** Same Supabase RLS mechanism
  (`request.jwt.claims` + a non-superuser role); reproducible, and leaves the cloud project
  untouched. The migrations + policies run unchanged on Supabase.
- **Migrations as plain SQL + a TS runner** (the brief's "Supabase SQL if you prefer")
  rather than Drizzle codegen — fewer moving parts, RLS/policies/auth-hook are first-class.
- **Direct `postgres` connection setting the JWT claim per transaction** as the backend's
  RLS path. On Supabase you can alternatively use `supabase-js` (PostgREST sets the claim
  from the user JWT); the schema/policies are identical.
- **`client` table kept** (per the Step-1 KEEP list) even though `ARCHITECTURE.md` §7 folds
  it into the flat org/recruiter model — it sits ready, org-scoped, unused by the slice.
- **Dropped columns** vs the Python schema, noted in the migration: `organization.type` /
  `data_region` / `pii_retention_days`; `candidate.redaction_status` / encrypted
  `pii_jsonb` (→ plain `name`/`email`/`phone`); `resume.parse_run_id`;
  `requisition.jd_storage_uri`/`jd_content_hash`/`jd_version`/`parse_run_id`;
  `audit_event.prev_hash`/`hash`.

## Deferred to the next prompt (not built now)
- Porting the rest of the working backend: full CRUD, the deterministic résumé parser +
  ~49-skill lexicon, JD CORE/NICE extraction + completeness, the `0.8·core + 0.2·nice`
  matcher, the outreach audience.
- Net-new features: fake-résumé authenticity flags, the 15 screening questions, email
  send/campaigns, embeddings/pgvector semantic search, the import queue.
- Wiring the Supabase Auth **UI + session** (replacing the dev-org override in
  `org-context.ts`) and provisioning the cloud project (enable the access-token hook,
  apply migrations, point `DATABASE_URL` at Supabase).
- Retiring the Python `services/api` + `services/workers` once the TS path covers them.

## Constraints honored
Edited only `web/`, the new `packages/db`, `pnpm-workspace.yaml` (workspace wiring for the
new package's tooling), and docs. The Python `services/` were **not** touched. Nothing was
committed or pushed; no changes to the cloud Supabase project.

---

# ADDENDUM 2 — ported the working backend to TypeScript + wired the UI (2026-06-01)

Ported the existing, tested logic from `services/api` (Python) to TS route handlers on the proven
Supabase Auth → org_id JWT claim → `current_org_id()` → RLS → handler → `api.ts` path. Every handler goes
through `withOrg`. Net-new features were NOT built (see Deferred). Nothing committed/pushed.

## Ported domain logic (faithful to EXTRACTION_REPORT, in `web/lib/domain/`)
- **`skills.ts`** — the 49-skill lexicon (canonical→aliases) + edge-bounded, case-insensitive `findSkills`
  (`(?<![A-Za-z0-9])…(?![A-Za-z0-9])`), `SKILL_DICTIONARY_VERSION="skills@1"`.
- **`parse.ts`** — the regexes (email/phone/url/year/explicit-years/range), the reproducible experience
  estimate (open-ended ranges anchored to the latest year in the doc), the non-PII `parsed_jsonb` shape, and
  text extraction routed by content-type/filename/magic bytes (PDF via **unpdf**, DOCX via **mammoth**, else
  utf-8; corrupt binary → empty text). `PARSER_MODEL_ID="deterministic-resume-parser@1"`.
- **`match.ts`** — the transparent fit (`0.8·core + 0.2·nice`, case-insensitive exact skill match), JD
  completeness (weighted checks summing to 100), advisory review flags (`no_contact`/`no_skills_detected`/
  `sparse_resume`<500/`no_experience_signal`), and JD skill suggestion (all found → `core@1.0`).
  `MATCHER_VERSION="skill-overlap@1"`.

## Storage (PII files, org-isolated)
- `web/lib/supabase/storage.ts` — service-role upload to a **private** `resumes` bucket under
  `{org_id}/{candidate_id}/{content_hash}`; server-mediated signed URLs.
- `packages/db/migrations/0003_storage_resumes.sql` — bucket + **org-scoped Storage RLS** policies
  (`(storage.foldername(name))[1] = current_org_id()::text`) for select/insert. Applied to live Supabase;
  bucket private, both policies present. (Migrate runner skips it where there's no `storage` schema, e.g. local.)
- `web/lib/server/ingest.ts` — size cap (10 MiB) + EICAR malware stub + sha256 content-hash → Storage upload →
  inline deterministic parse → immutable versioned `resume` row (supersede current, dedupe by content_hash) +
  audit. Ports `ingestion.py`/`resumes.py`/`pipeline.py` minus the dropped `parse_run`.

## Route handlers (web/app/api/v1/*) — all RLS-scoped via withOrg
candidates (GET list + POST create), candidates/{id} (GET rich detail), candidates/{id}/resumes (POST upload),
candidates/bulk (POST), candidates/{id}/consent (POST), proposals (GET + POST), requisitions (GET + POST),
requisitions/{id} (GET), requisitions/{id}/skills (GET + PUT), …/completeness (GET), …/matches (GET),
…/extract-skills (POST), outreach/audience (GET), plan (GET), team (GET).

## Wired in `web/lib/data/api.ts` (DATA_SOURCE=api)
getStats, listCandidates, getCandidate, getCandidateDetail, getReviewFlags, getProposalHistory,
listRequisitions, getRequisition, getJdSkills, getJdCompleteness, getTopMatches, getAudience, getPlan,
listTeamMembers. **Still throwing "later step"** (net-new, deferred): getMatchDetail (`/screening`),
getImportQueue (`/candidates/import`), listCampaigns / getEmailTemplates / getOutreachStats (`/outreach`
campaigns/templates/metrics).

## Proof (pasted in the final block) — live Supabase, logged-in org-A user (real JWT)
Per-page: dashboard `{candidates:3,activeReqs:1}`; /candidates 3 rows; /candidates/[id] full detail + review
flag + proposal history; /requisitions 1 req; /requisitions/[id] skills + completeness=55 + **matches ranked
Amara=100, Lena=42, Devin=0**; /outreach audience `{total:3,optedIn:2,pending:1}`; /settings plan + team.
Upload: created a candidate, uploaded a text résumé → stored in Supabase Storage (org-prefixed, 1 object) →
parsed to skills `[AWS,Docker,Kafka,Kubernetes,PostgreSQL,Python]`, experience_years=10, version 1.

## Behavior deltas from the Python original
- **No `parse_run` provenance** — the parser writes `parsed_jsonb` directly (the `*_run` tables were dropped in
  the lean schema). `parsed_jsonb` carries `parser_version` + `skills_lexicon` for traceability.
- **PII as plain columns** — `candidate.name/email/phone` are plain (RLS + Supabase at-rest encryption),
  vs the Python envelope-encrypted `pii_jsonb`. Candidate detail returns contact directly (no decrypt step).
- **No `consent_ledger`** — consent is the `candidate.consent_state` flag + an audit row (lean D1/D9).
- **Inline parse on upload** (single + bulk) rather than an Arq queue; a queue can replace it for large bulk later.
- **`actor_id` on audit rows is null for now** (the acting user id isn't threaded through yet) — the audit row
  + action are still written.
- Handlers return the **display shapes** directly (the original returned Python schemas that `api.ts` adapted);
  the one exception is `/candidates/{id}`, whose rich response `api.ts` maps to Candidate/CandidateDetail/flags.
- Matching/completeness/flags/parse outputs match the Python (`0.8·core+0.2·nice`, same lexicon, same rules).

## Decisions
- Domain logic lives in `web/lib/domain/` (only web consumes it) rather than a new package — fewer moving parts.
- New read queries run inline in handlers via `withOrg(sql => …)` (still the org-scoped RLS path); the existing
  `dashboardStats`/`listCandidates` stay in `@manfriday/db`.
- `canvas` (optional native dep pulled transitively by the PDF lib) set to `false` in `allowBuilds` — text
  extraction needs no canvas rendering, and it requires system Cairo libs to build.

## Deferred (next prompts — NOT built)
Fake-résumé authenticity flags at upload; the 15 screening questions (5/5/5 + answer keys) = getMatchDetail;
email send/campaigns/templates/metrics; embeddings/pgvector matching; the import queue; signup/invite/org
provisioning. Pages still mock-only/throwing under DATA_SOURCE=api: `/screening`, `/candidates/import`, and the
campaigns/templates/metrics parts of `/outreach`.

## Constraints honored (this addendum)
Edited only `web/`, `packages/db`, and `pnpm-workspace.yaml` (allowlist `esbuild`/`canvas`); Python `services/`
untouched; nothing committed or pushed. Live Supabase changes: applied migration 0003 (Storage bucket + RLS)
and wrote synthetic résumé/candidate rows via the handlers under the seeded org.

---

# ADDENDUM 3 — LLM intelligence layer pt.1: authenticity flags + 15 screening questions (2026-06-01)

Built the first LLM layer on the proven path. **Provider: Google Gemini via the Vercel AI SDK** (chosen for
being cheapest across the SIMPLE/MEDIUM/HARD tiers). Everything degrades gracefully: with no provider key the
deterministic paths run and questions use a skill-grounded fallback. Nothing committed/pushed.

## 0. AI SDK setup
- Deps: `ai@4.3.19`, `@ai-sdk/google@1.2.22`, `zod@3.25.76`. `web/lib/ai/model.ts` — `getModel("fast"|"capable")`
  returns a Gemini model from `GOOGLE_GENERATIVE_AI_API_KEY` (or `GEMINI_API_KEY`); models env-overridable
  (`AI_MODEL_CAPABLE` default `gemini-2.5-flash`, `AI_MODEL_FAST` default `gemini-2.0-flash`); returns **null**
  with no key → callers fall back. All calls use `generateObject` + Zod, `AbortSignal.timeout(AI_TIMEOUT_MS=30s)`,
  try/catch → null/[] on failure.

## 1. Fake-résumé authenticity flags AT UPLOAD (advisory — never auto-reject)
- **Deterministic** (`web/lib/domain/authenticity.ts`, in ingest): `implausible_skill_breadth` (≥20 skills AND
  >4 skills/yr, or experience unknown — the "10 yrs + many skills" case), `overlapping_timeline` (dated roles
  summing to more years than their span), `duplicate_resume` (same content-hash for another candidate in the
  org). The parser now emits non-PII `date_ranges` for the timeline check.
- **Optional LLM** (`web/lib/ai/authenticity.ts`, Gemini fast model, `AI_AUTHENTICITY=1`, off by default):
  ≤5 advisory notes; `[]` when disabled/no-key/error.
- Persisted on `resume.parsed_jsonb.authenticity` at ingest; surfaced via `allAdvisoryFlags` next to the
  data-quality flags. Advisory only — never auto-reject, never folded into fit.

## 2. The 15 screening questions = getMatchDetail (/screening)
- `web/lib/ai/questions.ts` — Gemini `generateObject` + a Zod schema enforcing **exactly 5 SIMPLE + 5 MEDIUM +
  5 HARD**, each `{q, answer}`, grounded in résumé ∩ JD; null on no-key/timeout → fallback.
- `web/lib/domain/questions.ts` — deterministic skill-grounded 5/5/5 fallback + stable `input_hash`.
- Cache: `screen_question_set` table (migration `0004`, RLS, unique `(candidate, requisition)`), keyed by an
  input hash → regenerates when résumé/JD/model changes.
- `GET /api/v1/screening` assembles the full **MatchDetail** (candidate, req, core/nice skills, transparent
  0.8/0.2 subScores, advisory review+authenticity flags, 15 Q+answers); defaults to first open req + top-fit
  candidate; LLM call runs outside the DB tx. `api.ts` `getMatchDetail` wired (throw removed); `/screening`
  threads `searchParams`, shows answer keys in a `<details>`, and the colliding `key={q.tier}` was fixed.
  `ScreeningQuestion` gained an `answer` field (+ mock fixture updated).

## 3. Audit actor threading
`OrgContext` now carries `userId` (the Supabase Auth `sub` from the verified Bearer/cookie session; null on the
dev override); every audit write now sets `audit_event.actor_id` from it (candidate.created, resume.ingested,
candidate.consent, proposal.created, requisition.created, requisition.skills_set).

## Models used
Gemini `gemini-2.5-flash` (questions) / `gemini-2.0-flash` (optional authenticity), env-overridable. No key is
set yet, so the proofs ran the deterministic fallback (questions) + deterministic flags (authenticity). Paste
`GOOGLE_GENERATIVE_AI_API_KEY` into `web/.env.local` to switch questions to Gemini-authored and enable the LLM
authenticity pass — no code change (the input-hash includes the generator, so cached questions regenerate).

## Proof (final block) — live Supabase, logged-in org-A user
- **Authenticity**: planted résumé (~10 yrs, ~49 skills, overlapping 2014-2024/2016-2026) →
  `implausible_skill_breadth` + `overlapping_timeline`; duplicate upload → `duplicate_resume`. All uploads 200,
  candidates exist — advisory, no auto-reject.
- **Screening**: `getMatchDetail` → 200, **15 questions (5/5/5)**, each with an answer key, grounded in
  Python/PostgreSQL, subScores = 0.8/0.2 split. `/screening` consumes exactly this shape (data path proven
  end-to-end via the route handler; typecheck green).

## Decisions / deltas
- **Gemini** (per the user) over the docs' Anthropic/OpenAI examples — same Vercel-AI-SDK seam.
- **Graceful fallback**: questions LLM-authored with a key, else deterministic-template (still 5/5/5 + answer
  keys, grounded) so `/screening` renders live today; authenticity deterministic checks always run, LLM is additive.
- `experienceYears` = max(explicit, ranges) (ported), so the planted résumé needs >40 skills to trip the breadth
  ratio at ~10 yrs — thresholds documented in `authenticity.ts`.
- Domain logic in `web/lib/domain` (LLM-free, testable); LLM wrappers isolated in `web/lib/ai`.

## Deferred (next prompts — NOT built)
Email send/campaigns/templates/metrics; embeddings/pgvector matching; the import queue; signup/invite/org
provisioning. Under DATA_SOURCE=api, `/candidates/import` (getImportQueue) and the campaigns/templates/metrics
parts of `/outreach` remain mock-only/throwing.

## Constraints honored (this addendum)
Edited only `web/`, `packages/db`, and `web/.env.local`/`.env.example` (gitignored secrets); Python `services/`
untouched; nothing committed or pushed. Live Supabase: applied migration `0004` and wrote synthetic
résumé/question rows under the seeded org via the handlers.
