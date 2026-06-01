// GET /api/v1/requisitions/{id}/completeness — deterministic 0–100 JD completeness.
// Display JdCompleteness shape: { score, items: [{ label, present, hint }] }. RLS-scoped.

import { NextResponse } from "next/server";
import { withOrg } from "@manfriday/db";

import { jdCompleteness } from "@/lib/domain/match";
import { getOrgCtx, notFound } from "@/lib/server/route-helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const ctx = await getOrgCtx(req);
  if (ctx instanceof NextResponse) return ctx;
  const { id } = await params;

  const data = await withOrg({ orgId: ctx.orgId, role: ctx.role }, async (sql) => {
    const reqRows = await sql<{ title: string; location: string | null; employment_type: string | null; jd_text: string | null }[]>`
      select title, location, employment_type, jd_text from requisition where id = ${id} and deleted_at is null limit 1`;
    const r = reqRows[0];
    if (!r) return null;
    const counts = await sql<{ tier: string; n: number }[]>`
      select tier, count(*)::int as n from jd_skill where requisition_id = ${id} group by tier`;
    const core = counts.find((c) => c.tier === "core")?.n ?? 0;
    const nice = counts.find((c) => c.tier === "nice")?.n ?? 0;
    return jdCompleteness({
      title: r.title,
      location: r.location,
      employment_type: r.employment_type,
      jd_text: r.jd_text,
      core_skill_count: core,
      nice_skill_count: nice,
    });
  });
  if (!data) return notFound("requisition not found");

  return NextResponse.json({
    score: data.score,
    items: data.items.map((i) => ({ label: i.key, present: i.present, hint: i.hint })),
  });
}
