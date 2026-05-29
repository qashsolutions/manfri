# ManFriday — Phase 0 Build Spec (Foundations & Compliance Skeleton)

> Companion to [`ARCHITECTURE.md`](ARCHITECTURE.md), [`ROADMAP.md`](ROADMAP.md) (Phase 0 summary), [`PRD.md`](PRD.md), and [`DECISIONS.md`](DECISIONS.md).
> **This is the buildable spec for Phase 0** — the no-shortcuts base that makes every later feature inherit isolation, reproducibility, and auditability for free. **No employment-decision logic ships here.**
>
> SQL/code below is **illustrative sketch**, not final migrations — enough to build from, to be turned into real Alembic migrations / code during implementation.
>
> **Build status (2026-05-28): BUILT.** All 14 work packages are implemented on branch `phase-0-foundations` (47 tests green; mypy strict + ruff); the sketches below became real Alembic migrations `0001`–`0005` + code. All four exit-criteria gates ([§16](#16-success-metrics--exit-criteria)) are met locally (p95 RLS query ≈0.1ms — `db/bench_rls_p95.py`); see [`CLAUDE.md` §15](../CLAUDE.md). Local dev uses Postgres / Redis / filesystem / local-KEK stand-ins behind swappable interfaces; cloud (Neon / Vercel / AWS / KMS) and CI execution are gated on credentials + a Git remote.

---

## Table of Contents
1. [Goal & Definition of Done](#1-goal--definition-of-done)
2. [Scope (in / out)](#2-scope-in--out)
3. [Repository Structure](#3-repository-structure)
4. [Data Model — the Tenancy & Provenance Spine](#4-data-model--the-tenancy--provenance-spine)
5. [Row-Level Security Strategy](#5-row-level-security-strategy)
6. [Run-Provenance Enforcement](#6-run-provenance-enforcement)
7. [Append-Only Hash-Chained Audit](#7-append-only-hash-chained-audit)
8. [Multi-Model Router Contract](#8-multi-model-router-contract)
9. [PII Redaction Stage](#9-pii-redaction-stage)
10. [Auth, Session & JWT](#10-auth-session--jwt)
11. [Background Jobs](#11-background-jobs)
12. [API Contract](#12-api-contract)
13. [Infrastructure](#13-infrastructure)
14. [The Cross-Tenant Leak Probe (the spike)](#14-the-cross-tenant-leak-probe-the-spike)
15. [CI Gates & Compliance Gates](#15-ci-gates--compliance-gates)
16. [Success Metrics / Exit Criteria](#16-success-metrics--exit-criteria)
17. [Sequenced Work Packages](#17-sequenced-work-packages)

---

## 1. Goal & Definition of Done

**Goal:** Stand up the multi-tenant data spine, the provenance/audit machinery, and the model-router seam so that *every* later feature inherits isolation, reproducibility, and auditability for free.

**Done when:** a recruiter can log in (in-house auth only), upload a resume into an isolated tenant, and see it **stored immutably and audited** — and the four exit-criteria gates ([§16](#16-success-metrics--exit-criteria)) are green in CI. **No scoring, no extraction, no triage yet.**

## 2. Scope (in / out)

**In scope:**
- PostgreSQL 16 + pgvector on Neon; shared-schema multi-tenancy with **RLS** keyed on `org_id`; non-`BYPASSRLS` app role; `SET LOCAL` GUCs.
- The **provenance spine**: `parse_run / scoring_run / generation_run`; tall `score` table (table exists, unused until P1); immutable versioned `resume`; version-pinned weight-set support.
- **Append-only, hash-chained `audit_event`** (INSERT-only grants, `prev_hash` chain).
- **Thin in-house multi-model router** (`generate(task, input, schema, policy)`), LiteLLM underneath; versioned prompts in git; structured-output enforcement + self-repair; content-hash response cache.
- **Presidio-based PII redaction/tokenization** stage between app and router; **sandboxed, egress-denied** file-parsing workers.
- Cross-language contract: **REST + OpenAPI 3.1**, CI drift gate. Next.js BFF with HttpOnly encrypted session minting 5-min EdDSA internal JWTs. **Arq + Redis** for background jobs.
- Infra: ECS Fargate (Python/workers, one VPC); Next.js on Vercel; KMS; Sentry; self-hosted Langfuse; feature flags.
- **PII isolation:** encrypted `candidate.pii_jsonb`, per-tenant envelope encryption (DEK ⊂ KMS KEK) enabling crypto-shred.
- **Reserved** (schema only, no UI/read-path): segregated demographics service boundary ([D2](DECISIONS.md#d2-demographic-data-source--sufficiency)); `consent_ledger`.

**Out of scope (Phase 1+):** JD extraction, resume parsing *logic*, fitment scoring, question generation, triage, skill-taxonomy ingestion, WorkOS SSO, adverse-impact monitoring, agents, RAG retrieval logic.

## 3. Repository Structure

Proposed monorepo (pnpm + uv workspaces; adjust at implementation):

```
manfriday/
├── CLAUDE.md, docs/
├── web/                      # Next.js 15 BFF + recruiter UI (TS strict)
│   ├── app/                  # App Router; Server Actions = narrow mutation surface
│   ├── lib/auth/             # iron-session/Auth.js session; internal-JWT minting (EdDSA)
│   └── lib/api/              # generated OpenAPI client (openapi-typescript)
├── services/
│   ├── api/                  # FastAPI: tenancy, ingestion, audit, router-facing endpoints
│   │   ├── app/db/           # SQLAlchemy models + Alembic migrations + RLS policies
│   │   ├── app/router/       # multi-model router (generate(), provider policy, cache)
│   │   ├── app/redaction/    # Presidio pipeline (tokenize, offset-preserving)
│   │   ├── app/audit/        # hash-chain writer + verifier
│   │   └── app/provenance/   # run-table helpers
│   └── workers/              # Arq workers; sandboxed parsing worker (egress-denied)
├── packages/
│   ├── contracts/            # OpenAPI 3.1 spec (source of truth) + shared types
│   └── prompts/              # versioned prompt templates (git = version pin)
├── infra/                    # Terraform (AWS + Vercel + Neon + observability)
├── db/                       # seed, leak-probe fixtures
└── .github/workflows/        # CI: lint, typecheck, OpenAPI diff, tests, leak probe, container build
```

## 4. Data Model — the Tenancy & Provenance Spine

Every tenant-scoped table carries `org_id uuid NOT NULL` and an RLS policy. Sketch of the load-bearing Phase 0 tables (full column lists in [ARCHITECTURE → The 8–12 Load-Bearing Tables](ARCHITECTURE.md)):

```sql
-- Tenancy root
organization(id uuid pk, type text check (type in ('agency','direct')), name text,
             data_region text, pii_retention_days int default 730, deleted_at timestamptz)

client(id uuid pk, org_id uuid not null, name text, is_self bool default false,
       deleted_at timestamptz)                          -- sub-tenant, NOT an RLS boundary

app_user(id uuid pk, org_id uuid, email citext, status text, ...)   -- in-house auth in P0
role(id uuid pk, key text)                              -- recruiter, agency_admin, auditor, ...
membership(id uuid pk, user_id uuid, org_id uuid, role_id uuid,
           scope jsonb)                                 -- {kind: org|client|req, ids: [...]}

requisition(id uuid pk, org_id uuid not null, client_id uuid, title text,
            jd_raw_text text, jd_parsed_jsonb jsonb, status text,
            parse_run_id uuid, created_by uuid, deleted_at timestamptz)   -- shell in P0

candidate(id uuid pk, org_id uuid not null, external_ref text,
          pii_jsonb bytea,                              -- envelope-encrypted (per-tenant DEK)
          redaction_status text, consent_jsonb jsonb, deleted_at timestamptz)

resume(id uuid pk, org_id uuid not null, candidate_id uuid not null,
       version int not null, content_hash text not null, storage_uri text,
       parsed_jsonb jsonb, parse_run_id uuid,
       is_current bool, superseded_by uuid)             -- IMMUTABLE: new upload = new row

-- Provenance spine (run tables) — pin model + prompt + params + input hash
parse_run(id uuid pk, org_id uuid, model_id text, prompt_version text,
          params_jsonb jsonb, input_hash text, created_at timestamptz)
scoring_run(id uuid pk, org_id uuid, screen_session_id uuid, model_id text,
            prompt_version text, weight_set_jsonb jsonb, input_snapshot_hash text,
            created_at timestamptz)
generation_run(id uuid pk, org_id uuid, model_id text, prompt_version text,
               params_jsonb jsonb, input_hash text, created_at timestamptz)

-- Tall score table (exists in P0, populated in P1) — one row PER PARAMETER
score(id uuid pk, org_id uuid, screen_session_id uuid,
      scoring_run_id uuid NOT NULL REFERENCES scoring_run(id),   -- enforces provenance
      parameter text, value numeric, max numeric,
      rationale_text text, evidence_refs jsonb)

-- Polymorphic embeddings (HNSW per model partition), RLS-filtered
embedding(id uuid pk, org_id uuid not null, owner_type text, owner_id uuid,
          model_id text, dim int, vector vector(1024), created_at timestamptz)

-- Append-only, hash-chained (see §7)
audit_event(id uuid pk, org_id uuid, actor_id uuid, actor_type text, action text,
            entity_type text, entity_id uuid, before_jsonb jsonb, after_jsonb jsonb,
            hash text, prev_hash text, occurred_at timestamptz)

-- Reserved in P0 (no read path from scoring; collection UI in P2)
consent_ledger(id uuid pk, org_id uuid, candidate_id uuid, purpose text,
               source text, policy_version text, occurred_at timestamptz)   -- append-only
-- demographic_* lives in a SEPARATE schema/service with its own role+key (D2)
```

Notes: `pii_jsonb` is application-layer envelope-encrypted (per-tenant DEK wrapped by KMS KEK) → crypto-shred = destroy DEK. `embedding` is **partitioned by `model_id`** with one HNSW index per active-model partition (`m=16, ef_construction=64`); `org_id` stays in the table and is **always filtered in the ANN query** *and* covered by RLS.

## 5. Row-Level Security Strategy

**The leak we cannot afford** is an AI agent or a forgotten `WHERE` surfacing another tenant's rows. Defense: RLS in the database, below the ORM.

```sql
-- App connects as this role; it is NOT a superuser and NOT BYPASSRLS.
CREATE ROLE manfriday_app NOLOGIN;

-- Per tenant-scoped table:
ALTER TABLE candidate ENABLE ROW LEVEL SECURITY;
ALTER TABLE candidate FORCE ROW LEVEL SECURITY;          -- applies even to table owner
CREATE POLICY tenant_isolation ON candidate
  USING       (org_id = current_setting('app.current_org')::uuid)
  WITH CHECK  (org_id = current_setting('app.current_org')::uuid);
```

Per-request setup, inside the transaction, from **verified JWT claims** (never client-supplied):

```sql
SET LOCAL app.current_org  = '<org_id from JWT>';
SET LOCAL app.current_user = '<sub from JWT>';
SET LOCAL app.role         = '<role from JWT>';
```

- `SET LOCAL` (transaction-scoped) so **PgBouncer transaction pooling cannot bleed context** across pooled connections.
- **pgvector KNN inherits the same policy** — semantic "find similar" never crosses tenants. This is verified by the leak probe ([§14](#14-the-cross-tenant-leak-probe-the-spike)).
- RLS is the **structural floor**; app-layer scoping + (later) OpenFGA are additional layers, never the only one.

## 6. Run-Provenance Enforcement

**Invariant:** no AI output is persisted without a `*_run` row. Enforced **by constraint**, not convention:
- `score.scoring_run_id` is `NOT NULL REFERENCES scoring_run(id)` (and analogously `requisition.parse_run_id`, generated artifacts → `generation_run`).
- A single **router code path** is the only thing that writes AI outputs, and it always creates/returns the run id.
- **Test:** attempt a bare `INSERT INTO score(...)` without a `scoring_run_id` → must be **rejected**. This test is a CI gate ([§15](#15-ci-gates--compliance-gates)).
- Reproducibility: a run row pins `model_id + prompt_version + params/weight_set + input_hash`; combined with the response cache ([§8](#8-multi-model-router-contract)) and temperature 0, re-running yields the identical result.

## 7. Append-Only Hash-Chained Audit

`audit_event` is the authoritative decision record in **all** phases.

- **Grants:** `GRANT INSERT, SELECT ON audit_event TO manfriday_app;` then `REVOKE UPDATE, DELETE ON audit_event FROM manfriday_app;` — append-only at the DB level.
- **Hash chain:** on insert, `hash = sha256(prev_hash || canonical_json(payload))` where `prev_hash` is the previous row's hash (per `org_id` chain or global — decide at impl; per-org keeps chains independent). Tamper to any row breaks the chain.
- **Verifier job:** walks the chain and asserts continuity; runs in CI on fixtures and on a schedule in prod.
- WORM/S3-Object-Lock anchoring of the chain head is **deferred to Phase 1**, but the chain starts now.
- Every write/redaction/router call/auth event emits an audit event (actor, action, entity, before/after, occurred_at).

## 8. Multi-Model Router Contract

The single LLM seam. **No service calls a provider directly.**

```
generate(task: str, input: dict, schema: JSONSchema, policy: Policy) -> Result
  Result = { output: <schema-valid dict>, model_id, prompt_version,
             input_hash, trace_id, cost, cached: bool }
```

Pipeline inside `generate`:
1. **Redaction pre-hook** (mandatory — [§9](#9-pii-redaction-stage)). Refuse to proceed if redaction is skipped.
2. **Provider policy** by data sensitivity (C2/C3 → **ZDR/no-training providers only**, per a provider registry with signed DPAs); cost ceiling per task ([D6](DECISIONS.md#d6-per-candidate--per-req-cost-ceiling)); fail-closed on a decision path if no compliant provider.
3. **Prompt** from `packages/prompts/` (git = version pin) → `prompt_version`.
4. **Call** via LiteLLM (SDK normalization only).
5. **Structured-output validation + self-repair** — validate against `schema`; on mismatch, one repair retry; then fail.
6. **Content-hash cache** keyed by `(prompt_version, model_id, content_hash(input))` — identical inputs never re-bill and return the **same** result (fairness + cost).
7. **Stamp** `model_id + prompt_version + input_hash` into the relevant `*_run` row and emit a Langfuse trace tied to `trace_id`.

In Phase 0 the router is exercised by a **trivial task** (e.g., echo/redaction round-trip) to prove the seam, provenance stamping, cache, and Langfuse wiring — not real extraction.

## 9. PII Redaction Stage

Between app and router; **offset-preserving** so later explainability citations resolve.

1. **Detect** with Microsoft Presidio + resume-specific recognizers (email/phone/SSN-shaped/address) + an NER pass.
2. **Tokenize, don't strip** — replace each entity with a stable placeholder (`[CANDIDATE_NAME_1]`, `[COMPANY_3]`) backed by a **per-request reversible map held only in our memory/DB, never sent out** (preserves coreference + lets us rehydrate names into outputs).
3. **Keep task semantics** — titles, skills, dates, tenure, seniority stay (strip identity, not capability).
4. **Always strip, never tokenize-for-send:** SSN, full DOB, photos/headshots, work-auth/visa status, any protected-class signal.
5. **Rehydrate** on return for recruiter display. Embeddings are generated from **redacted** text.

Honest caveat: redaction is imperfect (names in narrative leak) — which is *why* ZDR provider contracts ([§8](#8-multi-model-router-contract)) are mandatory, not optional.

## 10. Auth, Session & JWT

Phase 0 uses **in-house auth only** (WorkOS SSO deferred to P3).

- **BFF session:** Next.js holds an **HttpOnly, Secure, SameSite=Lax**, encrypted session cookie (iron-session/Auth.js, rotating key). The browser never holds a FastAPI token.
- **Internal JWT:** per request the BFF mints a **5-min EdDSA (Ed25519)** JWT with claims `{sub, org_id, active_client_id, roles[], scope, consent_caps, jti, exp}`; FastAPI verifies via **JWKS** (cached, rotated). Revocation (role change/offboard) takes effect within 5 min — no blocklist.
- **Recruiter login (P0):** email + password + **TOTP MFA** (or in-house magic link). **Candidate** magic-link/OTP scaffolding may be stubbed; full candidate flows are P1+.
- **Worker identity:** background jobs carry the originating `org_id/client_id` as **immutable claims in the queue message** — no job runs with ambient all-tenant authority. (SPIFFE/SPIRE deferred to P3.)

## 11. Background Jobs

- **Arq + Redis** (async-native, matches FastAPI/asyncio). Phase 0 jobs: file ingestion → virus scan → store immutable resume → emit audit event.
- **Sandboxed parsing worker:** runs in a **network-egress-denied** sandbox (gVisor/Firecracker or locked-down container); MIME validated by **content not extension**; XXE/macros disabled; file-size capped; ClamAV scan. (Actual parse *logic* is P1; P0 proves the sandbox + immutable storage + audit.)
- Tenant scope propagates into every job message; the leak probe covers the worker path ([§14](#14-the-cross-tenant-leak-probe-the-spike)).

## 12. API Contract

- **Browser ↔ BFF:** tRPC / Server Actions (TS-internal).
- **BFF ↔ FastAPI:** **REST + OpenAPI 3.1**; FastAPI's auto-generated spec is the **single source of truth**; `openapi-typescript` generates the TS client; **CI fails on drift**.
- Every AI-bearing response carries `model_id`, `prompt_version`, `score_version`, `trace_id` at the **schema level** (explainability is a contract requirement, not a log line). In P0 these appear on the router echo endpoint.

## 13. Infrastructure

- **Next.js on Vercel** (preview deploy per PR). **Python/FastAPI + workers on AWS ECS Fargate** in **one VPC** (no Kubernetes).
- **Neon** Postgres 16 + pgvector (branch-per-PR); **no real candidate PII until DPA + US-region + envelope encryption confirmed** ([D8](DECISIONS.md#d8-infrastructure--vpc-posture)) — dev/test uses synthetic data.
- **Redis** (Arq + cache + sessions). **S3** (SSE-KMS, presigned URLs, immutable resume originals). **AWS KMS** (per-tenant DEK ⊂ KEK envelope encryption).
- **Observability:** OpenTelemetry (one `trace_id` browser→BFF→FastAPI→worker→LLM), **Sentry**, **self-hosted Langfuse in-VPC**. **Feature flags** (LaunchDarkly/Unleash) to gate model changes behind shadow-test + bias-audit.
- **IaC: Terraform** (AWS + Vercel + Neon + observability in one graph). **CI/CD: GitHub Actions.**
- **Secrets:** managed secret store (AWS Secrets Manager); LLM keys live only in the router service; CI pulls via OIDC, no static tokens.

## 14. The Cross-Tenant Leak Probe (the spike)

**The Phase 0 de-risking spike — runs in CI, must pass before anything is built on the isolation thesis.** It proves RLS catches a leak even when the app-layer filter is *deliberately wrong*.

Test matrix:
1. **SQL path:** as Org A, insert candidates + embeddings. Switch GUC to Org B. Run `SELECT * FROM candidate` **with the app-layer org filter omitted** → assert **0 Org-A rows**.
2. **pgvector path:** as Org B, run a KNN (`ORDER BY vector <=> $query LIMIT k`) over the shared `embedding` table **without** an explicit `org_id` predicate → assert **0 Org-A rows** (RLS must filter the ANN).
3. **Worker path:** enqueue a job scoped to Org B; have it attempt to read Org A's rows → assert **0 rows**.
4. **Pooling path:** run the above through **PgBouncer transaction pooling** → assert `SET LOCAL` context does not bleed across pooled connections.
5. **Provenance path:** attempt a bare `INSERT INTO score` without `scoring_run_id` → assert **rejected**.

## 15. CI Gates & Compliance Gates

**CI gates (block merge):**
- Cross-tenant leak probe ([§14](#14-the-cross-tenant-leak-probe-the-spike)) → **0 leaks**.
- Bare-insert-without-run-id → **rejected**.
- Audit-chain verifier on fixtures → **unbroken**.
- OpenAPI contract drift → **none** (generated TS matches spec).
- Lint + typecheck (TS strict, Python typed) + unit tests.

**Compliance gates established (built, not yet "passed" at scale):** provenance constraint; hash-chained audit; PII segregation + crypto-shred; redaction-before-egress.

## 16. Success Metrics / Exit Criteria

Phase 0 is complete when (from [ROADMAP → Phase 0](ROADMAP.md)):
1. **Cross-tenant leak probe passes in CI** — 0 leaks across RLS, pgvector, and worker paths.
2. **100% of AI writes carry a run id** — enforced by constraint, verified by the bare-insert rejection test.
3. **p95 DB query < 50ms** with the RLS predicate on.
4. **Audit chain verification** confirms an unbroken hash chain.
5. The walking skeleton works: a recruiter logs in (in-house auth), uploads a resume into an isolated tenant, and sees it **stored immutably and audited**.

**Duration estimate:** 8–10 weeks.

## 17. Sequenced Work Packages

| WP | Work package | Depends on | Exit |
|---|---|---|---|
| **0.1** | Repo scaffold, CI shell, Terraform skeleton, Neon branch, Vercel + Fargate plumbing | — | `hello` deploys; CI runs |
| **0.2** | DB: tenancy tables + RLS policies + non-BYPASSRLS role + `SET LOCAL` plumbing | 0.1 | RLS on all tenant tables |
| **0.3** | **Cross-tenant leak probe** (SQL + pgvector + worker + PgBouncer) | 0.2 | probe green in CI |
| **0.4** | Provenance spine: run tables + tall `score` + NOT-NULL FK + bare-insert rejection test | 0.2 | provenance gate green |
| **0.5** | Append-only hash-chained `audit_event` + writer + verifier + CI fixture | 0.2 | chain verifies |
| **0.6** | Immutable versioned `resume` + S3 (SSE-KMS) + content-hash dedupe | 0.2 | upload stores immutable row |
| **0.7** | PII: envelope encryption (KMS DEK/KEK) for `candidate.pii_jsonb`; crypto-shred path | 0.6 | encrypt/decrypt + shred test |
| **0.8** | Redaction stage (Presidio, tokenize, offset-preserving) + round-trip test | 0.1 | redaction round-trips |
| **0.9** | Multi-model router (`generate`, provider policy, schema+self-repair, content-hash cache, provenance stamp, Langfuse) | 0.4, 0.8 | echo task: provenance + cache + trace |
| **0.10** | Auth: BFF session + 5-min EdDSA JWT + JWKS verify in FastAPI; in-house recruiter login + TOTP | 0.2 | login → scoped JWT → RLS GUCs set |
| **0.11** | Arq + Redis; sandboxed egress-denied ingestion worker; tenant-scoped job messages | 0.6, 0.10 | resume upload runs through worker, audited |
| **0.12** | OpenAPI 3.1 contract + `openapi-typescript` client + CI drift gate | 0.1 | drift gate green |
| **0.13** | Observability: OpenTelemetry trace_id end-to-end + Sentry + feature flags | 0.9, 0.10 | one trace browser→worker→LLM |
| **0.14** | Exit review: all four exit-criteria gates green; walking-skeleton demo | all | Phase 0 sign-off |
