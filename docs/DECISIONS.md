# ManFriday — Decision Log

> Companion to [`ARCHITECTURE.md`](ARCHITECTURE.md), [`ROADMAP.md`](ROADMAP.md), [`PRD.md`](PRD.md), and [`PHASE_1_BUILD.md`](PHASE_1_BUILD.md).
>
> **Purpose:** record the product/stack calls that shape the build, with their disposition. The **2026-05-31
> lean-rebuild pivot** (TypeScript + Supabase + Vercel; EEOC/compliance + AWS layer dropped) **ratified** most of
> the previously-open items and **removed** the ones that only existed to defend EEOC-regulated employment-decision
> software. Three decisions in the old log (D2 demographics, D4 jurisdictional floor, D7 adverse-impact client
> protocol) are **removed**; their headings are kept as short tombstones so older cross-references don't dangle.
>
> **Status legend:**
> - 🟢 **RATIFIED** — owner-confirmed (the lean direction locks it).
> - 🟡 **PROPOSED** — recommended default; safe to build on; confirm at leisure.
> - ⚖️ **NEEDS LIGHT COUNSEL** — a basic legal/contract touch (vendor ToS, email/CAN-SPAM); not a courtroom-grade gate.
> - 🗑️ **REMOVED** — no longer applicable under the lean direction.

---

## Index

