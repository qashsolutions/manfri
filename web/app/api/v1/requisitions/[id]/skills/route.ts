// GET /api/v1/requisitions/{id}/skills — the confirmed CORE/NICE weighted rubric.
// PUT /api/v1/requisitions/{id}/skills — replace it (recruiter reorder/reweight). RLS-scoped.

import { NextResponse } from "next/server";
import { withOrg } from "@manfriday/db";

import { badRequest, getOrgCtx, notFound } from "@/lib/server/route-helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface SkillRow {
  id: string;
  name: string;
  tier: string;
  weight: number;
  sort_order: number;
}

async function reqExists(sql: import("@manfriday/db").Sql, id: string): Promise<boolean> {
  const rows = await sql<{ n: number }[]>`select count(*)::int as n from requisition where id = ${id} and deleted_at is null`;
  return (rows[0]?.n ?? 0) > 0;
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const ctx = await getOrgCtx(req);
  if (ctx instanceof NextResponse) return ctx;
  const { id } = await params;
  const rows = await withOrg({ orgId: ctx.orgId, role: ctx.role }, (sql) =>
    sql<SkillRow[]>`select id, name, tier, weight::float8 as weight, sort_order from jd_skill where requisition_id = ${id} order by sort_order`,
  );
  // Display JdSkill shape: { name, tier, weight }.
  return NextResponse.json(rows.map((s) => ({ name: s.name, tier: s.tier, weight: s.weight })));
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const ctx = await getOrgCtx(req);
  if (ctx instanceof NextResponse) return ctx;
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as {
    skills?: Array<{ name: string; tier: string; weight?: number; sort_order?: number }>;
  };
  const skills = body.skills ?? [];
  for (const s of skills) {
    if (s.tier !== "core" && s.tier !== "nice") return badRequest("tier must be core|nice");
  }

  const result = await withOrg({ orgId: ctx.orgId, role: ctx.role }, async (sql) => {
    if (!(await reqExists(sql, id))) return null;
    await sql`delete from jd_skill where requisition_id = ${id}`;
    for (const [i, s] of skills.entries()) {
      await sql`insert into jd_skill (org_id, requisition_id, name, tier, weight, sort_order)
        values (${ctx.orgId}, ${id}, ${s.name}, ${s.tier}, ${s.weight ?? 1.0}, ${s.sort_order ?? i})`;
    }
    await sql`insert into audit_event (org_id, actor_id, action, entity_type, entity_id, after_jsonb)
      values (${ctx.orgId}, ${ctx.userId}, 'requisition.skills_set', 'requisition', ${id}, ${sql.json({ count: skills.length })})`;
    const rows = await sql<SkillRow[]>`select id, name, tier, weight::float8 as weight, sort_order from jd_skill where requisition_id = ${id} order by sort_order`;
    return rows.map((s) => ({ name: s.name, tier: s.tier, weight: s.weight }));
  });
  if (result === null) return notFound("requisition not found");
  return NextResponse.json(result);
}
