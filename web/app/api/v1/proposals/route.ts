// GET  /api/v1/proposals?candidate_id= — proposals (within-org history), display shape.
// POST /api/v1/proposals — record a proposal/outcome (human action, audited). RLS-scoped.

import { NextResponse } from "next/server";
import { withOrg } from "@manfriday/db";

import { badRequest, getOrgCtx, notFound } from "@/lib/server/route-helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const OUTCOMES = ["proposed", "interviewing", "rejected", "hired"];

interface ProposalRow {
  id: string;
  outcome: string;
  reason: string | null;
  decided_at: Date | null;
  created_at: Date;
  req_title: string | null;
}

export async function GET(req: Request): Promise<NextResponse> {
  const ctx = await getOrgCtx(req);
  if (ctx instanceof NextResponse) return ctx;
  const candidateId = new URL(req.url).searchParams.get("candidate_id");

  const rows = await withOrg({ orgId: ctx.orgId, role: ctx.role }, async (sql) => {
    return candidateId
      ? sql<ProposalRow[]>`
          select p.id, p.outcome, p.reason, p.decided_at, p.created_at, r.title as req_title
          from proposal p left join requisition r on r.id = p.requisition_id
          where p.candidate_id = ${candidateId} order by p.created_at desc`
      : sql<ProposalRow[]>`
          select p.id, p.outcome, p.reason, p.decided_at, p.created_at, r.title as req_title
          from proposal p left join requisition r on r.id = p.requisition_id
          order by p.created_at desc`;
  });

  const out = rows.map((p) => ({
    id: p.id,
    client: "",
    req: p.req_title ?? "",
    date: (p.decided_at ?? p.created_at).toISOString().slice(0, 10),
    outcome: p.outcome,
    reason: p.reason ?? undefined,
  }));
  return NextResponse.json(out);
}

export async function POST(req: Request): Promise<NextResponse> {
  const ctx = await getOrgCtx(req);
  if (ctx instanceof NextResponse) return ctx;
  const body = (await req.json().catch(() => ({}))) as {
    candidate_id?: string;
    requisition_id?: string;
    outcome?: string;
    reason?: string | null;
  };
  if (!body.candidate_id || !body.requisition_id) return badRequest("candidate_id and requisition_id are required");
  const outcome = body.outcome ?? "proposed";
  if (!OUTCOMES.includes(outcome)) return badRequest("invalid outcome");
  const candidateId: string = body.candidate_id;
  const requisitionId: string = body.requisition_id;
  const reason: string | null = body.reason ?? null;

  const result = await withOrg({ orgId: ctx.orgId, role: ctx.role }, async (sql) => {
    const cand = await sql<{ id: string }[]>`select id from candidate where id = ${candidateId} and deleted_at is null`;
    const reqRow = await sql<{ id: string }[]>`select id from requisition where id = ${requisitionId} and deleted_at is null`;
    if (!cand[0] || !reqRow[0]) return null;
    const decided = outcome !== "proposed";
    const ins = await sql<{ id: string }[]>`
      insert into proposal (org_id, candidate_id, requisition_id, outcome, reason, decided_at)
      values (${ctx.orgId}, ${candidateId}, ${requisitionId}, ${outcome}, ${reason}, ${decided ? sql`now()` : null})
      returning id`;
    const id = ins[0]!.id;
    await sql`insert into audit_event (org_id, actor_id, action, entity_type, entity_id, after_jsonb)
      values (${ctx.orgId}, ${ctx.userId}, 'proposal.created', 'proposal', ${id}, ${sql.json({ outcome, candidate_id: candidateId })})`;
    return { id };
  });
  if (!result) return notFound("candidate or requisition not found");
  return NextResponse.json(result, { status: 201 });
}
