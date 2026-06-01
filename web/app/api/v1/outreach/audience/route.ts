// GET /api/v1/outreach/audience — consent breakdown for the org (display Audience shape).
// Send/campaigns/templates/metrics are deferred (net-new). RLS-scoped.

import { NextResponse } from "next/server";
import { withOrg } from "@manfriday/db";

import { getOrgCtx } from "@/lib/server/route-helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<NextResponse> {
  const ctx = await getOrgCtx(req);
  if (ctx instanceof NextResponse) return ctx;

  const counts = await withOrg({ orgId: ctx.orgId, role: ctx.role }, (sql) =>
    sql<{ consent_state: string; n: number }[]>`
      select consent_state, count(*)::int as n from candidate where deleted_at is null group by consent_state`,
  );
  const by = (s: string) => counts.find((c) => c.consent_state === s)?.n ?? 0;
  return NextResponse.json({
    total: counts.reduce((a, c) => a + c.n, 0),
    optedIn: by("opted_in"),
    pendingConsent: by("pending"),
    unsubscribed: by("unsubscribed"),
  });
}
