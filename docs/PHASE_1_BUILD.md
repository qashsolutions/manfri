# Phase 1 Build Plan — Real Data, Upload & Dynamic Screens

> **Status:** plan for review (owner). No code in this doc is built yet. Supersedes the "mock screens"
> stance: **production must be 100% real and dynamic; mock data is allowed only in dev/staging/preview.**
> Pairs with [`STATUS.md`](../STATUS.md), [`CLAUDE.md`](../CLAUDE.md) (invariants), [`WEDGE_UI.md`](WEDGE_UI.md) (the UI/IA), and [`DECISIONS.md`](DECISIONS.md).

## 0. What this delivers

A working, real product: a recruiter (in an org, per-seat) signs in, the org has a **résumé database**,
the recruiter **uploads résumés (single + bulk)** which are parsed into structured fields, uploads a
**job description** that's broken into weighted **core / nice-to-have** skills with a **completeness
score**, gets a **ranked list of best-fit candidates** with advisory **review-area flags**, and can
**bulk-email** the fits. A candidate can belong to **more than one org** (consent-gated). Every screen
reads live data; nothing in prod is static.

## 1. Decisions locked (this session)

| # | Decision | Owner answer |
|---|---|---|
| D-a | Real data is the goal; mock only in lower envs | **Confirmed** |
| D-b | Users can upload + bulk-upload résumés | **Confirmed** |
| D-c | No static screens in prod — all dynamic, all real | **Confirmed** |
| D-d | Résumé parsing approach (v1) | **Deterministic first** (text-extract + rules; LLM later) |
| D-e | Multi-org candidate model | **Strict org isolation** — each org stores its own copy; no cross-org sharing or link (clarified by owner) |
| D-f | Supabase accounts | **Owner is creating them** |
| D-g | Pricing | `$29`/seat placeholder, unconfirmed |

## 2. The hard gate (must clear before real PII lands anywhere)

Real résumés are real PII. The moment we ingest one, Phase-0 invariants stop being theoretical and the
⚖️ counsel items in [`DECISIONS.md`](DECISIONS.md) become **active**. **None of this blocks building against
local Postgres / synthetic files.** It blocks only pointing a real, public, `DATA_SOURCE=api` deployment at
real candidate data.

