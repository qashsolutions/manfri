// Postgres client + the org-scoped transaction helper.
//
// `withOrg` runs a callback inside a transaction that first sets
// `request.jwt.claims` — the SAME GUC Supabase/PostgREST populate from the verified
// Auth JWT. RLS policies read `org_id` from it (see migrations/0001 → current_org_id()),
// so every query in the callback is filtered to that org. This is the TypeScript-target
// replacement for the retired Python `SET LOCAL app.current_org` pattern.

import postgres from "postgres";

export type Sql = ReturnType<typeof postgres>;

let _sql: Sql | null = null;

/** Lazily-created connection pool. Connects as the RLS-subject app role. */
export function getSql(): Sql {
  if (_sql) return _sql;
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("@manfriday/db: DATABASE_URL is not set (RLS-subject app-role connection).");
  }
  _sql = postgres(url, { max: 5, prepare: false, onnotice: () => {} });
  return _sql;
}

export interface OrgContext {
  orgId: string;
  role?: string;
}

/**
 * Run `fn` inside a transaction scoped to one org. Sets `request.jwt.claims`
 * transaction-locally so RLS filters by `org_id`. Mirrors the Supabase request path.
 */
export async function withOrg<T>(ctx: OrgContext, fn: (sql: Sql) => Promise<T>): Promise<T> {
  const sql = getSql();
  return sql.begin(async (tx) => {
    const claims = JSON.stringify({ org_id: ctx.orgId, org_role: ctx.role ?? "recruiter" });
    await tx`select set_config('request.jwt.claims', ${claims}, true)`;
    return fn(tx as unknown as Sql);
  }) as Promise<T>;
}

/** Close the pool (scripts/tests). */
export async function closeSql(): Promise<void> {
  if (_sql) {
    await _sql.end({ timeout: 5 });
    _sql = null;
  }
}
