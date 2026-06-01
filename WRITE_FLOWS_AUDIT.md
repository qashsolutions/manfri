# WRITE_FLOWS_AUDIT.md

> Read-only audit (no code changed). Do the 8 write/advisory `/api/v1` routes actually fire from a real UI
> control for a logged-in org user, or only via the API / proof scripts? Branch `docs-ts-pivot`, 2026-06-01.

## Headline

**None of the 8 write flows are reachable through the UI.** Every data page is an **async Server Component**
that only **reads** (top-level `await` of `@/lib/data` functions). Across `web/app` + `web/components` there is
**no `'use client'`, no `action={…}` form binding, no `onClick`/`onSubmit`/`onChange`, no `<input type="file">`,
and no `fetch()`** — the only mutation precedent in the whole app is the login server action
(`web/app/login/actions.ts`). The `DataProvider` contract is **read-only** (no mutation methods), so writes
cannot go through `@/lib/data` at all. The write controls that exist are inert mockup affordances; the rest are
absent. So all 8 routes are exercised only by the API/proof scripts.

`NOT-WIRED` = a control exists but is a no-op (no handler/action/form). `NO-CONTROL` = no UI element triggers it.

| # | Route (method + path) | Page | UI control present? | Status | Mechanism / why |
|---|---|---|---|---|---|
| 1 | `POST /candidates` (create candidate) | `/candidates` | "Add candidate" `<Button size="sm">` (Plus icon) in the toolbar | **NOT-WIRED** | Plain `<Button>` — no `onClick`, no `asChild`/`Link`, not in a `<form>`. Pure no-op. |
| 2 | `POST /candidates/[id]/resumes` (single upload) | `/candidates/[id]` | **None** — header is Email/Match/Edit; "Résumé versions" card has only inert per-version Download `<Button>`s | **NO-CONTROL** | No upload button, no file input, no dropzone on the detail page. |
| 3 | `POST /candidates/bulk` (bulk upload) | `/candidates/import` | Dashed drop-zone (visual) + "Browse files" `<Button size="sm">` | **NOT-WIRED** | No `<input type="file">`, no drag/`onChange` handler, no upload call. Inert. *(Also: the page's read `getImportQueue()` THROWS under `DATA_SOURCE=api`, so the page itself errors in api mode.)* |
| 4 | `POST /candidates/[id]/consent` (record consent) | `/candidates/[id]` | **None** — "Consent & data" card only *displays* state (badges + source + updated) | **NO-CONTROL** | No toggle/button to opt-in/unsubscribe. |
| 5 | `POST /proposals` (create proposal) | `/candidates/[id]`, `/requisitions/[id]` | **None** — `/candidates/[id]` shows proposal *history* (read); `/requisitions/[id]` shows top-matches (read) + "Email" links | **NO-CONTROL** | No "propose"/"submit to client"/"add proposal" control on either page. |
| 6 | `POST /requisitions` (create requisition) | `/requisitions` | "New requisition" intake card: `<Input>`/`<Textarea>`/`FauxSelect` fields + "Create requisition" & "Save draft" `<Button>`s; top "New requisition" `<Button>` | **NOT-WIRED** | Not a `<form>`; fields are uncontrolled with no `name`; buttons have no `action`/`onClick`. Inert. |
| 7 | `PUT /requisitions/[id]/skills` (reorder/reweight) | `/requisitions/[id]` | "Required skills" card with `GripVertical` drag handles (`cursor-grab`) + "Re-run matches" `<Button>` | **NOT-WIRED** | Drag affordance is cosmetic — no DnD library, no `'use client'`, no reorder handler, no save/PUT call. |
| 8 | `POST /requisitions/[id]/extract-skills` (JD skill extraction) | `/requisitions/[id]` (and `/requisitions` intake) | **None** — skills shown read-only via `getJdSkills`; `/requisitions` "What happens next" only *describes* extraction | **NO-CONTROL** | Nothing invokes extraction; it would ride on a JD-create flow that is itself not wired (#6). |

**Tally:** WIRED `0/8` · NOT-WIRED `4` (#1, #3, #6, #7) · NO-CONTROL `4` (#2, #4, #5, #8).

## How the wired READS are invoked (so a fix matches the pattern)

- Each data page is `export default async function …()` with `export const dynamic = "force-dynamic"` — a
  **Server Component** that does `const x = await listCandidates()` (often `Promise.all([...])`), importing the
  functions from `@/lib/data`.
- Under `DATA_SOURCE=api`, those `DataProvider` methods (`web/lib/data/api.ts`) run **server-side** and do
  `internalGet(path)` → `fetch(\`${APP_BASE_URL}/api/v1/...\`, { headers: { cookie } })`, forwarding the
  Supabase session cookie so the route resolves the org (`resolveOrgContext`) and RLS scopes the query.
- **There are no write methods on `DataProvider`** — reads and writes are separate surfaces.

## Fix pattern (for when these get wired — not done here)

The only existing write precedent is **`web/app/login/actions.ts`** (`"use server"`) invoked by
`<form action={signInAction}>` on the login page. A write fix would follow one of:
1. **Server Action** (`"use server"`) wired to a real `<form action={…}>` (or a button `formAction`), calling
   the DB via the same org-scoped path, then `revalidatePath`/`redirect`; or
2. A **client component** (`"use client"`) that `fetch`es the `/api/v1/*` route (the handlers already exist and
   are RLS-scoped) and refreshes.
Either also needs the inert mockup control turned into a real `<form>`/handler (and for uploads, an actual
`<input type="file">`). No such wiring exists today.

---

# UPDATE — write layer wired (2026-06-01)

The mutation UX is now built. **6 of the 7 flows are WIRED** (bulk upload deferred — see below). Pattern
established once and applied consistently (Option 1 above).

## Pattern used
**Server Action (`"use server"`) → `apiSend(method, /api/v1/…)` (forwards the Supabase session cookie via
`next/headers`, the WRITE twin of the reads' `internalGet`) → `revalidatePath`/`redirect`.** Helper:
`web/lib/server/internal-api.ts`. Forms submit via `<form action={serverAction}>` in Server Components;
the skills reorder/reweight uses a small **client component** (`"use client"`) that calls a server action and
`router.refresh()`. Résumé upload uses a real `<input type="file">` → the action reads the `File` from
`FormData`, base64-encodes it, and POSTs the existing résumé route. Auth/org-scoping matches the reads exactly
(routes resolve the org from the forwarded cookie session; RLS scopes the write; the route writes the audit row).

| # | Flow / route | Control now wired | Action → route | Status |
|---|---|---|---|---|
| 1 | `POST /candidates` | `/candidates`: real "Add a candidate" `<form>` (name/email/consent) | `createCandidateAction` → `POST /api/v1/candidates` → `revalidatePath('/candidates')` | **WIRED** |
| 2 | `POST /candidates/[id]/resumes` | `/candidates/[id]`: `<input type="file">` + "Upload & parse" `<form>` | `uploadResumeAction` (File→base64) → `POST …/resumes` → revalidate | **WIRED** |
| 3a | `POST /requisitions` | `/requisitions`: intake card is now a real `<form>` (title/location/openings/type/JD) | `createRequisitionAction` → `POST /requisitions` → `redirect('/requisitions/{id}')` | **WIRED** |
| 3b | `POST /requisitions/[id]/extract-skills` | runs automatically when a JD is pasted on create | same action → `POST …/extract-skills` → `PUT …/skills` (persist CORE/NICE) | **WIRED** |
| 4 | `POST /candidates/[id]/consent` | `/candidates/[id]`: "Record consent" `<form>` (opt-in/unsubscribe/pending) | `recordConsentAction` → `POST …/consent` → revalidate | **WIRED** |
| 5 | `POST /proposals` | `/candidates/[id]`: "Propose to a requisition" `<form>` (req + outcome) | `createProposalAction` → `POST /proposals` → revalidate | **WIRED** |
| 6 | `PUT /requisitions/[id]/skills` | `/requisitions/[id]`: `SkillsEditor` client component (drag reorder, weight inputs, CORE/nice toggle, Save) | `saveSkillsAction(reqId, skills)` → `PUT …/skills` → `revalidatePath` + `router.refresh()` | **WIRED** |

**Deferred (as instructed):** `POST /candidates/bulk` — lives on `/candidates/import`, which also needs
`getImportQueue` (a THROWING DataProvider method); to be done with the import-queue feature. Single upload (#2)
covers getting résumés in now.

## Files added/changed
Added: `web/lib/server/internal-api.ts`; `web/app/candidates/actions.ts`; `web/app/candidates/[id]/actions.ts`;
`web/app/requisitions/actions.ts`; `web/app/requisitions/[id]/actions.ts`; `web/app/requisitions/[id]/types.ts`;
`web/app/requisitions/[id]/skills-editor.tsx` (client). Changed pages: `/candidates`, `/candidates/[id]`,
`/requisitions`, `/requisitions/[id]`.

## Proof (live Supabase, logged-in org-A recruiter — `web/scripts/write-flows-proof-live.mts`)
- **`next build` passes** — all server-action forms + the client `SkillsEditor` compile (RSC/`use client`/
  `use server` boundaries valid); `/requisitions/[id]` ships the editor bundle (12.1 kB).
- **Round-trips (real JWT, the same routes the actions call):** ① create candidate → appears in list ·
  ② upload résumé → parsed `[AWS,Docker,Kafka,PostgreSQL,Python]`, version 1 · ③ create req + JD → 5 CORE/NICE
  skills extracted, completeness 45 · ④ consent opt-in → audience `optedIn 3 → 4` · ⑤ proposal → shows in
  history · ⑥ reweight skills → candidate **fit 100 → 50** (added a CORE skill the candidate lacks → re-rank).
  `WRITE FLOWS PROOF: PASS`.
- The wired controls invoke these actions via `<form action={…}>` / the client component's `onClick`→action
  (code), and each action is a 1:1 wrapper over the proven route — i.e. control → action → route → DB →
  revalidated read. (No Playwright run; this is the code + round-trip fallback proof.)
