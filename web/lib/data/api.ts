// API provider — the real data source for production (DATA_SOURCE=api).
//
// Runs ONLY on the server: it reads the iron-session cookie and mints a 5-min EdDSA
// internal JWT per request (the browser never holds a FastAPI token), then calls the
// product endpoints. FastAPI verifies the JWT and sets the RLS GUCs from the verified
// claims (invariant #3). This module is imported unconditionally, but its methods run
// only when DATA_SOURCE=api — so dev/CI on the mock default never hit this path.
//
// It is an HONEST bridge from the compliant API shapes to the display types the mock
// UI was built against. Where a display field has no source in the Phase-1 API
// (free-text summary, work-auth, desired-comp, activity feed, campaign open-rates,
// per-candidate title/location) it is left EMPTY — never fabricated — pending a later
// pass that reshapes the UI to the redacted reality. Capabilities that genuinely
// aren't built yet THROW a clear error: screening Q&A + sub-scores (Phase 2),
// campaigns / templates / send-metrics (email-send, owner/counsel-gated), and the
// bulk-import review queue (no query endpoint yet).

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
  ResumeVersion,
  ReviewFlag,
  Stats,
  TeamMember,
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
const optedIn = (consentState: string): boolean => consentState === "opted_in";

// ── Adapters: compliant API shape → mock display type ─────────────────────────

function summaryToCandidate(s: Schemas["CandidateSummary"]): Candidate {
  return {
    id: s.id,
    name: s.name ?? s.external_ref ?? "—", // real: decrypted name for the owning org
    title: "", // not modeled on the candidate record in Phase 1
    location: "", // not modeled
    email: "", // contact PII is detail-only, never in the list
    skills: s.skills, // real (parsed)
    status: s.status as CandidateStatus, // real
    resumeVersions: 0, // count not carried in the summary
    lastActivity: day(s.created_at), // real (created)
    consent: optedIn(s.consent_state), // real
  };
}

function detailToCandidate(d: Schemas["CandidateDetail"]): Candidate {
  return {
    id: d.id,
    name: d.contact.name ?? d.external_ref ?? "—", // real
    title: "",
    location: "",
    email: d.contact.email ?? "", // real (decrypted, owning-org detail)
    skills: d.skills, // real
    status: d.status as CandidateStatus, // real
    resumeVersions: d.resumes.length, // real
    lastActivity: day(d.created_at), // real
    consent: optedIn(d.consent_state), // real
  };
}

function requisitionToMock(r: Schemas["RequisitionOut"]): Requisition {
  return {
    id: r.id,
    title: r.title, // real
    client: "", // client name not joined into this view
    location: r.location ?? "", // real
    employmentType: r.employment_type ?? "", // real
    openings: r.openings, // real
    inPipeline: 0, // proposal count not joined here
    status: r.status as ReqStatus, // real
    postedAt: day(r.created_at), // real
  };
}

// ── Provider ──────────────────────────────────────────────────────────────────

