// POST /api/v1/requisitions/{id}/extract-skills — suggest skills from the JD text
// (advisory; every found skill suggested as core@1.0). NOT persisted until the recruiter
// confirms via PUT /skills. Ports the Python extract-skills endpoint. RLS-scoped.

import { NextResponse } from "next/server";
import { withOrg } from "@manfriday/db";

import { suggestJdSkills } from "@/lib/domain/match";
import { getOrgCtx, notFound } from "@/lib/server/route-helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const ctx = await getOrgCtx(req);
  if (ctx instanceof NextResponse) return ctx;
  const { id } = await params;

  const suggested = await withOrg({ orgId: ctx.orgId, role: ctx.role }, async (sql) => {
    const rows = await sql<{ jd_text: string | null }[]>`
      select jd_text from requisition where id = ${id} and deleted_at is null limit 1`;
    if (!rows[0]) return null;
    return suggestJdSkills(rows[0].jd_text);
  });
  if (suggested === null) return notFound("requisition not found");
  return NextResponse.json({ suggested });
}
