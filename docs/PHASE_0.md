# ManFriday — Foundation & Setup (formerly "Phase 0")

> **Companion to** [`ARCHITECTURE.md`](ARCHITECTURE.md), [`ROADMAP.md`](ROADMAP.md), [`PRD.md`](PRD.md), [`PHASE_1_BUILD.md`](PHASE_1_BUILD.md), [`SUPABASE.md`](SUPABASE.md), [`DECISIONS.md`](DECISIONS.md), and the code-grounded [`EXTRACTION_REPORT.md`](../EXTRACTION_REPORT.md).

---

## ⚠️ The original heavyweight "Phase 0" is RETIRED

This file used to be the buildable spec for **"Phase 0 — Foundations & Compliance Skeleton,"** a 14-work-package, 8–10-week compliance base on AWS. **Under the lean direction that whole skeleton is retired.** It was genuinely built in the Python codebase (`services/api`, `services/workers`) and is inventoried in [`EXTRACTION_REPORT.md`](../EXTRACTION_REPORT.md) — but it is **not** the go-forward foundation, and the Python backend it lives in is being **retired and rebuilt in TypeScript** on Supabase + Vercel.

Retired, in full:

- **RLS via a non-`BYPASSRLS` role + `SET LOCAL app.current_org` GUCs** (replaced by RLS on the Supabase Auth JWT `org_id` claim).
- **Run-provenance tables** (`parse_run` / `scoring_run` / `generation_run`) and the NOT-NULL-FK "no AI write without a run id" gate.
- **Append-only, hash-chained `audit_event`** (`prev_hash` chain + verifier).
- **Presidio PII redaction-before-egress** stage in front of the model router.
- **Per-tenant envelope encryption** (KMS DEK ⊂ KEK) + **crypto-shred** of `candidate.pii_jsonb`.
- **In-house EdDSA (Ed25519) internal-JWT auth** + JWKS + TOTP (replaced by Supabase Auth).
- **Thin multi-model router** (`generate(task, input, schema, policy)` over LiteLLM, content-hash cache, provider policy).
- **Arq + Redis** ingestion/parse worker and the egress-denied sandbox pattern.
- **OpenAPI 3.1 / FastAPI contract + CI drift gate** as a compliance control.
- **Terraform / AWS (ECS Fargate, S3, KMS, VPC) + Neon** infrastructure.

Do not treat any of the above as current. The lean stack and slim invariants are defined in [`CLAUDE.md`](../CLAUDE.md); the live status is in [`STATUS.md`](../STATUS.md).

---

## What the lean foundation actually is

The lean direction has no separate "compliance skeleton" phase. The foundation is just the **setup that Phase 1 (the real loop) needs**, all on managed services:

1. **A Supabase project** — PostgreSQL 16 + **pgvector**, Supabase **Storage** (resume/JD files), and Supabase **Auth** (org + recruiter accounts). One managed service replaces Neon + S3 + KMS + the in-house auth stack.
2. **The schema + RLS policies**, keyed on the **`org_id` claim in the Supabase Auth JWT** — every tenant-scoped table filters on the org from the verified token, no app role / `SET LOCAL` GUC plumbing. RLS governs pgvector queries too.
3. **Org + recruiter accounts via Supabase Auth** — a tenant *is* an org (a staffing agency); many recruiters per org all share that org's data. No cross-org link, no `candidate_identity` table.
4. **The existing Next.js 15 UI** in `web/` (built, stays) behind its `DATA_SOURCE=mock|api` data seam — flip to `api` to read live Supabase data without a rewrite.
5. **Deploy on Vercel** — the Next.js app plus its TypeScript backend (Route Handlers / Server Actions), with a TS-friendly background pattern (Supabase scheduled functions / Inngest / Trigger.dev / QStash / Vercel cron) replacing Arq+Redis.

**Setup steps live in [`SUPABASE.md`](SUPABASE.md); the build plan for the loop on top of it lives in [`PHASE_1_BUILD.md`](PHASE_1_BUILD.md).** The infrastructure decision (Supabase + Vercel) is [`DECISIONS.md#d8-infrastructure-supabase--vercel`](DECISIONS.md#d8-infrastructure-supabase--vercel).

### Slim invariants this foundation preserves

1. **Org isolation** via Postgres RLS on the JWT `org_id` claim — including pgvector.
2. **Human decides** — AI never auto-rejects a candidate.
3. **Capture data now, learn later.**
4. **A plain append-only audit/activity log** (no hash chain).

Pragmatic privacy only: soft-delete plus hard-delete on request (GDPR/CCPA). No EEOC posture — no adverse-impact / 4-5ths monitoring, no demographics store, no BISG.

---

## Old → new mapping

| Old Phase-0 concern | Lean status |
|---|---|
| Multi-tenant `org_id` isolation | **Survives in spirit** — now RLS keyed on the Supabase Auth JWT `org_id` claim (not a non-`BYPASSRLS` role + `SET LOCAL`). |
| Tenancy/data spine (org · client · user · candidate · resume · requisition · jd_skill · proposal) | **Survives in spirit** — the same core product schema, ported to the Supabase/TS rebuild. |
| Append-only audit | **Survives in spirit** — a plain append-only activity log; the `prev_hash` hash chain is dropped. |
| Deterministic résumé/JD parser + skill-overlap matcher + advisory review flags | **Survives in spirit** — the logic (49-skill Lightcast-seeded lexicon, 0.8·core + 0.2·nice overlap, completeness, advisory flags) is ported to TypeScript. |
| Lightcast Open Skills taxonomy | **Survives** — free, self-hosted, seeded by the ~49-skill lexicon. |
| LLM/embeddings | **Survives as optional/additive** — via a provider SDK directly (no router seam); embeddings/hybrid retrieval are a Phase-2 accuracy upgrade. |
| Run-provenance `*_run` tables + NOT-NULL-FK gate | **Dropped.** |
| Presidio redaction-before-egress seam | **Dropped.** |
| Per-tenant envelope encryption / crypto-shred (`tenant_key`) | **Dropped** (rely on Supabase-managed storage + plain delete). |
| Hash-chained `audit_event` | **Dropped** (chain only; plain append-only log survives). |
| Multi-model router (`generate` / LiteLLM / content-hash cache) | **Dropped** — call the LLM provider SDK directly when used. |
| Arq + Redis worker + egress-denied sandbox | **Dropped** — TS-friendly scheduling (Supabase functions / Inngest / Trigger.dev / QStash / Vercel cron). |
| In-house EdDSA internal JWT + JWKS + TOTP | **Dropped** → **Supabase Auth**. |
| OpenAPI 3.1 / FastAPI contract + CI drift gate | **Dropped** — TS end-to-end (Route Handlers / Server Actions), no cross-language contract gate. |
| Terraform + AWS (ECS Fargate · S3 · KMS · VPC) + Neon | **Dropped** → **Supabase + Vercel**. |
| Cross-tenant leak probe (the spike) | **Survives in spirit** — RLS isolation must still be verified, now against Supabase; the AWS/PgBouncer specifics are gone. |

---

## Lean phase map (for reference)

There is **no "Phase 0 compliance skeleton"** in the lean roadmap. Three phases (detail in [`ROADMAP.md`](ROADMAP.md)):

- **Phase 1** — the real recruiter loop live on Supabase + Vercel.
- **Phase 2** — accuracy upgrades (pgvector embeddings / hybrid retrieval via an embedding API, better parsing, feedback-tuned ranking).
- **Phase 3** — learn-over-time.
