// Resolve the org an authenticated request belongs to. Server-only.
//
// Resolution order:
//   1. Authorization: Bearer <Supabase access token>  — verified via Supabase Auth;
//      org_id comes from the verified JWT (app_metadata.org_id, and/or the top-level
//      org_id claim set by the access-token hook). Used by API/server-to-server callers.
//   2. Dev override (header `x-dev-org-id` / env DEV_ORG_ID) — only when
//      NODE_ENV !== "production" or ALLOW_DEV_ORG_HEADER=1. For local/proof use.
//   3. Cookie session (@supabase/ssr) — the browser path; org_id from the signed-in user.
//
// The resolved org is passed to @manfriday/db `withOrg`, which sets it as the
// request.jwt.claims org_id so Postgres RLS scopes every query.

import { getUserFromBearer } from "@/lib/supabase/verify";

export class OrgContextError extends Error {
  readonly status = 401;
  constructor(message = "no authenticated org context") {
    super(message);
    this.name = "OrgContextError";
  }
}

export interface OrgContext {
  orgId: string;
  role: string;
  // The Supabase Auth user id (sub) for audit attribution; null on the dev override.
  userId: string | null;
  source: "bearer" | "dev-header" | "dev-env" | "session";
}

function devAllowed(): boolean {
  return process.env.ALLOW_DEV_ORG_HEADER === "1" || process.env.NODE_ENV !== "production";
}

function orgFromUser(user: {
  app_metadata?: Record<string, unknown> | null;
}): { orgId: string; role: string } | null {
  const meta = user.app_metadata ?? {};
  const orgId = typeof meta.org_id === "string" ? meta.org_id : null;
  if (!orgId) return null;
  const role = typeof meta.org_role === "string" ? meta.org_role : "recruiter";
  return { orgId, role };
}

export async function resolveOrgContext(req: Request): Promise<OrgContext> {
  // 1. Bearer token (verified Supabase JWT).
  const authz = req.headers.get("authorization");
  if (authz?.toLowerCase().startsWith("bearer ")) {
    const user = await getUserFromBearer(authz.slice(7).trim());
    if (!user) throw new OrgContextError("invalid or expired access token");
    const org = orgFromUser(user);
    if (!org) throw new OrgContextError("token has no org_id claim");
    return { ...org, userId: user.id, source: "bearer" };
  }

  // 2. Dev override (gated).
  if (devAllowed()) {
    const header = req.headers.get("x-dev-org-id");
    if (header) return { orgId: header, role: req.headers.get("x-dev-org-role") ?? "recruiter", userId: null, source: "dev-header" };
    if (process.env.DEV_ORG_ID) return { orgId: process.env.DEV_ORG_ID, role: "recruiter", userId: null, source: "dev-env" };
  }

  // 3. Cookie session (browser). Imported lazily so the Bearer/dev paths don't pull in
  // next/headers (keeps this resolver usable outside a Next request scope).
  const { createSupabaseServerClient } = await import("@/lib/supabase/server");
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) {
    const org = orgFromUser(user);
    if (org) return { ...org, userId: user.id, source: "session" };
  }
  throw new OrgContextError();
}
