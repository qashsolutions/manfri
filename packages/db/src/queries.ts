// Read queries for the Phase-1 dashboard slice. Each takes an org-scoped `Sql`
// (from withOrg) so RLS filters everything to the caller's org — the functions
// themselves carry no org filter, proving isolation is structural, not app-layer.

import type { Sql } from "./client";
import type { CandidateRow, DashboardStats } from "./schema";

export async function dashboardStats(sql: Sql): Promise<DashboardStats> {
  const rows = await sql<
    {
      candidates: number;
      requisitions: number;
      open_requisitions: number;
      proposals: number;
      opted_in: number;
    }[]
  >`
    select
      (select count(*)::int from candidate   where deleted_at is null)                          as candidates,
      (select count(*)::int from requisition where deleted_at is null)                          as requisitions,
      (select count(*)::int from requisition where deleted_at is null and status = 'open')      as open_requisitions,
      (select count(*)::int from proposal)                                                      as proposals,
      (select count(*)::int from candidate   where deleted_at is null and consent_state = 'opted_in') as opted_in
  `;
  const row = rows[0];
  return {
    candidates: row?.candidates ?? 0,
    requisitions: row?.requisitions ?? 0,
    openRequisitions: row?.open_requisitions ?? 0,
    proposals: row?.proposals ?? 0,
    optedIn: row?.opted_in ?? 0,
  };
}

export async function listCandidates(sql: Sql): Promise<CandidateRow[]> {
  const rows = await sql<
    {
      id: string;
      name: string | null;
      email: string | null;
      status: CandidateRow["status"];
      consent_state: CandidateRow["consentState"];
      created_at: Date;
      skills: unknown;
      resume_count: number;
    }[]
  >`
    select
      c.id, c.name, c.email, c.status, c.consent_state, c.created_at,
      (select r.parsed_jsonb -> 'skills' from resume r
         where r.candidate_id = c.id and r.is_current limit 1)      as skills,
      (select count(*)::int from resume r where r.candidate_id = c.id) as resume_count
    from candidate c
    where c.deleted_at is null
    order by c.created_at desc
  `;
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    email: r.email,
    status: r.status,
    consentState: r.consent_state,
    createdAt: r.created_at,
    skills: Array.isArray(r.skills) ? (r.skills as string[]) : [],
    resumeCount: r.resume_count ?? 0,
  }));
}
