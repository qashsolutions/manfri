# Wedge UI — Information Architecture & File Hierarchy

> Flagship mockups for **Phase 1 — the Compliant Talent CRM wedge** (~$10/user): résumé
> database + compliant candidate outreach, with **explainable AI screening shown as the locked
> premium tier**. Pairs with [`../STATUS.md`](../STATUS.md) (execution sequence) and
> [`../CLAUDE.md`](../CLAUDE.md) (invariants). Built on real Next.js 15 + React 19 + Tailwind v4 +
> shadcn-style primitives in [`../web`](../web).
>
> **These are mockups:** all data is synthetic (no real PII), and most actions are inert. The point
> is the surface, the IA, and the compliance story — not wired behavior. Backend wiring (FastAPI
> CRUD, comms, consent ledger, billing) and the Vercel/Supabase deploy come next.

## Route map

| Route | Screen | Tier | Notes |
|---|---|---|---|
| `/` | Dashboard | wedge | Stat cards, recent candidates, open reqs, premium upsell |
| `/login` | Recruiter sign-in | wedge | Email + password + **TOTP** (no app shell); candidates use magic link |
| `/candidates` | Candidate database (list) | wedge | Search/filter, status, résumé versions, consent — rows link to detail |
| `/candidates/[id]` | Candidate detail | wedge | Overview, skills, **activity**, **immutable résumé versions**, **consent & data** |
| `/candidates/import` | Bulk résumé import | wedge | Drag-drop → scan → sandboxed parse → encrypt → audit; parsing queue |
| `/requisitions` | Requisition list + intake | wedge | Table + "new requisition" intake form |
| `/requisitions/[id]` | Requisition detail | wedge | JD (CORE/NICE, manual), candidate **pipeline** |
| `/outreach` | Mass outreach | wedge | Campaign composer (merge fields, **CAN-SPAM footer**), audience, history |
| `/settings` | Settings | wedge | **Plan & billing** ($10 wedge), **team** (roles + 2FA), **compliance** toggles |
| `/screening` | AI screening | **premium** | Locked preview: evidence-backed fitment, tiered Q&A, **human triage** |

Premium surfaces (`/screening`, AI extraction/matching teasers) are intentionally **locked** and
upsell-framed — the wedge wins adoption, the screening intelligence is the differentiator.

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
│   │   ├── [id]/page.tsx       # detail (async params)
│   │   └── import/page.tsx     # bulk import
│   ├── requisitions/
│   │   ├── page.tsx            # list + intake
│   │   └── [id]/page.tsx       # detail (async params)
│   ├── outreach/page.tsx
│   ├── settings/page.tsx
│   ├── screening/page.tsx      # premium preview
│   └── api/health/             # (Phase 0)
├── components/
│   ├── app-shell.tsx           # sidebar nav + topbar + plan badge (the one chrome)
│   └── ui/                     # shadcn-style primitives, source-in-repo
│       ├── avatar.tsx  badge.tsx  button.tsx  card.tsx
│       ├── input.tsx   label.tsx  progress.tsx
│       └── separator.tsx textarea.tsx
└── lib/
    ├── sample-data.ts          # single, well-sectioned synthetic data module
    ├── utils.ts                # cn()
    ├── api/                    # typed OpenAPI client (Phase 0) — for real wiring
    └── auth/                   # EdDSA JWT + session (Phase 0) — for real wiring
```

### Conventions

- **Server components by default.** Pages are static server components; forms are uncontrolled and
  actions are inert until backend wiring. No `"use client"` yet.
- **One shell.** Every in-app screen renders inside `AppShell active=… title=…`; `/login` is the
  only chrome-less route. The shell owns nav, active state, search, and the plan badge.
- **Primitives, not bespoke.** New repeated UI becomes a `components/ui/*` primitive (variants via
  `cva`, merged with `cn`) before it's copy-pasted across pages.
- **Data in one module.** `lib/sample-data.ts` holds typed fixtures grouped by domain
  (candidates · requisitions · outreach · import · settings · premium). Swap for real API calls
  later without touching page structure. Split into `lib/data/*` if it outgrows one file.
- **Compliance is visible.** Copy throughout surfaces the spine: encrypted-at-rest (per-tenant
  key), RLS-scoped + audited access, immutable résumé versions, consent/unsubscribe enforcement,
  CAN-SPAM footer, and — on premium — evidence-backed, human-decided, never auto-rejected triage.

## Design system

Tokens live in `app/globals.css` as a Tailwind v4 `@theme` (premium neutral + indigo accent,
light/dark via `.dark`). Utilities (`bg-card`, `text-muted-foreground`, `border`, `rounded-lg`,
`success`/`warning`/`destructive`) are generated from those CSS variables — change a token once,
everything follows.
