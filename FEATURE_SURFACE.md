# FEATURE_SURFACE.md

> Read-only inventory (no code changed). Cross-walks the **TypeScript `web/app/api/v1/*` route
> handlers** ↔ the **`web/lib/data/contract.ts` `DataProvider`** methods (WIRED vs THROWING in
> `web/lib/data/api.ts`) ↔ the **old Python `packages/contracts/openapi.json`** (23 ops). Generated
> 2026-06-01.
>
> Counts: **21** TS `/api/v1` route handlers · **19** DataProvider methods (15 WIRED, 4 THROWING) ·
> **23** Python OpenAPI ops (20 have a TS `/api/v1` equivalent; 1 lives outside `/api/v1`; 2 have none).

## Cross-walk

`DataProvider` column: the contract method that consumes the route (`—` = mutation/advisory route with
no read-provider method; the UI provider is read-only). `Status`: WIRED = real call in `api.ts`;
THROWING = `laterStep(...)`; `n/a` = route exists but isn't surfaced through the provider.

| # | TS route — method + path (`web/app/api/v1`) | DataProvider method | Status | Python op (`openapi.json`) |
|---|---|---|---|---|
| 1 | `GET /api/v1/stats` | `getStats` | **WIRED** | `GET /dashboard/stats` (getDashboardStats) — renamed |
| 2 | `GET /api/v1/candidates` | `listCandidates` | **WIRED** | `GET /candidates` (listCandidates) |
| 3 | `POST /api/v1/candidates` | — (mutation) | n/a | `POST /candidates` (createCandidate) |
| 4 | `GET /api/v1/candidates/[id]` | `getCandidate`, `getCandidateDetail`, `getReviewFlags` | **WIRED** ×3 | `GET /candidates/{candidate_id}` (getCandidate) |
| 5 | `POST /api/v1/candidates/[id]/resumes` | — (mutation) | n/a | `POST /candidates/{candidate_id}/resumes` (uploadResume) |
| 6 | `POST /api/v1/candidates/[id]/consent` | — (mutation) | n/a | `POST /candidates/{candidate_id}/consent` (recordConsent) |
| 7 | `POST /api/v1/candidates/bulk` | — (mutation) | n/a | `POST /candidates/bulk` (bulkUploadResumes) |
| 8 | `GET /api/v1/proposals` | `getProposalHistory` | **WIRED** | `GET /proposals` (listProposals) |
| 9 | `POST /api/v1/proposals` | — (mutation) | n/a | `POST /proposals` (createProposal) |
| 10 | `GET /api/v1/requisitions` | `listRequisitions` | **WIRED** | `GET /requisitions` (listRequisitions) |
| 11 | `POST /api/v1/requisitions` | — (mutation) | n/a | `POST /requisitions` (createRequisition) |
| 12 | `GET /api/v1/requisitions/[id]` | `getRequisition` | **WIRED** | `GET /requisitions/{requisition_id}` (getRequisition) |
| 13 | `GET /api/v1/requisitions/[id]/skills` | `getJdSkills` | **WIRED** | `GET /requisitions/{requisition_id}/skills` (getJdSkills) |
| 14 | `PUT /api/v1/requisitions/[id]/skills` | — (mutation) | n/a | `PUT /requisitions/{requisition_id}/skills` (replaceJdSkills) |
| 15 | `GET /api/v1/requisitions/[id]/completeness` | `getJdCompleteness` | **WIRED** | `GET /requisitions/{requisition_id}/completeness` (getJdCompleteness) |
| 16 | `POST /api/v1/requisitions/[id]/extract-skills` | — (advisory) | n/a | `POST /requisitions/{requisition_id}/extract-skills` (extractJdSkills) |
| 17 | `GET /api/v1/requisitions/[id]/matches` | `getTopMatches` | **WIRED** | `GET /requisitions/{requisition_id}/matches` (getRequisitionMatches) |
| 18 | `GET /api/v1/outreach/audience` | `getAudience` | **WIRED** | `GET /outreach/audience` (getAudience) |
| 19 | `GET /api/v1/plan` | `getPlan` | **WIRED** | `GET /plan` (getPlan) |
| 20 | `GET /api/v1/team` | `listTeamMembers` | **WIRED** | `GET /team` (listTeamMembers) |
| 21 | `GET /api/v1/screening` | `getMatchDetail` | **WIRED** | **NEW — no Python op** (net-new LLM screening / MatchDetail) |
| — | — (no TS route) | `getImportQueue` | **THROWING** | none (was always mock-only) |
| — | — (no TS route) | `listCampaigns` | **THROWING** | none (was always mock-only) |
| — | — (no TS route) | `getEmailTemplates` | **THROWING** | none (was always mock-only) |
| — | — (no TS route) | `getOutreachStats` | **THROWING** | `GET /outreach/stats` (getOutreachStats) — **NOT PORTED** |
| — | `GET /api/health` (non-`/v1`, pre-existing BFF probe) | — | n/a | `GET /health` (getHealth) — equivalent exists outside `/api/v1` |
| — | — (no TS route) | — | — | `GET /whoami` (whoami) — **NOT PORTED** (auth smoke test; superseded by Supabase Auth session + `lib/server/org-context`) |

## Flags — Python ops with no TS `/api/v1` equivalent

- **`GET /whoami`** — no TS route. Was a JWT-claims echo / auth smoke test; intentionally dropped (Supabase
  Auth + `resolveOrgContext` cover identity internally, no public echo endpoint).
- **`GET /outreach/stats`** (send/open/reply metrics) — no TS route; surfaced as `getOutreachStats` which
  **THROWS**. Deferred with email-send/campaigns.
- **`GET /health`** — has a TS equivalent but **outside** `/api/v1`, at `web/app/api/health/route.ts`
  (the pre-existing BFF liveness probe). Not a gap.

All other **20** Python ops have a TS `/api/v1` equivalent (1:1, plus `/dashboard/stats` → `/api/v1/stats`).

## DataProvider methods that THROW (`laterStep`, deferred — never faked)

`getImportQueue` (bulk-import review queue), `listCampaigns`, `getEmailTemplates`, `getOutreachStats`.
The first three were **never** Python ops (always mock-only UI surfaces); `getOutreachStats` maps to the
un-ported `GET /outreach/stats`. All four correspond to deferred features (import queue; email
send/campaigns/templates/metrics).

## TS routes with no `DataProvider` method (write/advisory surface)

`POST /api/v1/candidates`, `.../[id]/resumes`, `.../[id]/consent`, `.../bulk`,
`POST /api/v1/proposals`, `POST /api/v1/requisitions`, `PUT /api/v1/requisitions/[id]/skills`,
`POST /api/v1/requisitions/[id]/extract-skills` — these are mutations/advisory endpoints (the `DataProvider`
is read-only); they're exercised by the proof scripts, not the read seam.
