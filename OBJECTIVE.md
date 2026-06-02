# ManFriday — Core Objective & Coverage Scorecard

> The **one canonical objective** + a **living, honest scorecard** of what's actually built. Mirrors the Core
> Objective in [`CLAUDE.md`](CLAUDE.md#core-objective--tenancy-north-star); [`docs/PRD.md`](docs/PRD.md) and
> [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) point here. Update this whenever a capability changes state.
> Last verified against code: 2026-06-01 (branch `docs-ts-pivot`).

## The objective — a recruiter in an org can:

1. **Store** all the org's candidate résumés (org-isolated), and **browse / filter** by **skills, years of
   experience, location, and vertical**.
2. Have the AI **screen a job posting into CORE (must-have) vs NICE-to-have skills**.
3. **Adjust** those skills — reorder / reprioritize, reweight, and **add** new core/nice skills learned off-platform.
4. **Map + rank** the org's résumés against a JD by **core / nice coverage**.
5. Have the AI **flag likely fakeness / inflation** in résumés (**advisory** — never auto-rejects).
6. **Mass-email** candidates for a given job posting.

**Tenancy (implemented):** one org per user; many users per org; every user sees ALL the org's résumés; the same
résumé may exist independently in multiple orgs; an org's data is never visible to another org (RLS on the
`org_id` JWT claim, proven by `packages/db/scripts/isolation-test.ts` — 0 leaks on live Supabase); no global
candidate identity.

## Coverage scorecard

Legend: **DONE** = built + works end-to-end · **PARTIAL** = some sub-parts work, named gaps remain · **NOT-BUILT**.

| # | Capability | Status | What works (code) | Gap |
|---|---|---|---|---|
| 1 | Store + browse/filter résumés (org-isolated) | **PARTIAL** | **Store DONE**: upload → Supabase Storage (org-prefixed) → immutable, versioned `resume` + parsed `parsed_jsonb`, RLS-scoped (`web/lib/server/ingest.ts`, `web/app/api/v1/candidates/[id]/resumes/route.ts`, migrations `0001`/`0003`). **Browse DONE**: `/candidates` lists the org's candidates (`listCandidates`, RLS). | **Filter NOT-BUILT** (see 1a–1d). **Bulk upload DEFERRED** (`POST /candidates/bulk` route exists; UI inert; ships with the import-queue feature). |
| 1a | …filter by **skills** | **NOT-BUILT** | Parsed `skills[]` exist on each candidate. | `/candidates` search box + "Filters" button are inert (no handler); no skill filter query. |
| 1b | …filter by **years of experience** | **NOT-BUILT** | `total_experience_years` is parsed into `resume.parsed_jsonb`. | Not surfaced on the list shape (`Candidate` has no experience field); no filter. |
| 1c | …filter by **location** | **NOT-BUILT** | — | Location is **not modeled** (no `candidate.location` column; the api adapter returns `""`). Needs a field first. |
| 1d | …filter by **vertical** | **NOT-BUILT** | — | **No `vertical` field exists anywhere** (schema or types). Needs a schema field, then filter UI. |
| 2 | AI screens JD → **CORE vs NICE** | **PARTIAL (deterministic)** | `extract-skills` runs the 49-skill lexicon (`findSkills`) over the JD and suggests skills; persisted as the rubric; auto-run on requisition create (`web/lib/domain/skills.ts`, `match.ts::suggestJdSkills`, `web/app/api/v1/requisitions/[id]/extract-skills/route.ts`, `web/app/requisitions/actions.ts`). | **No real must-have-vs-nice inference**: every found skill is suggested as `core@1.0`; the recruiter re-tiers manually. No model-driven CORE/NICE, no weight inference. "Make robust" (LLM/section-cue inference) is **planned**. |
| 3 | Adjust skills (reorder / reweight / **add**) | **PARTIAL** | **Reorder + reweight + CORE/nice toggle DONE**: `SkillsEditor` client component (drag reorder, weight inputs, tier toggle, Save) → `saveSkillsAction` → `PUT /requisitions/[id]/skills` (`web/app/requisitions/[id]/skills-editor.tsx`, `actions.ts`, `route.ts`). | **Add a new skill: NOT-BUILT in the UI.** The editor only edits existing rows — no "add skill" input. The `PUT …/skills` route **does** accept arbitrary new skills (delete-all + insert the provided list), so the capability is reachable at the API but not exposed in the UI. |
| 4 | Map + rank résumés vs JD by core/nice coverage | **DONE** | Transparent `fit = 0.8·core_coverage + 0.2·nice_coverage` matcher + ranked Top matches with the per-skill breakdown (`web/lib/domain/match.ts::scoreCandidate`, `web/app/api/v1/requisitions/[id]/matches/route.ts`, `getTopMatches`, `/requisitions/[id]`). Re-ranks when the rubric changes (proven: fit 100→50). | Lexical exact-match only; semantic/embeddings matching is a later **accuracy upgrade** (not required by the objective). |
| 5 | AI flags fakeness / inflation (advisory) | **DONE (advisory)** | At upload: deterministic checks (implausible skill-breadth, overlapping timeline, duplicate résumé) + optional Gemini pass, surfaced as advisory flags, never auto-reject (`web/lib/domain/authenticity.ts`, `web/lib/ai/authenticity.ts`, `ingest.ts`; shown on `/candidates/[id]` + match rows). | LLM pass is opt-in (`AI_AUTHENTICITY=1`); deterministic flags always run. |
| 6 | Mass-email candidates for a job posting | **DONE (send)** | Compose a campaign for a requisition → enqueue one `campaign_send` per **opted-in** candidate (pending/unsubscribed suppressed) → **resumable** batch send through a pluggable `EmailProvider` (Resend SDK; a dry-run stand-in runs without a key so the flow is exercisable) → per-recipient `sent`/`failed` → `listCampaigns` lists them with recipient counts. **CAN-SPAM**: physical address + a working **one-click unsubscribe** (public route, HMAC-signed token → flips `consent_state`, drops from audience + future sends) + `List-Unsubscribe` header. Per-recipient first-name merge. RLS-isolated + audited (`campaign`/`campaign_send`, migration `0005`; `web/lib/email/*`, `web/app/api/v1/campaigns/*`, `…/unsubscribe/route.ts`, `web/app/outreach/{page,actions}.tsx`). Proven end-to-end on **live Supabase** (`web/scripts/mass-email-proof.mts`): compose→enqueue(consent-only)→send→list→unsubscribe→org-isolated, all PASS. | **Open/reply metrics** (`getOutreachStats`) + the **template library** (`getEmailTemplates`) are deferred (need Resend delivery webhooks) and still throw a clear "later step". **Real delivery** is owner-gated: add `RESEND_API_KEY` + verify a sending domain (SPF/DKIM); until then sends use the dry-run provider. |

