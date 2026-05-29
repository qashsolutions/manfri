# Product UI — Information Architecture & File Hierarchy

> Flagship mockups for **ManFriday** — one integrated product: a **résumé database +
> job-description matching + compliant candidate outreach**. A recruiter uploads a JD, ManFriday
> breaks it into weighted core / nice-to-have skills, scores how complete the JD is, ranks the
> best-fit candidates from the database (with advisory review-area flags), and lets the recruiter
> bulk-email the fits — every score and decision evidence-backed and **human-decided**. Pairs with
> [`../STATUS.md`](../STATUS.md) and [`../CLAUDE.md`](../CLAUDE.md) (invariants). Built on real
> Next.js 15 + React 19 + Tailwind v4 + shadcn-style primitives in [`../web`](../web).
>
> **Branding:** the matching/scoring engine is algorithmic and improves as résumés, JDs, and client
> feedback accumulate — but the product UI **never says "AI"** anywhere. Features are named
> functionally (Matching, Fit score, Review areas, Screening). See the `no-ai-wording` rule.
>
> **These are mockups:** all data is synthetic (no real PII), and most actions are inert. The point
> is the surface, the IA, and the compliance story — not wired behavior. Backend wiring (FastAPI
> CRUD, JD analysis, matching, comms, consent ledger, billing) and the Vercel/Supabase deploy
> come next.

## The core flow

```
Sign in (may belong to an Org; per-seat) → browse the org's résumé database
→ upload a JD → JD is broken into weighted core / nice-to-have skills + a completeness score
→ recruiter reorders/reprioritizes skills → matcher ranks top candidates from the DB
→ each candidate gets a transparent fit score + advisory review-area flags (authenticity / gaps)
→ recruiter bulk-emails the fits (consent + CAN-SPAM enforced)
→ human triage (Green/Amber/Red, reason code, audited) → proposal tracked across orgs
→ client feedback on each candidate feeds back and improves future matching
```

A candidate/résumé may belong to **more than one organization** — pools are consent-gated and each
org sees only its own notes, proposals, and activity (RLS-scoped).

## Route map

| Route | Screen | Notes |
|---|---|---|
| `/` | Dashboard | Stat cards, recent candidates, open reqs, "matches ready" CTA |
| `/login` | Recruiter sign-in | Email + password + **TOTP** (no app shell); candidates use magic link |
| `/candidates` | Résumé database (list) | Search/filter, status, résumé versions, consent — rows link to detail |
| `/candidates/[id]` | Candidate detail | Overview, **review areas** (advisory), **proposal history (cross-org)**, **organizations**, immutable résumé versions, consent & data, activity |
| `/candidates/import` | Bulk résumé import | Drag-drop → scan → sandboxed parse → encrypt → audit; parsing queue |
| `/requisitions` | Requisition list + intake | Table + "new requisition" intake form |
| `/requisitions/[id]` | Requisition detail | Weighted **core/nice skills** (reorderable) · **JD completeness score** · **top matches** (ranked, advisory flags) |
| `/screening` | Candidate fit detail | One candidate × one req: transparent **fit breakdown**, **review areas**, **triage**, tiered screening Q&A + answer keys |
| `/outreach` | Mass outreach | Campaign composer (merge fields, **CAN-SPAM footer**), audience, history |
| `/settings` | Settings | **Plan & billing** (single per-seat plan), **team** (roles + 2FA), **compliance** toggles |

> `/screening` is the candidate-fit detail (reached from a requisition's top-matches or a
> candidate's "Match to req"). It is **not** a separate tier — it's part of the one product.

## File hierarchy

```
web/
├── app/
│   ├── layout.tsx              # root: metadata, globals
│   ├── globals.css             # Tailwind v4 @theme tokens (light/dark), base layer
│   ├── page.tsx                # Dashboard
│   ├── login/page.tsx
│   ├── candidates/
│   │   ├── page.tsx            # list
│   │   ├── [id]/page.tsx       # detail (async params) — review areas, cross-org history
│   │   └── import/page.tsx     # bulk import
│   ├── requisitions/
│   │   ├── page.tsx            # list + intake
│   │   └── [id]/page.tsx       # detail — skills, JD completeness, top matches
│   ├── screening/page.tsx      # candidate × req fit detail
│   ├── outreach/page.tsx
│   ├── settings/page.tsx
│   └── api/health/             # (Phase 0)
├── components/
│   ├── app-shell.tsx           # sidebar nav + topbar + plan badge (the one chrome)
│   └── ui/                     # shadcn-style primitives, source-in-repo
│       ├── avatar.tsx  badge.tsx  button.tsx  card.tsx  input.tsx
│       ├── label.tsx   progress.tsx  separator.tsx  textarea.tsx
└── lib/
    ├── sample-data.ts          # single, domain-sectioned synthetic data module
    ├── utils.ts                # cn()
    ├── api/                    # typed OpenAPI client (Phase 0) — for real wiring
    └── auth/                   # EdDSA JWT + session (Phase 0) — for real wiring
```

### Conventions

- **No "AI" in the UI.** Algorithmic features are named functionally. The engine is AI internally;
  users never see that word.
- **Server components by default.** Pages are static server components; forms are uncontrolled and
  actions are inert until backend wiring. No `"use client"` yet.
- **One shell.** Every in-app screen renders inside `AppShell active=… title=…`; `/login` is the
  only chrome-less route. The shell owns nav, active state, search, and the plan badge.
- **Primitives, not bespoke.** New repeated UI becomes a `components/ui/*` primitive (variants via
  `cva`, merged with `cn`) before it's copy-pasted across pages.
- **Data in one module.** `lib/sample-data.ts` holds typed fixtures grouped by domain (candidates ·
  requisitions · JD analysis · matching · review flags · proposals · outreach · import · settings).
  Swap for real API calls later without touching page structure.
- **Compliance is visible.** Copy surfaces the spine: encrypted-at-rest (per-tenant key), RLS-scoped
  + audited access, immutable résumé/JD versions, consent + unsubscribe enforcement, CAN-SPAM
  footer. Matching is a transparent composite of evidence-backed sub-scores; **review-area flags are
  advisory only — never folded into the fit score, never an auto-reject**; triage is always
  human-set with a reason code. A candidate is per-`(candidate × req)`, never globally labeled.

## Design system

Tokens live in `app/globals.css` as a Tailwind v4 `@theme` (neutral + indigo accent, light/dark via
`.dark`). Utilities (`bg-card`, `text-muted-foreground`, `border`, `rounded-lg`,
`success`/`warning`/`destructive`) are generated from those CSS variables — change a token once,
everything follows.

## Open questions (owner / counsel)

- **Pricing** — single integrated per-seat plan; the mockup shows a `$29` placeholder. Confirm.
- **Candidate in >1 org** — the reusable, consent-gated cross-org pool changes the strict
  org-scoping invariant; needs the consent model + counsel sign-off before real data.
- **Review-area flags (authenticity)** — advisory only; legally sensitive. Confirm taxonomy and that
  they never gate selection automatically.
- **Top-N matching is a selection step** — gets adverse-impact monitoring before running on real
  candidates.
