// API provider — the real data source for production (DATA_SOURCE=api).
//
// Runs ONLY on the server (it reads the iron-session cookie and mints a 5-min
// internal JWT per request — the browser never holds a FastAPI token). FastAPI
// verifies the JWT and sets the RLS GUCs from the verified claims (invariant #3).
//
// This is an **honest bridge** between the compliant FastAPI shapes and the richer
// display types the mock UI was built against. Each method is labelled:
//   • real        — served straight from the API
//   • placeholder — a display-only field the Phase-1 API does not model yet (title,
//                   location, source, applicants, exact core/nice split, …). Filled
//                   with a neutral value and noted; the UI types get reshaped to the
//                   redacted reality in a later pass.
//   • phase-2     — a capability that genuinely isn't built (screening Q&A + sub-
//                   scores = Phase 2; campaigns / email templates / send-metrics =
//                   outreach-send, owner/counsel-gated). These THROW a clear error.
//
// DATA_SOURCE=mock stays the default everywhere except production, so dev/CI never
// hit this path. Pages that render under DATA_SOURCE=api must be dynamic (this repo
// adds `export const dynamic = "force-dynamic"` to the data pages).

import type { components } from "@manfriday/contracts";

import { mintInternalJwt } from "../auth/jwt";
import { getSession } from "../auth/session";
import type {
  Candidate,
  CandidateDetail,
  CandidateStatus,
  FlagSeverity,
  JdCompleteness,
  JdSkill,
  Proposal,
  ProposalOutcome,
  ReqStatus,
  Requisition,
  ReviewFlag,
} from "../sample-data";
import type { DataProvider, MatchRow } from "./contract";

type Schemas = components["schemas"];

const API_BASE_URL = process.env.API_BASE_URL ?? "http://localhost:8000";

function phase2(method: string, reason: string): never {
  throw new Error(`lib/data: "${method}" is not available in this phase — ${reason}.`);
}

async function authHeader(): Promise<string> {
  const session = await getSession();
  if (!session.userId || !session.orgId) {
    throw new Error("lib/data api: no authenticated session (cannot scope the request).");
  }
  const key = process.env.BFF_JWT_PRIVATE_KEY;
  if (!key) {
    throw new Error("lib/data api: BFF_JWT_PRIVATE_KEY is not set (cannot mint the internal JWT).");
  }
  const token = await mintInternalJwt(
    { sub: session.userId, org_id: session.orgId, roles: session.roles ?? [] },
    key,
  );
  return `Bearer ${token}`;
}

async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    headers: { Authorization: await authHeader() },
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`lib/data api: GET ${path} -> ${res.status} ${res.statusText}`);
  }
  return (await res.json()) as T;
}

const day = (iso: string): string => iso.slice(0, 10);

// ── Candidate adapters ────────────────────────────────────────────────────────

function summaryToCandidate(s: Schemas["CandidateSummary"]): Candidate {
  return {
    id: s.id,
    name: s.name ?? s.external_ref ?? "—", // real (decrypted for the owning org)
    title: "", // placeholder — not modeled on the candidate record in Phase 1
    location: "", // placeholder
    email: "", // contact PII is detail-only, never in the list
    phone: "", // contact PII is detail-only
    skills: s.skills, // real (parsed)
    experienceYears: s.experience_years ?? 0, // real
    status: s.status as CandidateStatus, // real
    topSkillMatch: 0, // placeholder — needs per-req matching, not computed at list time
    resumeVersions: 0, // placeholder — count not in the summary
    lastActivity: day(s.created_at), // real (created)
    source: "", // placeholder — not modeled
    consent: s.consent_state as Candidate["consent"], // real
  };
}

function detailToCandidate(d: Schemas["CandidateDetail"]): Candidate {
  return {
    id: d.id,
    name: d.contact.name ?? d.external_ref ?? "—", // real
    title: "", // placeholder
    location: "", // placeholder
    email: d.contact.email ?? "", // real (decrypted, owning-org detail)
    phone: d.contact.phone ?? "", // real
    skills: d.skills, // real
    experienceYears: d.experience_years ?? 0, // real
    status: d.status as CandidateStatus, // real
    topSkillMatch: 0, // placeholder
    resumeVersions: d.resumes.length, // real
    lastActivity: day(d.created_at), // real
    source: "", // placeholder
    consent: d.consent_state as Candidate["consent"], // real
  };
}

function requisitionToMock(r: Schemas["RequisitionOut"]): Requisition {
  return {
    id: r.id,
    title: r.title, // real
    client: "", // placeholder — client name not joined here
    location: r.location ?? "", // real
    status: r.status as ReqStatus, // real
    openings: r.openings, // real
    applicants: 0, // placeholder — not modeled in Phase 1
    topMatches: 0, // placeholder — from /matches, not the list
    created: day(r.created_at), // real
    skillsExtracted: r.core_skill_count + r.nice_skill_count > 0, // real
    completeness: 0, // placeholder — fetched via /completeness, not the list
  };
}

// ── Provider ──────────────────────────────────────────────────────────────────

