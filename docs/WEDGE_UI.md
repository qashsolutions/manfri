# Product UI — Information Architecture & File Hierarchy

> The UI for **ManFriday** — one lean recruiter tool: a **résumé database +
> authenticity flags + job-description matching + screening + compliant candidate outreach**, built
> on **Supabase + Vercel**. A recruiter signs in, browses the org's résumé database, uploads résumés
> (single + bulk) with advisory authenticity/plausibility flags at upload, uploads a JD, ManFriday
> breaks it into weighted core / nice-to-have skills, scores how complete the JD is, ranks the
> best-fit candidates from the database, generates screening questions + answer keys, and lets the
> recruiter mass-email the fits — every score and decision evidence-backed and **human-decided**.
> Pairs with [`../STATUS.md`](../STATUS.md), [`../CLAUDE.md`](../CLAUDE.md) (invariants), and
> [`../EXTRACTION_REPORT.md`](../EXTRACTION_REPORT.md) (the data contract the TS backend must satisfy).
> Built on real Next.js 15 + React 19 + Tailwind v4 + shadcn-style primitives in [`../web`](../web).
>
> **Branding:** the matching/scoring engine is algorithmic and improves as résumés, JDs, and
> within-org feedback accumulate — but the product UI **never says "AI"** anywhere. Features are
> named functionally (Matching, Fit score, Review areas, Screening). See the `no-ai-wording` rule.
>
> **State:** the Next.js UI in `../web` is fully built against a `DATA_SOURCE=mock|api` seam (synthetic
> data, no real PII). The Python backend is being retired and rebuilt in **TypeScript on Supabase**
> (Postgres + pgvector + Storage + Auth); this doc describes the unchanged UI and its TS target.

## The core flow

```
Sign in (Supabase Auth; the recruiter belongs to one Org) → browse the org's résumé database
→ upload résumés (single + bulk) → authenticity / plausibility flags surface at upload (advisory)
→ upload a JD → JD is broken into weighted core / nice-to-have skills + a completeness score
→ recruiter reorders / reweights skills → matcher ranks top candidates from the DB
→ each candidate gets a transparent fit score (0.8·core + 0.2·nice) + advisory review-area flags
→ generate 15 screening questions (5 simple / 5 medium / 5 hard) + answer keys (recruiter grades)
→ lightweight triage (recruiter-set status + proposal outcome; no machine GREEN/AMBER/RED)
→ recruiter mass-emails the fits (consent + unsubscribe + CAN-SPAM enforced)
→ within-org feedback on each candidate / proposal feeds back and improves future matching
```

A candidate is **org-scoped**: the same person may exist in **more than one organization**, but
there is **no cross-org link** — each org sees only its own résumés, notes, proposals, and activity
(RLS-scoped on the `org_id` claim). Proposal history is **within-org only** (across that org's
clients / reqs), never across orgs.

## Route map

| Route | Screen | Notes |
|---|---|---|
| `/` | Dashboard | Stat cards, recent candidates, open reqs, "matches ready" CTA |
| `/login` | Recruiter sign-in | Supabase Auth (email + password); candidates use magic link |
| `/candidates` | Résumé database (list) | Search/filter, status, résumé versions, consent — rows link to detail |
| `/candidates/[id]` | Candidate detail | Overview, **review areas** (advisory), **within-org proposal history**, immutable résumé versions, consent & data, activity |
| `/candidates/import` | Bulk résumé import | Drag-drop → scan → parse → store → audit; parsing queue |
| `/requisitions` | Requisition list + intake | Table + "new requisition" intake form |
| `/requisitions/[id]` | Requisition detail | Weighted **core/nice skills** (reorderable) · **JD completeness score** · **top matches** (ranked, advisory flags) |
| `/screening` | Candidate fit detail | One candidate × one req: transparent **fit breakdown**, **review areas**, **triage**, 15 tiered screening Q&A + answer keys |
| `/outreach` | Mass outreach | Campaign composer (merge fields, **CAN-SPAM footer**), audience, history |
| `/settings` | Settings | **Plan & billing** (single per-seat plan) · **team** (roles + 2FA) |

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
│   │   ├── [id]/page.tsx       # detail (async params) — review areas, within-org history
│   │   └── import/page.tsx     # bulk import
│   ├── requisitions/
│   │   ├── page.tsx            # list + intake
│   │   └── [id]/page.tsx       # detail — skills, JD completeness, top matches
│   ├── screening/page.tsx      # candidate × req fit detail
│   ├── outreach/page.tsx
│   ├── settings/page.tsx
│   └── api/health/             # health check
├── components/
│   ├── app-shell.tsx           # sidebar nav + topbar + plan badge (the one chrome)
│   └── ui/                     # shadcn-style primitives, source-in-repo
│       ├── avatar.tsx  badge.tsx  button.tsx  card.tsx  input.tsx
│       ├── label.tsx   progress.tsx  separator.tsx  textarea.tsx
└── lib/
    ├── data/                   # DATA_SOURCE=mock|api seam: contract · mock · api providers
    ├── sample-data.ts          # single, domain-sectioned synthetic data module
    ├── utils.ts                # cn()
    ├── api/                    # typed client — for real wiring
    └── auth/                   # session — for real wiring
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
  requisitions · JD analysis · matching · review flags · proposals · outreach · import · settings),
  consumed through the `lib/data` seam. Swap for real Supabase calls later without touching page
  structure.
- **Trust is visible.** Copy surfaces the spine: RLS-scoped + audited access (org isolation on the
  `org_id` claim), immutable résumé / JD versions, consent + unsubscribe enforcement (CAN-SPAM
  footer). Matching is a **transparent fit composite** (a weighted skill-overlap score,
  `0.8·core + 0.2·nice`); **advisory review-area flags are surfaced for the recruiter — never folded
  into the fit score, never an auto-reject**; triage is always human-set. A candidate is scored
  per `(candidate × req)`, never globally labeled.

## Design system

Tokens live in `app/globals.css` as a Tailwind v4 `@theme` (neutral + indigo accent, light/dark via
`.dark`). Utilities (`bg-card`, `text-muted-foreground`, `border`, `rounded-lg`,
`success`/`warning`/`destructive`) are generated from those CSS variables — change a token once,
everything follows.

## Open questions (owner / counsel)

- **Pricing** — single integrated per-seat plan; the mockup shows a `$29` placeholder. Confirm.
- **Review-area flags (authenticity)** — advisory only; legally sensitive. Confirm taxonomy and that
  they never gate selection automatically.
