// GET /api/v1/candidates  — the org's candidates (display Candidate[] shape).
// POST /api/v1/candidates — create a candidate (PII as plain columns, RLS-scoped).

import { NextResponse } from "next/server";
import { listCandidates, withOrg } from "@manfriday/db";

import { getOrgCtx } from "@/lib/server/route-helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<NextResponse> {
  const ctx = await getOrgCtx(req);
  if (ctx instanceof NextResponse) return ctx;

  const rows = await withOrg({ orgId: ctx.orgId, role: ctx.role }, (sql) => listCandidates(sql));
  const out = rows.map((c) => ({
    id: c.id,
    name: c.name ?? c.email ?? "—",
    title: "",
    location: "",
    email: "", // contact PII is detail-only
    skills: c.skills,
    status: c.status,
    resumeVersions: c.resumeCount,
    lastActivity: c.createdAt.toISOString().slice(0, 10),
    consent: c.consentState === "opted_in",
  }));
  return NextResponse.json(out);
}

interface CreateBody {
  external_ref?: string | null;
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  consent_state?: string;
}

export async function POST(req: Request): Promise<NextResponse> {
  const ctx = await getOrgCtx(req);
  if (ctx instanceof NextResponse) return ctx;
  const body = (await req.json().catch(() => ({}))) as CreateBody;
  const consent = body.consent_state ?? "pending";
  if (!["pending", "opted_in", "unsubscribed"].includes(consent)) {
    return NextResponse.json({ error: "invalid consent_state" }, { status: 422 });
  }

  const created = await withOrg({ orgId: ctx.orgId, role: ctx.role }, async (sql) => {
    const rows = await sql<{ id: string }[]>`
      insert into candidate (org_id, external_ref, name, email, phone, consent_state)
      values (${ctx.orgId}, ${body.external_ref ?? null}, ${body.name ?? null}, ${body.email ?? null}, ${body.phone ?? null}, ${consent})
      returning id`;
    const id = rows[0]!.id;
    await sql`insert into audit_event (org_id, actor_id, action, entity_type, entity_id, after_jsonb)
      values (${ctx.orgId}, ${ctx.userId}, 'candidate.created', 'candidate', ${id}, ${sql.json({ external_ref: body.external_ref ?? null, has_pii: Boolean(body.name || body.email) })})`;
    return { id };
  });
  return NextResponse.json(created, { status: 201 });
}