- **D2 — Demographic data / EEOC defense** (counsel)
- **D3 — Agency↔client liability** (counsel)
- **D5 — Retention vs deletion** (counsel)
- **Supabase region + DPA** confirmed before real PII (D8 supersession already noted in STATUS).

  *(Note: an earlier "shared candidate pool" idea was dropped — the owner clarified the model is strict
  org isolation, where org A and org B may each independently hold the same person's résumé but never see
  each other's data. That removes the cross-org consent question entirely and keeps invariant #3 intact.)*

> Build order is designed so all of this is exercised with **synthetic data in dev** first; the prod
> switch (`DATA_SOURCE=api` + Supabase) is the *last* step and the one that needs the sign-offs.

## 3. What already exists (Phase 0 — reuse, don't rebuild)

From the backend survey:

- **DB spine** (`services/api/app/db/models.py`): `organization, role, client, app_user, membership,
  candidate, embedding, parse_run, scoring_run, generation_run, score, audit_event, resume, tenant_key`
  — all RLS-scoped, Alembic baseline `0001_phase0_baseline.py`.
- **RLS context**: `db/session.py::tenant_transaction(org_id, user_id, role)` sets `SET LOCAL app.current_org/...`;
  `auth/session_scope.py::scoped_transaction(claims)` bridges JWT → RLS. App connects as non-BYPASSRLS `manfriday_app`.
- **Résumé storage**: `storage/base.py` Protocol (`put/get/exists`), `storage/filesystem.py` (local),
  `storage/__init__.py::get_object_store()` (cloud swap seam). `resumes.py::store_resume(...)` =
  immutable, content-hashed, versioned (`is_current`, `superseded_by`).
- **Ingestion**: `ingestion.py::ingest_resume(...)` — size cap, malware stub (EICAR), audited, RLS-scoped.
- **Redaction + router**: `redaction/engine.py` (Presidio), `router/generate.py` (echo backend today).
- **Auth**: EdDSA JWT → RLS, TOTP.
- **Contract**: FastAPI → `app.openapi_export` → `packages/contracts/openapi.json` → `openapi-typescript`
  → `web/lib/api`; **CI drift gate** must stay green.
- **Web seam (this session)**: `web/lib/data` with `DATA_SOURCE=mock|api`; `api.ts` stubbed and ready to wire.
- **Tests**: 47 (RLS isolation, leak probe, provenance, audit, resume, redaction, router, auth, ingestion).

## 4. The schema change — strict org isolation (D-e, owner-clarified)

Owner clarified the model: **each org independently stores its own copy of a candidate.** Org A may source a
person's résumé from one place and org B from another; both store it, and **neither ever sees the other's
data.** There is **no shared pool, no cross-org link, no identity table** — this is exactly Phase-0 invariant
#3, untouched. (An earlier identity-link idea was built and then removed once this was clarified.)

```
candidate            (stays org-scoped + RLS + per-org-encrypted PII; gains per-org fields:)
  + consent_state   'pending'|'opted_in'|'unsubscribed'
  + consent_source, consent_updated_at
  + status          'new'|'contacted'|'screening'|'submitted'   (per-org pipeline state)
  (PII stays in pii_jsonb, encrypted with this org's tenant_key — unchanged)

resume               (unchanged: candidate-linked, immutable/versioned; org-scoped by RLS)

requisition  (NEW, org-scoped + RLS)  id, org_id, client_id?, title, location, employment_type,
             openings, status 'open'|'on_hold'|'filled', jd_text?, jd_storage_uri?, jd_content_hash?,
             jd_version, parse_run_id?, created_at, deleted_at
jd_skill     (NEW, org-scoped + RLS)  id, org_id, requisition_id, name, tier 'core'|'nice',
             weight (0..1), sort_order        -- reorderable / reprioritizable
proposal     (NEW, org-scoped + RLS)  id, org_id, candidate_id, requisition_id, outcome
             'proposed'|'interviewing'|'rejected'|'hired', reason?, decided_by?, decided_at?, created_at
             -- a candidate's history WITHIN this org, across its clients/reqs — never across orgs
consent_ledger (NEW, org-scoped + RLS, append-only)  id, org_id, candidate_id, event, source?, occurred_at
```

**Invariant handling (explicit):**
- Every new table — `candidate` (extended), `requisition`, `jd_skill`, `proposal`, `consent_ledger` — is
  **org-scoped + RLS** (invariant #3 holds, unchanged from Phase 0). No global tables added.
- PII stays in `candidate.pii_jsonb`, **encrypted per-org** (invariants #4/#11 unchanged).
- "Proposal history" is strictly within-org (across that org's clients/reqs). Leak-probe tests
  (`test_product_rls_isolation.py`) assert org B sees none of org A's candidate/requisition/proposal rows
  even when both orgs independently store the same person.

**Migration:** folded into the single **replayable baseline** (`0001`), not a separate `0002`. The baseline
materializes the schema via `Base.metadata.create_all` (live ORM metadata), so a standalone `ALTER`-style
`0002` can't sit on top of it (the baseline already creates the new tables/columns on replay → `ADD COLUMN`
would collide). Instead, the Phase-1 tables/columns appear in the baseline automatically, and the baseline's
RLS list + grants were extended for them (`consent_ledger` append-only like `audit_event`; `candidate_identity`
a global no-RLS lookup like `role`). Switching to frozen autogenerated incremental migrations is a deliberate
future step (needed once there's production data to preserve). Verified: clean `downgrade base`→`upgrade head`
replay; **61 passed / 4 skipped** incl. new shared-pool leak-probe tests proving org B can't read org A's
candidate/requisition/proposal rows even when they share an identity.

## 5. Résumé parsing (D-d — deterministic v1)

A new `services/api/app/parsing/` module, called by the worker:
- **Text extraction:** PDF (`pypdf`) + DOCX (`python-docx`) → plain text. (Scanned-image OCR is out of scope v1;
  such files land in a "needs review" state — matches the import UI.)
- **Field rules:** email/phone (regex), name (heuristic top-of-doc), skills (match against a seed skills
  dictionary), employment dates → total experience, education. Output a typed `ParsedResume` → `resume.parsed_jsonb`.
- **Provenance:** still writes a `parse_run` row (`model_id="deterministic-v1"`, `prompt_version="rules/resume@1"`,
  `input_hash`) so invariant #2 holds even without an LLM.
- **Upgrade path:** an `LLM` parser swaps in behind the same interface later (router + redaction already exist).

## 6. Upload & bulk upload (D-b)

- **Single:** `POST /candidates/{id}/resumes` (multipart) → `ingest_resume()` (exists) → enqueue parse job.
- **Bulk:** `POST /resumes:bulk` (multipart, many files) → one ingest + parse job per file; returns a batch id.
- **Worker:** implement the Arq job in `services/workers` (skeleton today) — `parse_resume(resume_id)` runs in the
  egress-denied worker, calls the parser, writes `parsed_jsonb` + `parse_run`, audits, and (if a new candidate)
  creates `candidate` + `candidate_org`. The import screen's queue states (`queued→parsing→encrypting→done|review`)
  map to real job states.

## 7. FastAPI product endpoints (→ OpenAPI → TS)

Each is RLS-scoped via `scoped_transaction(claims)`; each AI/scoring write goes through a `*_run`. New routers
under `services/api/app/` registered in `main.py`:

| Area | Endpoints |
|---|---|
| Candidates | `GET /candidates` · `GET /candidates/{id}` · `POST /candidates` · `GET /candidates/{id}/detail` (review flags, proposals, orgs) |
| Résumés | `POST /candidates/{id}/resumes` · `POST /resumes:bulk` · `GET /candidates/{id}/resumes` · `GET /imports` (queue) |
| Requisitions | `GET /requisitions` · `GET /requisitions/{id}` · `POST /requisitions` (JD upload → skills + completeness) |
| JD skills | `GET /requisitions/{id}/skills` · `PUT /requisitions/{id}/skills` (reorder/reweight) · `GET /requisitions/{id}/completeness` |
| Matching | `GET /requisitions/{id}/matches` (ranked) · `GET /requisitions/{id}/matches/{candidateId}` (fit detail) |
| Proposals | `GET /candidates/{id}/proposals` · `POST /proposals` (track) |
| Outreach | `GET /campaigns` · `GET /audience` · `POST /campaigns` (compose; send is its own gated step) |
| Settings | `GET /plan` · `GET /team` |
| Dashboard | `GET /stats` |

Matching v1 = deterministic composite (skill coverage from `jd_skill` weights × parsed skills, recency,
experience) — the transparent sub-score model the UI already shows; **advisory review flags are computed and
returned separately, never folded into fit, never auto-reject** (invariants #6/#8). LLM scoring is a later swap.

After endpoints: regenerate `openapi.json` + TS types; **keep the drift gate green**.

## 8. Web: wire the real provider + kill static (D-c)

- Implement `web/lib/data/api.ts` with `openapi-fetch` typed against `@manfriday/contracts`, forwarding the
  recruiter's session (BFF mints the short-lived internal JWT — Phase 0 auth).
- Add `export const dynamic = "force-dynamic"` (and `revalidate = 0`) to every data page so **prod never serves
  static** — satisfies D-c. (Mock mode in dev can stay static for speed; prod is `api` + dynamic.)
- The `DataProvider` contract means **zero page changes** — only `api.ts` + the env flag.

## 9. Supabase (D-f — owner provisioning)

What I need from you once accounts exist: **project URL, DB connection string (pooler), service/anon keys as
appropriate, region.** Then:
- `SupabaseObjectStore` behind the existing `storage/base.py` Protocol (résumé bytes → Supabase Storage).
- `DATABASE_URL` → Supabase Postgres **via the non-BYPASSRLS app role** + `SET LOCAL` GUCs (our RLS layer runs
  *on top* of Supabase, per STATUS). Enable `pgvector`. Run `alembic upgrade head`.
- Config/secrets in `config.py` (no secrets in repo).
- Verify the full prod path: upload → parse → match → render, all dynamic, all real.

## 10. Build sequence (PR-sized steps)

1. **Schema** — ✅ done: org-isolated product tables (requisition/jd_skill/proposal/consent_ledger + candidate consent/status) + RLS folded into the replayable baseline + new leak-probe tests. *(task #2)*
2. **Parser + worker** — deterministic parser + Arq `parse_resume` job + tests. *(task #3)*
3. **Endpoints** — FastAPI product routers + OpenAPI/TS regen, drift gate green. *(task #4)*
4. **Web wiring** — `api.ts` + `force-dynamic`; verify `DATA_SOURCE=api` against local Postgres. *(task #5)*
5. **Supabase** — storage + DB + secrets + prod verification (needs your accounts + counsel sign-offs). *(task #6)*

Steps 1–4 run entirely on **local Postgres with synthetic uploads** — real, dynamic, but no real PII. Step 5 is
the only one that touches production data, and it's gated on §2.

## 11. Open sub-decisions (not blocking the plan; will surface as we build)

- **Candidate global dedupe key** — normalized-email hash assumed; confirm (affects "same person across orgs").
- **Email provider** for real sends (ZDR/DPA for candidate data) — needed before outreach send is real.
- **Skills dictionary source** — seed list now; Lightcast/ESCO taxonomy later (a known buy-vs-build item).
- **Pricing** — `$29` placeholder.
- **"Send" + "triage" writes** — these are irreversible/decision actions; they'll require explicit confirm
  steps and reason codes (invariant #1) when wired.