export const apiProvider: DataProvider = {
  // Dashboard — real.
  getStats: async () => {
    const s = await apiGet<Schemas["DashboardStats"]>("/dashboard/stats");
    return {
      activeCandidates: s.candidates,
      openReqs: s.open_requisitions,
      matchesThisWeek: s.proposals, // closest real signal; send-based metrics are Phase 2
      emailsSent: s.opted_in, // placeholder — no send metrics until the comms service
    };
  },

  // Candidates — real (name + capability; contact only in detail).
  listCandidates: async () =>
    (await apiGet<Schemas["CandidateSummary"][]>("/candidates")).map(summaryToCandidate),
  getCandidate: async (id) =>
    detailToCandidate(await apiGet<Schemas["CandidateDetail"]>(`/candidates/${id}`)),
  getCandidateDetail: async (id) => {
    const d = await apiGet<Schemas["CandidateDetail"]>(`/candidates/${id}`);
    const detail: CandidateDetail = {
      candidate: detailToCandidate(d),
      resumeVersions: d.resumes.map((r) => ({
        version: r.version,
        uploaded: day(r.created_at),
        current: r.is_current,
        contentHash: r.content_hash,
        source: "", // placeholder — upload source not modeled
      })),
      activity: [], // placeholder — activity feed not modeled in Phase 1
    };
    return detail;
  },
  getReviewFlags: async (candidateId) => {
    const d = await apiGet<Schemas["CandidateDetail"]>(`/candidates/${candidateId}`);
    return d.review_flags.map(
      (f, i): ReviewFlag => ({
        id: `${candidateId}-${i}`,
        candidateId,
        severity: f.severity as FlagSeverity,
        category: f.code,
        detail: f.message,
        evidence: "", // advisory data-quality flag; no evidence span (not fraud detection)
      }),
    );
  },
  getProposalHistory: async (candidateId) => {
    const ps = await apiGet<Schemas["ProposalOut"][]>(
      `/proposals?candidate_id=${encodeURIComponent(candidateId)}`,
    );
    return ps.map(
      (p): Proposal => ({
        id: p.id,
        candidateId: p.candidate_id,
        client: "", // placeholder — client name not joined
        reqTitle: p.requisition_title ?? "",
        date: day(p.decided_at ?? p.created_at),
        outcome: p.outcome as ProposalOutcome,
        reason: p.reason ?? "",
      }),
    );
  },
  getImportQueue: async () =>
    phase2("getImportQueue", "the bulk-import review queue is not surfaced as a query yet"),

  // Requisitions & matching — real.
  listRequisitions: async () =>
    (await apiGet<Schemas["RequisitionOut"][]>("/requisitions")).map(requisitionToMock),
  getRequisition: async (id) =>
    requisitionToMock(await apiGet<Schemas["RequisitionOut"]>(`/requisitions/${id}`)),
  getJdSkills: async (reqId) => {
    const skills = await apiGet<Schemas["JdSkillOut"][]>(`/requisitions/${reqId}/skills`);
    return skills.map(
      (s): JdSkill => ({
        id: s.id,
        name: s.name,
        tier: s.tier as JdSkill["tier"],
        weight: s.weight,
        source: "added", // placeholder — provenance (extracted vs added) not tracked per row
        rank: s.sort_order,
      }),
    );
  },
  getJdCompleteness: async (reqId) => {
    const c = await apiGet<Schemas["JdCompletenessOut"]>(`/requisitions/${reqId}/completeness`);
    const out: JdCompleteness = {
      score: c.score,
      items: c.items.map((i) => ({ label: i.key, present: i.present, hint: i.hint })),
    };
    return out;
  },
  getTopMatches: async (reqId) => {
    const [res, cands] = await Promise.all([
      apiGet<Schemas["RequisitionMatchesOut"]>(`/requisitions/${reqId}/matches`),
      apiGet<Schemas["CandidateSummary"][]>("/candidates"),
    ]);
    const byId = new Map(cands.map((c) => [c.id, summaryToCandidate(c)]));
    return res.matches
      .map((m): MatchRow | null => {
        const candidate = byId.get(m.candidate_id);
        if (!candidate) return null;
        return {
          candidateId: m.candidate_id,
          reqId,
          fit: m.fit, // real
          coreMatched: m.matched.length, // approx — API returns matched names + missing_core
          coreTotal: m.matched.length + m.missing_core.length, // approx
          niceMatched: 0, // placeholder — exact core/nice split needs API enrichment
          niceTotal: 0, // placeholder
          flags: m.review_flag_count, // real
          rationale: "", // placeholder — transparent breakdown is on the detail view (Phase 2)
          candidate,
        };
      })
      .filter((m): m is MatchRow => m !== null);
  },
  getMatchDetail: async () =>
    phase2("getMatchDetail", "screening questions + sub-scores are the Phase 2 screening loop"),

  // Outreach — audience/consent is real; send + campaigns are not built.
  listCampaigns: async () =>
    phase2("listCampaigns", "campaigns require the email-send service (owner/counsel-gated)"),
  getEmailTemplates: async () =>
    phase2("getEmailTemplates", "templates require the email-send service (owner/counsel-gated)"),
  getAudience: async () => {
    const s = await apiGet<Schemas["OutreachStatsOut"]>("/outreach/stats");
    return {
      total: s.total_candidates,
      optedIn: s.opted_in,
      pending: s.pending,
      unsubscribed: s.unsubscribed,
      bySkill: [], // placeholder — skill breakdown not computed yet
    };
  },
  getOutreachStats: async () =>
    phase2("getOutreachStats", "send metrics (sent/opened/replied) require the comms service"),

  // Settings — plan + team.
  getPlan: async () => {
    const p = await apiGet<Schemas["PlanOut"]>("/plan");
    return {
      name: p.name,
      price: p.price,
      unit: p.unit,
      seats: 0, // placeholder — billing not wired (owner-gated)
      seatsUsed: 0, // placeholder
    };
  },
  listTeamMembers: async () => {
    const members = await apiGet<Schemas["TeamMemberOut"][]>("/team");
    return members.map((m) => ({
      id: m.id,
      name: "", // placeholder — display name not modeled on app_user yet
      email: m.email,
      role: "Recruiter" as const, // placeholder — role mapping not surfaced yet
      status: m.status as "active" | "invited",
    }));
  },
};
