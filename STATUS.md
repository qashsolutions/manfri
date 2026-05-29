# ManFriday — Build Status & Execution Plan

> Living dashboard (updated 2026-05-29). Pairs with [`CLAUDE.md`](CLAUDE.md) (invariants/anchor),
> [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md), [`docs/ROADMAP.md`](docs/ROADMAP.md), [`docs/PRD.md`](docs/PRD.md), [`docs/DECISIONS.md`](docs/DECISIONS.md).
> Legend: ✅ done · 🔭 next · ⬜ planned · ⚖️ needs owner/counsel

## The goal (unchanged)
Explainable, human-in-the-loop, **EEOC-defensible** candidate screening — every score / question / triage
reproducible, evidence-backed, audited, human-decided. **The screening intelligence is the moat.**

## Go-to-market: wedge → premium
Staffing agencies already pay **~$23/user/mo** for two commodity features: **mass candidate email** + a
**resume database**. We lead with those — but **compliant + encrypted by default** (riding the Phase-0
spine) — as a **~$10/user wedge tier**, and sell the **explainable AI screening as the premium tier**.
The wedge wins adoption; the intelligence is the differentiator. The wedge is GTM, **not** the goal.

---

## ✅ Phase 0 — Foundations & Compliance Skeleton  (DONE)
Branch `phase-0-foundations` · **PR #1** · **CI green** (js · python · db-gates · container) · **47 tests** · mypy strict + ruff.

**Monorepo (built):**
```
web/               ✅ Next.js 15 BFF — lib/auth (EdDSA JWT + iron-session), lib/api (typed client)
services/api/      ✅ FastAPI — db (RLS models + baseline migration) · router · redaction · audit
                      · provenance · crypto · auth · telemetry · ingestion
services/workers/  ✅ Arq ingestion worker (egress-free; tenant-scoped jobs)
packages/contracts ✅ OpenAPI 3.1 (FastAPI-emitted) → generated TS client (CI drift gate)
packages/prompts   ✅ versioned prompt templates (git = version pin)
infra/             ✅ Terraform skeleton    db/ ✅ leak-probe fixtures + RLS p95 benchmark
.github/workflows/ ✅ CI: js · python · db-gates · container
```

**Work packages — ✅ all 14:**
✅ 0.1 scaffold/CI/IaC · ✅ 0.2 RLS spine · ✅ 0.3 leak probe (SQL/pgvector-KNN/worker/PgBouncer)
✅ 0.4 provenance + tall `score` · ✅ 0.5 append-only audit · ✅ 0.6 immutable resume + object store
✅ 0.7 PII envelope enc + crypto-shred · ✅ 0.8 Presidio redaction · ✅ 0.9 model router (echo)
✅ 0.10 EdDSA auth → RLS + TOTP · ✅ 0.11 Arq+Redis ingestion worker · ✅ 0.12 OpenAPI drift gate
✅ 0.13 OTel/Sentry/flags · ✅ 0.14 exit review

**Invariants live + tested:** ✅ #2 provenance · ✅ #3 RLS isolation · ✅ #4 redaction-before-egress · ✅ #5 append-only audit · ✅ #11 PII-at-rest + crypto-shred
**Exit criteria:** ✅ leak probe · ✅ 100% AI-writes carry a run-id · ✅ p95 RLS ≈0.1 ms · ✅ audit chain verifies · ✅ walking skeleton

---

## 🔭 Phase 1 — Wedge: Compliant Talent CRM  (~$10/user) — NEXT
The paid entry product. Reuses the Phase-0 spine (encrypted resumes, consent ledger, audit, RLS) so the
commodity ships **compliant + encrypted** — the differentiator on the cheap tier.

**UI — real Next.js 15 + shadcn/ui + Tailwind v4, in `web/`:**
- ⬜ Design system + app shell (premium nav, theming, a11y) — shadcn source-in-repo
- ⬜ Resume / candidate database — list · search/filter · detail · immutable versions (on WP 0.6)
- ⬜ Bulk resume import (drag-drop → ingestion worker WP 0.11 → encrypted store + audit)
- ⬜ Requisition intake (capture the JD; CORE/NICE extraction is premium — Phase 2)
- ⬜ Mass candidate outreach — templated email composer · recipient selection · send + track
- ⬜ Recruiter dashboard (pipeline counts, recent activity)

**Backend / compliance:**
- ⬜ Candidate + resume CRUD + search APIs (FastAPI, RLS-scoped, run through the router seam)
- ⬜ Comms service — email send (provider TBD) · **CAN-SPAM** (unsubscribe + sender ID) · bounce/track
- ⬜ Consent capture → activate the `consent_ledger` (WP 0.2 stub)
- ⚖️ Outreach adverse-impact — *who* gets emailed for a req is selection-adjacent → log now, monitor later
- ⬜ Recruiter login UI (email + password + TOTP) wiring the WP 0.10 auth seam
- ⬜ Billing / tier scaffold ($10 wedge vs premium)

**Spike:** email deliverability + the consent/unsubscribe loop.

---

## ⬜ Phase 2 — Explainable Screening  (premium tier)  ·  *[= original ROADMAP Phase 1 / MVP]*
JD → CORE/NICE weighted skills → transparent fitment sub-scores w/ evidence → tiered Q&A + JSON answer
keys → human GREEN/AMBER/RED triage. The differentiator / upsell. (Router WP 0.9, provenance, and
redaction are already built — this is where they get real prompts + scoring logic.)

## ⬜ Phase 3+  ·  *(original ROADMAP Phases 2–6, shifted one)*
Adverse-impact monitoring & bias auditing (the scale gate — now also covers **outreach**) · multi-tenant
scale + SSO/SCIM + ATS · durable agentic continuous assessment & RAG-at-scale · client preference learning
· hardening / isolated-tier / regulatory breadth.

> **Phase mapping:** original ROADMAP Phase 1 → now **Phase 2**; originals 2–6 → 3–7. `ROADMAP.md` /
> `ARCHITECTURE.md` phase numbers get reconciled in a docs pass; **this file is the live execution sequence.**

---

## Infra (firming up — 2026-05-29)
- **Vercel** — Next.js BFF (preview deploy per PR).
- **Supabase** — managed **Postgres 16 + pgvector**. **Our compliance layer runs on top** (non-BYPASSRLS
  role + `SET LOCAL` RLS GUCs, the baseline migration, ObjectStore, KMS-envelope); Supabase **Storage**
  slots behind the existing `ObjectStore` interface; in-house EdDSA-JWT auth retained. Supersedes the
  Neon assumption (D8). Confirm Supabase US region + DPA before real candidate PII.
- Local dev stand-ins (filesystem object store, local-KEK, local Postgres/Redis) swap to cloud by config.

## Open decisions (⚖️ owner / counsel)
- **Wedge packaging** — confirm $10 wedge vs premium feature split + billing model.
- **Mass-outreach compliance** — CAN-SPAM, candidate consent model, outreach adverse-impact policy, email provider (ZDR/DPA for candidate data).
- **Original ⚖️ items** — D2 demographics · D3 agency↔client liability · D5 retention/deletion · D7 super-admin/BYOK (counsel before real PII).
