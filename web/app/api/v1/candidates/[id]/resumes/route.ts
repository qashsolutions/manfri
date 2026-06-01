// POST /api/v1/candidates/{id}/resumes — upload + parse one résumé (base64 JSON, as the
// Python API). Stores bytes in Supabase Storage (org-prefixed), creates the immutable
// versioned resume row with parsed_jsonb, audits. RLS-scoped.

import { NextResponse } from "next/server";
import { withOrg } from "@manfriday/db";

import { IngestRejectedError, ingestAndParseResume } from "@/lib/server/ingest";
import { badRequest, getOrgCtx, notFound } from "@/lib/server/route-helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface UploadBody {
  filename?: string | null;
  content_type?: string | null;
  content_b64?: string;
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const ctx = await getOrgCtx(req);
  if (ctx instanceof NextResponse) return ctx;
  const { id: candidateId } = await params;
  const body = (await req.json().catch(() => ({}))) as UploadBody;
  if (!body.content_b64) return badRequest("content_b64 is required");

  let bytes: Buffer;
  try {
    bytes = Buffer.from(body.content_b64, "base64");
  } catch {
    return badRequest("invalid base64 content");
  }

  // Candidate must belong to the caller's org (RLS-scoped existence check).
  const exists = await withOrg({ orgId: ctx.orgId, role: ctx.role }, async (sql) => {
    const rows = await sql<{ n: number }[]>`select count(*)::int as n from candidate where id = ${candidateId} and deleted_at is null`;
    return (rows[0]?.n ?? 0) > 0;
  });
  if (!exists) return notFound("candidate not found");

  try {
    const r = await ingestAndParseResume({
      orgId: ctx.orgId,
      candidateId,
      bytes,
      contentType: body.content_type ?? "application/pdf",
      filename: body.filename ?? null,
      actorId: ctx.userId,
    });
    return NextResponse.json({
      candidate_id: candidateId,
      resume_id: r.resumeId,
      version: r.version,
      deduped: r.deduped,
      skills_found: r.skillsFound,
      extraction_method: r.extractionMethod,
      parsed: true,
    });
  } catch (err) {
    if (err instanceof IngestRejectedError) return badRequest(err.message);
    throw err;
  }
}
