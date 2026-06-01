# Supabase — ManFriday's backend platform

ManFriday's TypeScript backend uses **Supabase** as the full backend platform:
**Postgres 16 + pgvector** (data + embeddings), **Storage** (résumé/JD originals), and
**Auth** (org + recruiter accounts). Org isolation is **Postgres RLS keyed on the `org_id`
claim in the Supabase Auth JWT**, read inside policies via `auth.jwt()`.

This **replaces** the earlier approach (a non-`BYPASSRLS` `manfriday_app` role with
`SET LOCAL` RLS GUCs per transaction, plus in-house EdDSA-JWT auth and the KMS-envelope
`ObjectStore` seam) and **supersedes** the earlier Neon assumption (see
[`DECISIONS.md` #d8](DECISIONS.md#d8-infrastructure-supabase--vercel)).

## 1. Create a Supabase project

Create the project in the Supabase dashboard. Pick a region (the team can confirm the
exact one later). Then enable the **`pgvector`** extension (Database → Extensions, or
`create extension if not exists vector;`).

## 2. Auth + the `org_id` claim

Use **Supabase Auth** for org and recruiter accounts. Many recruiters belong to one org
(the staffing agency) and share that org's data; there is no cross-org link.

Put an **`org_id` claim** on the session/JWT so RLS policies can read it — via the user's
**app metadata** and a **custom access-token hook** that copies `org_id` into the issued
access token. Policies then read it with `auth.jwt() ->> 'org_id'`.

Candidates have **no app login** in v1 — they are data rows, not authenticated users.

## 3. RLS pattern

Every tenant-scoped table carries an `org_id` column. Enable RLS on the table and write
policies that compare the row's `org_id` to the JWT claim, in both directions:

```sql
-- illustrative only — author real policies in the migrations, not here
alter table candidate enable row level security;

create policy candidate_org_isolation on candidate
  using      (org_id = (auth.jwt() ->> 'org_id')::uuid)   -- read / update / delete
  with check (org_id = (auth.jwt() ->> 'org_id')::uuid);  -- insert / update
```

This pattern applies to **every** tenant-scoped table, including **pgvector** tables:
KNN / similarity queries run under the same RLS, so embeddings are org-isolated too.
(Describe the pattern in prose like this — the actual migrations live with the schema.)

## 4. Storage

Résumé and JD originals go in a **private Supabase Storage bucket**, with objects scoped
per org (e.g. an `org_id` prefix in the object path). The TypeScript backend reads/writes
them using the **service role** key, or hands the browser short-lived **signed URLs** for
direct download/upload. The bucket is never public.

## 5. Env / secrets

Configure the Supabase **project URL**, **anon key**, and **service-role key** in the
**Vercel project environment** (and a local `.env` for development). Never commit them.
The anon key is safe for the browser/client; the service-role key is server-only (Route
Handlers / Server Actions) and bypasses RLS, so keep it off the client entirely.

## Note on the retiring Python backend

The Python script `db/supabase_validate.py` belongs to the **retiring** Python backend —
it validated the old non-`BYPASSRLS` `manfriday_app` role and the baseline Alembic
migration. It is **not** part of the TypeScript target and can be ignored here.
