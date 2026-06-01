// POST /api/v1/candidates/bulk — bulk import: one new candidate per résumé file, each
// ingested + parsed inline (a queue can replace inline parsing for large batches later).
// Ports the Python bulk endpoint. RLS-scoped.

import { NextResponse } from "next/server";
import { withOrg } from "@manfriday/db";

import { IngestRejectedError, ingestAndParseResume } from "@/lib/server/ingest";
import { badRequest, getOrgCtx } from "@/lib/server/route-helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface BulkItem {
  external_ref?: string | null;
  filename?: string | null;
  content_type?: string | null;
  content_b64?: string;
}
interface BulkBody {
  items?: BulkItem[];
}

export async function POST(req: Request): Promise<NextResponse> {
  const ctx = await getOrgCtx(req);
  if (ctx instanceof NextResponse) return ctx;
  const body = (await req.json().catch(() => ({}))) as BulkBody;
  if (!body.items?.length) return badRequest("no items");

  const results: Array<Record<string, unknown>> = [];
  for (const item of body.items) {
    if (!item.content_b64) return badRequest("each item needs content_b64");
    const bytes = Buffer.from(item.content_b64, "base64");

    const candidateId = await withOrg({ orgId: ctx.orgId, role: ctx.role }, async (sql) => {
      const rows = await sql<{ id: string }[]>`
        insert into candidate (org_id, external_ref) values (${ctx.orgId}, ${item.external_ref ?? null}) returning id`;
      const id = rows[0]!.id;
      await sql`insert into audit_event (org_id, actor_id, action, entity_type, entity_id, after_jsonb)
        values (${ctx.orgId}, ${ctx.userId}, 'candidate.created', 'candidate', ${id}, ${sql.json({ external_ref: item.external_ref ?? null, via: "bulk" })})`;
      return id;
    });

    try {
      const r = await ingestAndParseResume({
        orgId: ctx.orgId,
        candidateId,
        bytes,
        contentType: item.content_type ?? "application/pdf",
        filename: item.filename ?? null,
        actorId: ctx.userId,
      });
      results.push({ candidate_id: candidateId, resume_id: r.resumeId, version: r.version, skills_found: r.skillsFound, external_ref: item.external_ref ?? null, filename: item.filename ?? null });
    } catch (err) {
      if (err instanceof IngestRejectedError) return badRequest(err.message);
      throw err;
    }
  }
  return NextResponse.json({ created: results.length, results }, { status: 201 });
}
