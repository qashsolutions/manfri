# Supabase — connecting ManFriday to managed Postgres

ManFriday runs **its own compliance layer on top of** Supabase Postgres: a
non-`BYPASSRLS` `manfriday_app` role, `SET LOCAL` RLS GUCs per transaction, the
replayable baseline migration, and the `ObjectStore`/KMS-envelope seams. We do **not**
use Supabase Auth or PostgREST — the app connects directly with our own role and our
in-house EdDSA-JWT auth (invariant #3). This supersedes the earlier Neon assumption (D8).

> **PII gate.** Validating the schema + RLS uses **synthetic data only**. Real candidate
> PII into Supabase prod stays gated on the ⚖️ counsel sign-offs (DECISIONS D2/D3/D5) and
> a confirmed US region + DPA. Don't flip `DATA_SOURCE=api` against real people until then.

## 1. Get the connection string

Supabase dashboard → **Project Settings → Database → Connection string**.

- Prefer the **Session pooler** string (host `…pooler.supabase.com`, port `5432`): it is
  IPv4 and behaves like a direct connection, so DDL, `CREATE ROLE`, `CREATE EXTENSION`,
  and `SET LOCAL` all work. (The *direct* `db.<ref>.supabase.co:5432` is IPv6-only without
  the IPv4 add-on; the *transaction* pooler on `:6543` is for the deployed app, not migrations.)
- It contains your project's **database password** (the one set at project creation; reset
  it under the same page if unknown).

## 2. Create `services/api/.env.cloud` (gitignored — never commit)

```sh
# Owner/superuser-equivalent connection (role: postgres). Used for migrations + as the
# test "admin" engine that seeds synthetic fixtures. Note the +psycopg driver tag and SSL.
SUPABASE_ADMIN_URL="postgresql+psycopg://postgres.<project_ref>:<DB_PASSWORD>@aws-0-<region>.pooler.supabase.com:5432/postgres?sslmode=require"

# A password to assign to the least-privilege app role (you choose it; >= 16 chars).
MANFRIDAY_APP_PASSWORD="<pick-a-strong-password>"
```

Replace `<DB_PASSWORD>`, `<region>`, and `<…APP_PASSWORD>`. Keep the `?sslmode=require`.

## 3. Validate (synthetic data)

```sh
bash db/supabase_validate.sh
```

It applies the baseline migration, sets the `manfriday_app` password, proves the app role
is non-`BYPASSRLS` and sees **zero** rows without an `app.current_org` GUC (the core RLS
guarantee), then runs the full pytest suite against Supabase. All green = the cloud DB
matches local.

## 4. Object storage (later, with prod data)

Résumé/JD originals go in **Supabase Storage** behind the existing `ObjectStore` interface
(a config swap from the dev filesystem store) — wired in 1.6/1.7 alongside the email-send
service, gated on the same ⚖️ sign-offs.

## Running the app against Supabase locally (optional)

Set `DATABASE_URL` to the derived `manfriday_app` URL and start FastAPI; set the web
`DATA_SOURCE=api` + `API_BASE_URL` to hit it. This needs no Vercel — Vercel only adds a
public URL / preview deploys for the Next.js BFF, which is a later step.
