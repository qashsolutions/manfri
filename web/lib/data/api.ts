// API provider — the real (TypeScript-on-Supabase) data source for production
// (DATA_SOURCE=api). Server-only. Calls the /api/v1/* route handlers, which resolve the
// org from the verified Supabase session and query Postgres under RLS.
//
// Wired (ported from services/api, EXTRACTION_REPORT): dashboard stats, candidates list +
// detail + review flags + proposal history, requisitions list/detail + JD skills +
// completeness + transparent matches, outreach audience (consent), plan + team. Net-new
// methods (screening Q&A, import queue, campaigns/templates/send metrics) still THROW a
// clear "later step" error — they are not faked.

import { cookies } from "next/headers";

import type {
  Audience,
  Campaign,
  Candidate,
  CandidateDetail,
  CandidateStatus,
  FlagSeverity,
  JdCompleteness,
  JdSkill,
  MatchDetail,
  Plan,
  Proposal,
  Requisition,
  ResumeVersion,
  ReviewFlag,
  Stats,
  TeamMember,
} from "../sample-data";
import type { DataProvider, MatchRow } from "./contract";

function appBase(): string {
  if (process.env.APP_BASE_URL) return process.env.APP_BASE_URL;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3000";
}

async function internalGet<T>(path: string): Promise<T> {
  const jar = await cookies();
  const res = await fetch(`${appBase()}${path}`, { cache: "no-store", headers: { cookie: jar.toString() } });
  if (!res.ok) throw new Error(`lib/data api: GET ${path} -> ${res.status} ${res.statusText}`);
  return (await res.json()) as T;
}

function laterStep(method: string): never {
  throw new Error(
    `lib/data: "${method}" is not wired in the TS-on-Supabase rebuild yet (deferred). ` +
      `Use DATA_SOURCE=mock for the full UI.`,
  );
}

// The rich candidate-detail response (one endpoint feeds three display shapes).
interface CandidateDetailApi {
  id: string;
  external_ref: string | null;
  status: string;
  consent_state: string;
  consent_source: string | null;
  created_at: string;
  contact: { name: string | null; email: string | null; phone: string | null };
  skills: string[];
  experience_years: number | null;
  resumes: Array<{
    id: string;
    version: number;
    content_hash: string;
    content_type: string | null;
    is_current: boolean;
    parsed: boolean;
    created_at: string;
  }>;
  review_flags: Array<{ code: string; severity: string; message: string }>;
}

const day = (iso: string): string => iso.slice(0, 10);

function detailToCandidate(d: CandidateDetailApi): Candidate {
  return {
    id: d.id,
    name: d.contact.name ?? d.external_ref ?? "—",
    title: "",
    location: "",
    email: d.contact.email ?? "",
    skills: d.skills,
    status: d.status as CandidateStatus,
    resumeVersions: d.resumes.length,
    lastActivity: day(d.created_at),
    consent: d.consent_state === "opted_in",
  };
}

export const apiProvider: DataProvider = {
  // Dashboard
  getStats: () => internalGet<Stats>("/api/v1/stats"),

  // Candidates
  listCandidates: () => internalGet<Candidate[]>("/api/v1/candidates"),
  getCandidate: async (id) => detailToCandidate(await internalGet<CandidateDetailApi>(`/api/v1/candidates/${id}`)),
  getCandidateDetail: async (id): Promise<CandidateDetail> => {
    const d = await internalGet<CandidateDetailApi>(`/api/v1/candidates/${id}`);
    return {
      phone: d.contact.phone ?? "",
      workAuth: "", // not modeled in Phase 1
      availability: "",
      desiredComp: "",
      summary: "",
      resumeVersions: d.resumes.map(
        (r): ResumeVersion => ({
          version: r.version,
          filename: "",
          uploadedAt: day(r.created_at),
          sizeKb: 0,
          isCurrent: r.is_current,
          contentHash: r.content_hash,
        }),
      ),
      activity: [],
      consentSource: d.consent_source ?? "",
      consentUpdated: "",
    };
  },
  getReviewFlags: async (candidateId) => {
    const d = await internalGet<CandidateDetailApi>(`/api/v1/candidates/${candidateId}`);
    return d.review_flags.map((f): ReviewFlag => ({ severity: f.severity as FlagSeverity, label: f.code, detail: f.message }));
  },
  getProposalHistory: (candidateId) =>
    internalGet<Proposal[]>(`/api/v1/proposals?candidate_id=${encodeURIComponent(candidateId)}`),

  // Requisitions & matching
  listRequisitions: () => internalGet<Requisition[]>("/api/v1/requisitions"),
  getRequisition: (id) => internalGet<Requisition>(`/api/v1/requisitions/${id}`),
  getJdSkills: (reqId) => internalGet<JdSkill[]>(`/api/v1/requisitions/${reqId}/skills`),
  getJdCompleteness: (reqId) => internalGet<JdCompleteness>(`/api/v1/requisitions/${reqId}/completeness`),
  getTopMatches: (reqId) => internalGet<MatchRow[]>(`/api/v1/requisitions/${reqId}/matches`),
  getMatchDetail: (reqId, candidateId) => {
    const qs = new URLSearchParams();
    if (reqId) qs.set("requisition_id", reqId);
    if (candidateId) qs.set("candidate_id", candidateId);
    const q = qs.toString();
    return internalGet<MatchDetail>(`/api/v1/screening${q ? `?${q}` : ""}`);
  },

  // Outreach (audience/consent + campaign list; templates + open/reply metrics deferred)
  getAudience: () => internalGet<Audience>("/api/v1/outreach/audience"),
  listCampaigns: () => internalGet<Campaign[]>("/api/v1/campaigns"),
  // Outreach (audience/consent only; send + metrics deferred)
  getAudience: () => internalGet<Audience>("/api/v1/outreach/audience"),

  // Settings
  getPlan: () => internalGet<Plan>("/api/v1/plan"),
  listTeamMembers: () => internalGet<TeamMember[]>("/api/v1/team"),

  // ── Net-new (deferred): throw clear "later step" errors, never faked ──
  getImportQueue: () => laterStep("getImportQueue"),
  listCampaigns: () => laterStep("listCampaigns"),
  getEmailTemplates: () => laterStep("getEmailTemplates"),
  getOutreachStats: () => laterStep("getOutreachStats"),
};
