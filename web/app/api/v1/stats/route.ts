// GET /api/v1/stats — dashboard headline counts for the caller's org, live from
// Supabase Postgres, RLS-scoped via withOrg (the org_id JWT claim). Part of the
// one real end-to-end slice for the TS foundation.

import { NextResponse } from "next/server";
import { dashboardStats, withOrg } from "@manfriday/db";
import { OrgContextError, resolveOrgContext } from "@/lib/server/org-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<NextResponse> {
  const ctx = await resolveOrgContext(req).catch((err: unknown) => {
    if (err instanceof OrgContextError) return null;
    throw err;
  });
  if (ctx === null) return NextResponse.json({ error: "no authenticated org context" }, { status: 401 });

  const stats = await withOrg({ orgId: ctx.orgId, role: ctx.role }, (sql) => dashboardStats(sql));

  // Map DB counts → the UI's Stats shape. Send metrics aren't built yet → honest
  // placeholders (not faked), matching the existing data contract.
  return NextResponse.json({
    candidates: stats.candidates,
    activeReqs: stats.openRequisitions,
    emailsSent30d: 0,
    responseRate: "—",
  });
}
