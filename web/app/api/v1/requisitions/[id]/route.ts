// GET /api/v1/requisitions/{id} — one requisition (display shape). RLS-scoped.

import { NextResponse } from "next/server";
import { withOrg } from "@manfriday/db";

import { getOrgCtx, notFound } from "@/lib/server/route-helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface ReqRow {
  id: string;
  title: string;
  location: string | null;
  employment_type: string | null;
  openings: number;
  status: string;
  created_at: Date;
  in_pipeline: number;
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const ctx = await getOrgCtx(req);
  if (ctx instanceof NextResponse) return ctx;
  const { id } = await params;

  const rows = await withOrg({ orgId: ctx.orgId, role: ctx.role }, (sql) =>
    sql<ReqRow[]>`
      select r.id, r.title, r.location, r.employment_type, r.openings, r.status, r.created_at,
             (select count(*)::int from proposal p where p.requisition_id = r.id) as in_pipeline
      from requisition r where r.id = ${id} and r.deleted_at is null limit 1`,
  );
  const r = rows[0];
  if (!r) return notFound("requisition not found");

  return NextResponse.json({
    id: r.id,
    title: r.title,
    client: "",
    location: r.location ?? "",
    employmentType: r.employment_type ?? "",
    openings: r.openings,
    inPipeline: r.in_pipeline,
    status: r.status,
    postedAt: r.created_at.toISOString().slice(0, 10),
  });
}