| ID | Decision | Status |
|---|---|---|
| [D1](#d1-candidate-model--consent) | Candidate model & consent | 🟢 RATIFIED |
| [D2](#d2-removed--demographic-data) | ~~Demographic-data source & sufficiency~~ | 🗑️ REMOVED |
| [D3](#d3-vendor-posture--terms-of-service) | Vendor posture & terms of service | ⚖️ NEEDS LIGHT COUNSEL |
| [D4](#d4-removed--jurisdictional-compliance-floor) | ~~Jurisdictional compliance floor~~ | 🗑️ REMOVED |
| [D5](#d5-data-retention--deletion) | Data retention & deletion | 🟢 RATIFIED |
| [D6](#d6-per-candidate--per-screen-cost-ceiling) | Per-candidate / per-screen cost ceiling | 🟡 PROPOSED |
| [D7](#d7-removed--adverse-impact-client-protocol) | ~~Protocol when a client repeatedly fails 4/5ths~~ | 🗑️ REMOVED |
| [D8](#d8-infrastructure-supabase--vercel) | Infrastructure — Supabase + Vercel | 🟢 RATIFIED |
| [D9](#d9-triage-states--feedback-capture) | Triage states & feedback capture | 🟢 RATIFIED |
| [D10](#d10-placementoutcome-tracking) | Placement / outcome tracking | 🟢 RATIFIED |
| [D11](#d11-initial-vertical--role-mix) | Initial vertical / role mix | 🟢 RATIFIED |
| [D12](#d12-screening-administration--ai-assist-grading) | Screening administration & AI-assist grading | 🟢 RATIFIED |
| [D13](#d13-lightcast-license) | Lightcast license (free download vs paid API) | 🟢 RATIFIED |

---

## D1. Candidate model & consent
**Status:** 🟢 RATIFIED

**Decision:** A candidate is **org-scoped**. Each org stores its **own** copy of a candidate/résumé; **every
recruiter in the org sees all of the org's candidates** (no per-recruiter or per-client visibility scoping).
There is **no cross-org link and no global `candidate_identity` table** — the same person existing in two orgs is
incidental duplication, never a shared record. **Within-org dedupe by normalized email** is fine; cross-org
linkage is not. Outreach consent is a **simple per-candidate flag** (`pending` / `opted_in` / `unsubscribed`)
with a source note — enough for CAN-SPAM, not an immutable consent ledger.

**Rationale:** Strict org isolation via RLS is the whole tenancy model (invariant #1) and makes cross-org consent
questions moot. A simple consent flag covers mass-email hygiene without the weight of a ledger.

**Superseded:** the old "blanket-with-revocation consent, 24-month TTL, `consent_ledger` immutable events,
recruiter-sourced vs candidate-submitted tiers" model, and any cross-org/shared-pool idea (an identity-link build
was reverted).

---

## D2. (Removed) — Demographic data
**Status:** 🗑️ REMOVED

ManFriday is **not** EEOC-regulated employment-decision software, so it collects **no demographic / protected-class
data** at all. The entire voluntary-self-ID / segregated-store / minimum-cell-size apparatus is dropped. (Heading
kept so older links resolve.)

---

## D3. Vendor posture & terms of service
**Status:** ⚖️ NEEDS LIGHT COUNSEL

**Decision (proposed):** Position ManFriday as a **software tool / vendor** used by staffing agencies, governed by
a **standard SaaS Terms of Service + Privacy Policy** (data handling, acceptable use, the agency as the party
responsible for how it screens). Basic GDPR/CCPA hygiene applies (see [D5](#d5-data-retention--deletion)). No
EEOC-liability-allocation framing, no per-client DPA machinery, no "accountable principal" audit fields.

**Counsel touch (light):** review the SaaS ToS + Privacy Policy and the **CAN-SPAM** posture for outreach
(unsubscribe + sender identification). Not a launch-blocking, courtroom-grade gate.

**Superseded:** the "agency-vs-client EEOC liability allocation, vendor-vs-employer's-agent, audit-provable
human-decided, indemnification + who-owns-the-bias-audit" framing.

---

## D4. (Removed) — Jurisdictional compliance floor
**Status:** 🗑️ REMOVED

No EEOC/AEDT jurisdictional floor (NYC LL144, Colorado SB205, Illinois) is in scope — the product is a recruiter
tool, not a regulated decision system. Standard SaaS privacy hygiene ([D5](#d5-data-retention--deletion)) is the
only baseline. (Heading kept so older links resolve.)

---

## D5. Data retention & deletion
**Status:** 🟢 RATIFIED

**Decision:** Pragmatic GDPR/CCPA hygiene. **Soft-delete** (`deleted_at`) for normal removal, and **hard-delete on
request** — purge the candidate row, résumé blobs in Supabase Storage, parsed fields, and any embeddings. No
crypto-shred, no per-tenant key destruction, no "retain de-identified decision metadata under a legal-hold basis."
A simple, documented retention default per org is fine; honor deletion requests promptly.

**Rationale:** Candidate data is PII and deserves clean delete semantics, but there is no fairness-audit
denominator to preserve, so the heavyweight crypto-shred + de-identified-retention reconciliation is unnecessary.

**Superseded:** crypto-shred / per-record key destruction, de-identified decision-metadata retention, EEOC/OFCCP
statute-of-limitations holds, BIPA/state variants.

---

## D6. Per-candidate / per-screen cost ceiling
**Status:** 🟡 PROPOSED

**Decision (proposed):** Keep LLM spend modest — deterministic parsing and the lexical matcher are free; LLM calls
are reserved for **authenticity analysis** (optional), **screening-question generation**, and (Phase 2) **semantic
matching/embeddings**. Provisional target **≤ ~$0.20 per fully-screened candidate**, with a per-org monthly budget
+ alerts once volume is known. Use a cheap/fast model for bulk work, a stronger model only for question generation.

**Rationale:** A provisional number unblocks the build; replace with the real unit-economics target at volume.

---

## D7. (Removed) — Adverse-impact client protocol
**Status:** 🗑️ REMOVED

There is no adverse-impact / 4-5ths monitoring, so there is no "what to do when a client repeatedly fails 4/5ths"
protocol. (Heading kept so older links resolve.)

---

## D8. Infrastructure: Supabase + Vercel
**Status:** 🟢 RATIFIED

**Decision:** **Supabase** (Postgres 16 + pgvector + Storage + Auth) for data/storage/auth, **Vercel** for the
Next.js app and the TypeScript backend (Route Handlers / Server Actions). **Org isolation = Postgres RLS keyed on
the `org_id` claim in the Supabase Auth JWT.** Background work uses a TS-friendly pattern (Supabase scheduled
functions / a queue such as Inngest, Trigger.dev, or QStash / Vercel cron) — exact pick is a rebuild decision.

**Removed:** AWS (Fargate / KMS / S3 / VPC), Neon, Temporal, WorkOS, Redis/Arq, Terraform, the non-`BYPASSRLS`
`manfriday_app` role + `SET LOCAL` GUC pattern (Supabase Auth + RLS-on-JWT-claim replaces it), and the
"no real PII until DPA/VPC/envelope-encryption" gate.

**Rationale:** Supabase gives Postgres + pgvector + Storage + Auth + RLS in one managed product that a TypeScript
app talks to directly — the lean stack the pivot is built around.

---

## D9. Triage states & feedback capture
**Status:** 🟢 RATIFIED

**Decision:** Keep triage **lightweight and recruiter-set**: the existing `candidate.status`
(`new → contacted → screening → submitted`) plus `proposal.outcome` (`proposed / interviewing / rejected / hired`),
set by a human, recorded in the audit log. Client feedback is a **simple structured + free-text form** captured
against a proposal/screen. **Dropped:** adverse-action notices, a formal reason-code taxonomy, a canonical
GREEN/AMBER/RED state machine, and score-calibration / threshold governance.

**Rationale:** A simple, human-set status + a feedback form is enough to run the loop and to **capture outcomes for
learning** (invariant #3). The heavyweight triage governance was an EEOC artifact.

---

## D10. Placement/outcome tracking
**Status:** 🟢 RATIFIED

**Decision:** Track proposal/placement outcomes (`proposed / interviewing / rejected / hired`, plus a reason)
**from Phase 1**, populated manually by recruiters. AMBER/GREEN auto-submit machinery is not relevant; submitting a
candidate to a client is a recruiter action.

**Rationale (reframed):** Capturing outcomes early is cheap and is the **ground-truth signal the ranking learns
from** over time (invariant #3) — not, as previously framed, an adverse-impact denominator. ATS write-back is an
optional later integration (Phase 3).

---

## D11. Initial vertical / role mix
**Status:** 🟢 RATIFIED

**Decision:** Launch focused on **software / technical staffing**, where the skill lexicon / Lightcast Open Skills
depth and the screening-question generation are strongest. Architecture stays general enough to broaden later.

---

## D12. Screening administration & AI-assist grading
**Status:** 🟢 RATIFIED

**Decision:** Screening is **recruiter-administered** via the generated **15 questions (5 simple / 5 medium / 5
hard)** with model answer keys. The recruiter **grades manually** against the keys; **AI-assist is optional** (it
can surface the key and a suggested score the recruiter accepts or overrides). The UI must not pre-select the AI
suggestion. **Dropped:** automation-bias gating / recruiter-agreement calibration as a launch gate (the
human-decides invariant covers it).

---

## D13. Lightcast license
**Status:** 🟢 RATIFIED

**Decision:** Use the **free Lightcast Open Skills open-data download**, self-hosted in Postgres, **seeded
initially by the existing ~49-skill lexicon**. Move to the paid API/license only if refresh cadence or coverage
becomes a real constraint at volume.

---

## Reconciled stack notes (for traceability)

Resolved by the lean pivot; listed so they aren't re-litigated:

- **Auth:** **Supabase Auth** (org + recruiter accounts). WorkOS/Clerk **dropped**; no separate candidate IdP.
- **Isolation:** Postgres **RLS keyed on the `org_id` JWT claim** (Supabase Auth). The old non-`BYPASSRLS` role +
  `SET LOCAL` GUC pattern is **dropped**.
- **Background engine:** a TS-friendly pattern (Supabase scheduled functions / Inngest / Trigger.dev / QStash /
  Vercel cron). Arq/Redis and Temporal **dropped**.
- **Audit:** a **plain append-only** log of key actions (invariant #4). Hash-chaining **dropped**.
- **No demographics, no BISG, no adverse-impact / 4-5ths, no redaction-before-egress, no envelope
  encryption/crypto-shred** anywhere.
- **Matching:** transparent lexical skill overlap (`0.8·core + 0.2·nice`) today; embeddings/hybrid via pgvector is
  the Phase-2 accuracy upgrade.
