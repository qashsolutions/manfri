// GET /api/v1/candidates/{id} — full candidate detail (contact PII for the owning org,
// résumé versions, parsed skills/experience, advisory review flags). api.ts maps this
// one rich response into Candidate / CandidateDetail / ReviewFlag[].

import { NextResponse } from "next/server";
import { withOrg } from "@manfriday/db";

import { allAdvisoryFlags } from "@/lib/domain/authenticity";
import { getOrgCtx, notFound } from "@/lib/server/route-helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface CandidateRow {
  id: string;
  external_ref: string | null;
  name: string | null;
  email: string | null;
  phone: string | null;
  status: string;
  consent_state: string;
  consent_source: string | null;
  created_at: Date;
}
interface ResumeRow {
  id: string;
  version: number;
  content_hash: string;
  content_type: string | null;
  is_current: boolean;
  parsed_jsonb: Record<string, unknown> | null;
  created_at: Date;
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const ctx = await getOrgCtx(req);
  if (ctx instanceof NextResponse) return ctx;
  const { id } = await params;

  const result = await withOrg({ orgId: ctx.orgId, role: ctx.role }, async (sql) => {
    const cRows = await sql<CandidateRow[]>`
      select id, external_ref, name, email, phone, status, consent_state, consent_source, created_at
      from candidate where id = ${id} and deleted_at is null limit 1`;
    const c = cRows[0];
    if (!c) return null;
    const resumes = await sql<ResumeRow[]>`
      select id, version, content_hash, content_type, is_current, parsed_jsonb, created_at
      from resume where candidate_id = ${id} order by version desc`;
    const current = resumes.find((r) => r.is_current) ?? null;
    const parsed = current?.parsed_jsonb ?? null;
    return { c, resumes, parsed };
  });

  if (!result) return notFound("candidate not found");
  const { c, resumes, parsed } = result;

  return NextResponse.json({
    id: c.id,
    external_ref: c.external_ref,
    status: c.status,
    consent_state: c.consent_state,
    consent_source: c.consent_source,
    created_at: c.created_at,
    contact: { name: c.name, email: c.email, phone: c.phone },
    skills: (parsed?.skills as string[] | undefined) ?? [],
    experience_years: (parsed?.total_experience_years as number | null | undefined) ?? null,
    resumes: resumes.map((r) => ({
      id: r.id,
      version: r.version,
      content_hash: r.content_hash,
      content_type: r.content_type,
      is_current: r.is_current,
      parsed: r.parsed_jsonb !== null,
      created_at: r.created_at,
    })),
    review_flags: allAdvisoryFlags(parsed),
  });
}