export const apiProvider: DataProvider = {
  // Dashboard — real counts; send metrics aren't built (left blank, not faked).
  getStats: async (): Promise<Stats> => {
    const s = await apiGet<Schemas["DashboardStats"]>("/dashboard/stats");
    return {
      candidates: s.candidates, // real
      activeReqs: s.open_requisitions, // real
      emailsSent30d: 0, // no send metrics until the comms service
      responseRate: "—", // no send metrics yet
    };
  },

  // Candidates — name + capability in the list; contact only in detail.
  listCandidates: async () =>
    (await apiGet<Schemas["CandidateSummary"][]>("/candidates")).map(summaryToCandidate),
  getCandidate: async (id) =>
    detailToCandidate(await apiGet<Schemas["CandidateDetail"]>(`/candidates/${id}`)),
  getCandidateDetail: async (id): Promise<CandidateDetail> => {
    const d = await apiGet<Schemas["CandidateDetail"]>(`/candidates/${id}`);
    return {
      phone: d.contact.phone ?? "", // real (decrypted, owning-org detail)
      workAuth: "", // not modeled in Phase 1
      availability: "", // not modeled
      desiredComp: "", // not modeled
      summary: "", // no free-text summary captured
      resumeVersions: d.resumes.map(
        (r): ResumeVersion => ({
          version: r.version, // real
          filename: "", // original filename not stored on the row
          uploadedAt: day(r.created_at), // real
          sizeKb: 0, // size not carried in the API
          isCurrent: r.is_current, // real
          contentHash: r.content_hash, // real
        }),
      ),
      activity: [], // activity feed not modeled in Phase 1
      consentSource: d.consent_source ?? "", // real
      consentUpdated: "", // timestamp not surfaced here
    };
  },
  getReviewFlags: async (candidateId) => {
    const d = await apiGet<Schemas["CandidateDetail"]>(`/candidates/${candidateId}`);
    return d.review_flags.map(
      (f): ReviewFlag => ({
        severity: f.severity as FlagSeverity, // real (advisory, data-quality only)
        label: f.code, // real
        detail: f.message, // real
      }),
    );
  },
  getProposalHistory: async (candidateId) => {
    const ps = await apiGet<Schemas["ProposalOut"][]>(
      `/proposals?candidate_id=${encodeURIComponent(candidateId)}`,
    );
    return ps.map(
      (p): Proposal => ({
        id: p.id, // real
        client: "", // client name not joined
        req: p.requisition_title ?? "", // real
        date: day(p.decided_at ?? p.created_at), // real
        outcome: p.outcome as ProposalOutcome, // real
        reason: p.reason ?? undefined, // real
      }),
    );
  },
  getImportQueue: async () =>
    phase2("getImportQueue", "the bulk-import review queue isn't exposed as a query yet"),

  // Requisitions & matching — real.
  listRequisitions: async () =>
    (await apiGet<Schemas["RequisitionOut"][]>("/requisitions")).map(requisitionToMock),
  getRequisition: async (id) =>
    requisitionToMock(await apiGet<Schemas["RequisitionOut"]>(`/requisitions/${id}`)),
  getJdSkills: async (reqId) => {
    const skills = await apiGet<Schemas["JdSkillOut"][]>(`/requisitions/${reqId}/skills`);
    return skills.map(
      (s): JdSkill => ({ name: s.name, tier: s.tier as JdSkill["tier"], weight: s.weight }),
    );
  },
  getJdCompleteness: async (reqId): Promise<JdCompleteness> => {
    const c = await apiGet<Schemas["JdCompletenessOut"]>(`/requisitions/${reqId}/completeness`);
    return {
      score: c.score, // real
      items: c.items.map((i) => ({ label: i.key, present: i.present, hint: i.hint })), // real
    };
  },
  getTopMatches: async (reqId) => {
    const [res, skills, cands] = await Promise.all([
      apiGet<Schemas["RequisitionMatchesOut"]>(`/requisitions/${reqId}/matches`),
      apiGet<Schemas["JdSkillOut"][]>(`/requisitions/${reqId}/skills`),
      apiGet<Schemas["CandidateSummary"][]>("/candidates"),
    ]);
    const coreTotal = skills.filter((s) => s.tier === "core").length;
    const byId = new Map(cands.map((c) => [c.id, summaryToCandidate(c)]));
    return res.matches
      .map((m): MatchRow | null => {
        const candidate = byId.get(m.candidate_id);
        if (!candidate) return null;
        return {
          candidateId: m.candidate_id, // real
          fit: m.fit, // real (transparent skill-overlap)
          coreCovered: coreTotal - m.missing_core.length, // real (derived)
          coreTotal, // real
          flags: m.review_flag_count, // real
          candidate,
        };
      })
      .filter((m): m is MatchRow => m !== null);
  },
  getMatchDetail: async () =>
    phase2("getMatchDetail", "screening questions + sub-scores are the Phase 2 screening loop"),

  // Outreach — audience/consent is real; campaigns/templates/send-metrics aren't built.
  listCampaigns: async () =>
    phase2("listCampaigns", "campaigns need the email-send service (owner/counsel-gated)"),
  getEmailTemplates: async () =>
    phase2("getEmailTemplates", "templates need the email-send service (owner/counsel-gated)"),
  getAudience: async () => {
    const s = await apiGet<Schemas["OutreachStatsOut"]>("/outreach/stats");
    return {
      total: s.total_candidates, // real
      optedIn: s.opted_in, // real
      pendingConsent: s.pending, // real
      unsubscribed: s.unsubscribed, // real
    };
  },
  getOutreachStats: async () =>
    phase2("getOutreachStats", "send metrics (sent/opened/replied) need the comms service"),

  // Settings — plan placeholder + team.
  getPlan: async () => {
    const p = await apiGet<Schemas["PlanOut"]>("/plan");
    return {
      name: p.name, // real (placeholder plan)
      price: p.price, // real (placeholder)
      unit: p.unit, // real
      seatsUsed: 0, // billing not wired (owner-gated)
      seatsTotal: 0, // billing not wired
      renews: "—", // billing not wired
    };
  },
  listTeamMembers: async () => {
    const members = await apiGet<Schemas["TeamMemberOut"][]>("/team");
    return members.map(
      (m): TeamMember => ({
        id: m.id, // real
        name: "", // display name not modeled on app_user yet
        email: m.email, // real
        role: "Recruiter", // role mapping not surfaced yet
        status: m.status as TeamMember["status"], // real
        twoFactor: false, // TOTP-enrolled flag not surfaced yet
      }),
    );
  },
};