**Tally:** DONE 3 (#4, #5, #6) · PARTIAL 3 (#1, #2, #3) · NOT-BUILT 0.

### Build note — mass email v1 (Capability #6, 2026-06-01)

- **Provider seam.** Every send goes through one `EmailProvider` interface (`web/lib/email/provider.ts`,
  `sendBatch(messages)`); Resend is the v1 implementation, **SES (or any other) is a later drop-in** with no
  caller changes. With `RESEND_API_KEY` set it uses the real Resend batch API (chunked to its 100/call limit);
  with no key a **dry-run provider** logs and returns synthetic ids so the full queue → send → `sent` flow is
  exercisable in dev/CI (the proof ran in this mode). Secrets live only in gitignored `web/.env.local`
  (`RESEND_API_KEY`, `UNSUBSCRIBE_SECRET`, `EMAIL_FROM`) — never committed.
- **Send approach (resumable, non-blocking).** Creating a campaign **enqueues** one `campaign_send` row per
  consent-eligible candidate (`queued`); a separate `POST /api/v1/campaigns/{id}/process` sends **one batch
  (≤100) per call** and marks each row `sent`/`failed`. Because it only ever picks `queued` rows it is resumable
  and idempotent: the compose action drains small audiences inline (loop, ≤~2000), and a **cron** hitting the
  same `/process` route drains larger ones — no single giant synchronous loop. Network happens **outside** the
  DB transaction so a slow provider never holds a row lock. Consent is re-checked at send time, so anyone who
  unsubscribes after enqueue is suppressed, never emailed.
- **⚖️ Owner setup step — domain verification (required before real candidate sends).** `onboarding@resend.dev`
  only delivers to Resend's own test recipients. To email real candidates the **owner must verify a sending
  domain in Resend (SPF + DKIM DNS records)** and set `EMAIL_FROM` to an address on it. This is a DNS/console
  task, not code — it does not block the build, but **no real mail should be sent until it's done** (and until
  counsel signs off on contacting real candidate PII, per ⚖️ D2/D3).
- **Deferred (left throwing, by design):** `getOutreachStats` (open/reply/bounce metrics — needs Resend
  delivery webhooks) and `getEmailTemplates` (saved-template library).

## Built, but NOT one of the 6 — confirm core vs secondary

- **Screening questions (15 = 5 SIMPLE / 5 MEDIUM / 5 HARD + model answer keys), Gemini-generated** with a
  deterministic fallback, cached per candidate×req (`getMatchDetail`, `/screening`, `web/lib/ai/questions.ts`,
  `web/lib/domain/questions.ts`, `web/app/api/v1/screening/route.ts`, `screen_question_set` table). Built +
  proven. **⚠ FLAG:** this is **not** in the six-capability Core Objective — **confirm whether it is a core
  objective or a secondary/premium feature** before investing further.
- **Lightweight triage** — recruiter-set `candidate.status` + `proposal` outcomes (create-proposal wired). Supports
  the loop but is not itself one of the six; treat as supporting.

## Working convention

Every plan / design / build / test step is checked against the six capabilities above. Work that maps to **none**
of them is flagged as **scope creep first** and confirmed before building. This scorecard is the source of truth
for "is it built?"; keep it honest and current.
