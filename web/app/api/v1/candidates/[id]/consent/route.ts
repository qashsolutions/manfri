// POST /api/v1/candidates/{id}/consent — record a consent event: update the candidate's
// simple consent flag + source (CAN-SPAM) and audit it. RLS-scoped. (No consent_ledger;
// the flag + audit log are the lean replacement.)

import { NextResponse } from "next/server";
import { withOrg } from "@manfriday/db";

import { badRequest, getOrgCtx, notFound } from "@/lib/server/route-helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EVENTS = ["opted_in", "unsubscribed", "pending"];

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const ctx = await getOrgCtx(req);
  if (ctx instanceof NextResponse) return ctx;
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as { event?: string; source?: string | null };
  if (!body.event || !EVENTS.includes(body.event)) return badRequest("invalid consent event");
  const event: string = body.event;
  const source: string | null = body.source ?? null;

  const ok = await withOrg({ orgId: ctx.orgId, role: ctx.role }, async (sql) => {
    const rows = await sql<{ id: string }[]>`
      update candidate
      set consent_state = ${event}, consent_source = ${source}, consent_updated_at = now()
      where id = ${id} and deleted_at is null
      returning id`;
    if (!rows[0]) return false;
    await sql`insert into audit_event (org_id, actor_id, action, entity_type, entity_id, after_jsonb)
      values (${ctx.orgId}, ${ctx.userId}, 'candidate.consent', 'candidate', ${id}, ${sql.json({ event, source })})`;
    return true;
  });
  if (!ok) return notFound("candidate not found");
  return NextResponse.json({ id, consent_state: event });
}
