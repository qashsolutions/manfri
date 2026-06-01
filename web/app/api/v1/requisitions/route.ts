// GET  /api/v1/requisitions — the org's requisitions (display Requisition[]).
// POST /api/v1/requisitions — create a requisition (JD intake). RLS-scoped.

import { NextResponse } from "next/server";
import { withOrg } from "@manfriday/db";

import { badRequest, getOrgCtx } from "@/lib/server/route-helpers";

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

function toDisplay(r: ReqRow) {
  return {
    id: r.id,
    title: r.title,
    client: "",
    location: r.location ?? "",
    employmentType: r.employment_type ?? "",
    openings: r.openings,
    inPipeline: r.in_pipeline,
    status: r.status,
    postedAt: r.created_at.toISOString().slice(0, 10),
  };
}

export async function GET(req: Request): Promise<NextResponse> {
  const ctx = await getOrgCtx(req);
  if (ctx instanceof NextResponse) return ctx;
  const rows = await withOrg({ orgId: ctx.orgId, role: ctx.role }, (sql) =>
    sql<ReqRow[]>`
      select r.id, r.title, r.location, r.employment_type, r.openings, r.status, r.created_at,
             (select count(*)::int from proposal p where p.requisition_id = r.id) as in_pipeline
      from requisition r where r.deleted_at is null order by r.created_at desc`,
  );
  return NextResponse.json(rows.map(toDisplay));
}

export async function POST(req: Request): Promise<NextResponse> {
  const ctx = await getOrgCtx(req);
  if (ctx instanceof NextResponse) return ctx;
  const body = (await req.json().catch(() => ({}))) as {
    title?: string;
    location?: string | null;
    employment_type?: string | null;
    openings?: number;
    jd_text?: string | null;
    client_id?: string | null;
  };
  if (!body.title) return badRequest("title is required");
  const title: string = body.title;
  const location: string | null = body.location ?? null;
  const employmentType: string | null = body.employment_type ?? null;
  const openings: number = body.openings ?? 1;
  const jdText: string | null = body.jd_text ?? null;
  const clientId: string | null = body.client_id ?? null;

  const created = await withOrg({ orgId: ctx.orgId, role: ctx.role }, async (sql) => {
    const rows = await sql<ReqRow[]>`
      insert into requisition (org_id, client_id, title, location, employment_type, openings, jd_text)
      values (${ctx.orgId}, ${clientId}, ${title}, ${location}, ${employmentType}, ${openings}, ${jdText})
      returning id, title, location, employment_type, openings, status, created_at, 0 as in_pipeline`;
    const r = rows[0]!;
    await sql`insert into audit_event (org_id, actor_id, action, entity_type, entity_id, after_jsonb)
      values (${ctx.orgId}, ${ctx.userId}, 'requisition.created', 'requisition', ${r.id}, ${sql.json({ title })})`;
    return toDisplay(r);
  });
  return NextResponse.json(created, { status: 201 });
}
