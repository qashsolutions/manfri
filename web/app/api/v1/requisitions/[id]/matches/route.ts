// GET /api/v1/requisitions/{id}/matches — rank the org's candidates against the JD by
// transparent skill overlap (0.8·core + 0.2·nice), with advisory review-flag counts.
// Returns the display MatchRow[] (match joined with its candidate). RLS-scoped.

import { NextResponse } from "next/server";
import { withOrg } from "@manfriday/db";

import { type JdSkillInput, reviewFlags, scoreCandidate } from "@/lib/domain/match";
import { getOrgCtx, notFound } from "@/lib/server/route-helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface CandRow {
  id: string;
  name: string | null;
  email: string | null;
  status: string;
  consent_state: string;
  created_at: Date;
  parsed_jsonb: Record<string, unknown> | null;
  resume_count: number;
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const ctx = await getOrgCtx(req);
  if (ctx instanceof NextResponse) return ctx;
  const { id } = await params;
  const limit = Math.min(Math.max(Number(new URL(req.url).searchParams.get("limit") ?? 5), 1), 100);

  const data = await withOrg({ orgId: ctx.orgId, role: ctx.role }, async (sql) => {
    const reqRows = await sql<{ n: number }[]>`select count(*)::int as n from requisition where id = ${id} and deleted_at is null`;
    if ((reqRows[0]?.n ?? 0) === 0) return null;
    const jd = await sql<{ name: string; tier: string; weight: number }[]>`
      select name, tier, weight::float8 as weight from jd_skill where requisition_id = ${id} order by sort_order`;
    const cands = await sql<CandRow[]>`
      select c.id, c.name, c.email, c.status, c.consent_state, c.created_at,
             r.parsed_jsonb,
             (select count(*)::int from resume rr where rr.candidate_id = c.id) as resume_count
      from candidate c
      left join resume r on r.candidate_id = c.id and r.is_current
      where c.deleted_at is null`;
    return { jd, cands };
  });
  if (!data) return notFound("requisition not found");

  const jdSkills: JdSkillInput[] = data.jd.map((s) => ({ name: s.name, tier: s.tier as "core" | "nice", weight: s.weight }));
  const coreTotal = jdSkills.filter((s) => s.tier === "core").length;

  const matches = data.cands.map((c) => {
    const parsed = c.parsed_jsonb;
    const skills = (parsed?.skills as string[] | undefined) ?? [];
    const breakdown = scoreCandidate(skills, jdSkills);
    return {
      candidateId: c.id,
      fit: breakdown.fit,
      coreCovered: coreTotal - breakdown.missing_core.length,
      coreTotal,
      flags: reviewFlags(parsed).length,
      candidate: {
        id: c.id,
        name: c.name ?? c.email ?? "—",
        title: "",
        location: "",
        email: "",
        skills,
        status: c.status,
        resumeVersions: c.resume_count,
        lastActivity: c.created_at.toISOString().slice(0, 10),
        consent: c.consent_state === "opted_in",
      },
    };
  });
  // Deterministic ranking: fit desc, then candidate id (stable tie-break).
  matches.sort((a, b) => b.fit - a.fit || a.candidateId.localeCompare(b.candidateId));
  return NextResponse.json(matches.slice(0, limit));
}
