// Synthetic sample data for the ManFriday mockups (no real PII).
// One integrated product: résumé database + JD matching + outreach.

export type CandidateStatus = "new" | "contacted" | "screening" | "submitted";

export interface Candidate {
  id: string;
  name: string;
  title: string;
  location: string;
  email: string;
  skills: string[];
  status: CandidateStatus;
  resumeVersions: number;
  lastActivity: string;
  consent: boolean;
}

export const candidates: Candidate[] = [
  { id: "c1", name: "Amara Okafor", title: "Senior Backend Engineer", location: "Austin, TX", email: "amara.o@example.test", skills: ["Python", "PostgreSQL", "AWS"], status: "screening", resumeVersions: 2, lastActivity: "2h ago", consent: true },
  { id: "c2", name: "Devin Park", title: "Staff Frontend Engineer", location: "Remote (US)", email: "devin.park@example.test", skills: ["TypeScript", "React", "Next.js"], status: "contacted", resumeVersions: 1, lastActivity: "1d ago", consent: true },
  { id: "c3", name: "Lena Vasquez", title: "Data Platform Lead", location: "Chicago, IL", email: "lena.v@example.test", skills: ["Spark", "dbt", "Airflow"], status: "submitted", resumeVersions: 3, lastActivity: "3d ago", consent: true },
  { id: "c4", name: "Tomás Reyes", title: "DevOps Engineer", location: "Denver, CO", email: "tomas.r@example.test", skills: ["Kubernetes", "Terraform", "Go"], status: "new", resumeVersions: 1, lastActivity: "5h ago", consent: false },
  { id: "c5", name: "Priya Nair", title: "ML Engineer", location: "Seattle, WA", email: "priya.n@example.test", skills: ["PyTorch", "MLOps", "Python"], status: "contacted", resumeVersions: 2, lastActivity: "6h ago", consent: true },
  { id: "c6", name: "Jordan Blake", title: "Engineering Manager", location: "Remote (US)", email: "jordan.b@example.test", skills: ["Leadership", "Hiring", "Go"], status: "screening", resumeVersions: 1, lastActivity: "2d ago", consent: true },
  { id: "c7", name: "Sofia Marchetti", title: "Product Designer", location: "New York, NY", email: "sofia.m@example.test", skills: ["Figma", "Design Systems"], status: "new", resumeVersions: 1, lastActivity: "30m ago", consent: false },
  { id: "c8", name: "Wei Chen", title: "Security Engineer", location: "San Jose, CA", email: "wei.c@example.test", skills: ["AppSec", "Python", "Threat Modeling"], status: "submitted", resumeVersions: 2, lastActivity: "1w ago", consent: true },
];

export const statusLabel: Record<CandidateStatus, string> = {
  new: "New",
  contacted: "Contacted",
  screening: "Screening",
  submitted: "Submitted",
};

export function getCandidate(id: string): Candidate | undefined {
  return candidates.find((c) => c.id === id);
}

// ── Requisitions ────────────────────────────────────────────────────────────

export type ReqStatus = "open" | "on_hold" | "filled";

export interface Requisition {
  id: string;
  title: string;
  client: string;
  location: string;
  employmentType: string;
  openings: number;
  inPipeline: number;
  status: ReqStatus;
  postedAt: string;
}

export const reqStatusLabel: Record<ReqStatus, string> = {
  open: "Open",
  on_hold: "On hold",
  filled: "Filled",
};

export const requisitions: Requisition[] = [
  { id: "r1", title: "Senior Backend Engineer", client: "Northwind Robotics", location: "Austin, TX · Hybrid", employmentType: "Full-time", openings: 2, inPipeline: 14, status: "open", postedAt: "5d ago" },
  { id: "r2", title: "Staff Frontend Engineer", client: "Helios Health", location: "Remote (US)", employmentType: "Full-time", openings: 1, inPipeline: 9, status: "open", postedAt: "1w ago" },
  { id: "r3", title: "Data Platform Lead", client: "Atlas Freight", location: "Chicago, IL", employmentType: "Full-time", openings: 1, inPipeline: 6, status: "open", postedAt: "2w ago" },
  { id: "r4", title: "ML Engineer", client: "Helios Health", location: "Seattle, WA · Hybrid", employmentType: "Full-time", openings: 2, inPipeline: 11, status: "open", postedAt: "4d ago" },
  { id: "r5", title: "DevOps Engineer", client: "Northwind Robotics", location: "Denver, CO", employmentType: "Contract", openings: 1, inPipeline: 4, status: "on_hold", postedAt: "3w ago" },
  { id: "r6", title: "Security Engineer", client: "Vertex Pay", location: "San Jose, CA", employmentType: "Full-time", openings: 1, inPipeline: 3, status: "filled", postedAt: "1mo ago" },
];

// ── JD analysis (per requisition) ───────────────────────────────────────────

export interface JdSkill {
  name: string;
  tier: "core" | "nice";
  weight: number; // 0–1, recruiter-adjustable
}

// Weighted, reorderable skill set extracted from the JD (recruiter-confirmed).
export const jdSkills: JdSkill[] = [
  { name: "Python", tier: "core", weight: 0.92 },
  { name: "PostgreSQL", tier: "core", weight: 0.85 },
  { name: "Distributed systems", tier: "core", weight: 0.78 },
  { name: "AWS", tier: "core", weight: 0.6 },
  { name: "Kafka", tier: "nice", weight: 0.45 },
  { name: "Go", tier: "nice", weight: 0.35 },
  { name: "Terraform", tier: "nice", weight: 0.25 },
];

export interface CompletenessItem {
  label: string;
  present: boolean;
  hint?: string;
}

// How complete the JD is — drives a callout prompting the recruiter to fill gaps.
export const jdCompleteness = {
  score: 78,
  items: [
    { label: "Core skills specified", present: true },
    { label: "Seniority / years of experience", present: true },
    { label: "Location & remote policy", present: true },
    { label: "Responsibilities outlined", present: true },
    { label: "Required vs preferred split", present: true },
    { label: "Compensation range", present: false, hint: "Add a band to improve match quality and response rates." },
    { label: "Work authorization", present: false, hint: "Specify sponsorship to avoid mismatched matches." },
  ] as CompletenessItem[],
};

// ── Matching (candidate × requisition) ──────────────────────────────────────

export interface Match {
  candidateId: string;
  fit: number; // 0–100 composite (authenticity NOT folded in)
  coreCovered: number;
  coreTotal: number;
  flags: number; // count of advisory review areas
  topFlag?: string;
}

// Top candidates for requisition r1, ranked by fit.
export const topMatches: Match[] = [
  { candidateId: "c1", fit: 91, coreCovered: 4, coreTotal: 4, flags: 1, topFlag: "Employment gap" },
  { candidateId: "c5", fit: 84, coreCovered: 3, coreTotal: 4, flags: 0 },
  { candidateId: "c6", fit: 79, coreCovered: 3, coreTotal: 4, flags: 2, topFlag: "Skill not evidenced" },
  { candidateId: "c2", fit: 72, coreCovered: 2, coreTotal: 4, flags: 0 },
  { candidateId: "c8", fit: 68, coreCovered: 2, coreTotal: 4, flags: 1, topFlag: "Title scope unclear" },
];

// ── Review areas (advisory authenticity / red-flag signals) ─────────────────
// Advisory only — never auto-rejects, never folded into the fit score.

export type FlagSeverity = "high" | "medium" | "low";

export interface ReviewFlag {
  severity: FlagSeverity;
  label: string;
  detail: string;
}

export const reviewFlags: ReviewFlag[] = [
  { severity: "high", label: "Skill not evidenced", detail: "Kafka is listed but does not appear in any role description or project." },
  { severity: "medium", label: "Employment gap", detail: "14-month gap (2023–2024) with no explanation in the résumé." },
  { severity: "low", label: "Title scope unclear", detail: "“Staff” title at a 12-person company — verify scope during screening." },
];

// ── Proposal history (cross-org — a candidate may belong to several orgs) ────

export type ProposalOutcome = "proposed" | "interviewing" | "rejected" | "hired";

export interface Proposal {
  id: string;
  org: string;
  req: string;
  date: string;
  outcome: ProposalOutcome;
  reason?: string;
}

export const proposalOutcomeLabel: Record<ProposalOutcome, string> = {
  proposed: "Proposed",
  interviewing: "Interviewing",
  rejected: "Rejected",
  hired: "Hired",
};

export const proposalHistory: Proposal[] = [
  { id: "p1", org: "Acme Staffing", req: "Senior Backend Engineer · Northwind Robotics", date: "2026-05-20", outcome: "interviewing" },
  { id: "p2", org: "Bridge Talent", req: "Platform Engineer · Vertex Pay", date: "2026-03-11", outcome: "rejected", reason: "Comp expectations above the client's band" },
  { id: "p3", org: "Acme Staffing", req: "Backend Engineer · Atlas Freight", date: "2025-12-02", outcome: "rejected", reason: "Client wanted on-site; candidate is remote-only" },
];

// A candidate can appear in more than one organization's pool (consent-gated).
export const candidateOrgs = ["Acme Staffing", "Bridge Talent", "Northwind Robotics (direct)"];

// ── Candidate detail (representative depth data for the mockup) ──────────────

export interface ResumeVersion {
  version: number;
  filename: string;
  uploadedAt: string;
  sizeKb: number;
  isCurrent: boolean;
  contentHash: string;
}

export type ActivityType = "upload" | "email" | "status" | "note" | "consent";

export interface ActivityEvent {
  id: string;
  type: ActivityType;
  text: string;
  actor: string;
  when: string;
}

export interface CandidateDetail {
  phone: string;
  workAuth: string;
  availability: string;
  desiredComp: string;
  summary: string;
  resumeVersions: ResumeVersion[];
  activity: ActivityEvent[];
  consentSource: string;
  consentUpdated: string;
}

// One representative detail record, reused for any candidate in the mockup.
export const candidateDetail: CandidateDetail = {
  phone: "•••-•••-4821 (encrypted)",
  workAuth: "Authorized to work (US)",
  availability: "2 weeks",
  desiredComp: "$180k–$210k",
  summary:
    "Backend engineer with 9 years building high-throughput services. Strong in Python, PostgreSQL and distributed systems; led a payments platform migration to event-driven architecture.",
  resumeVersions: [
    { version: 2, filename: "resume_2026.pdf", uploadedAt: "2026-05-27", sizeKb: 184, isCurrent: true, contentHash: "sha256:9f3c…a12b" },
    { version: 1, filename: "resume_2025.pdf", uploadedAt: "2025-11-02", sizeKb: 161, isCurrent: false, contentHash: "sha256:1d77…e904" },
  ],
  activity: [
    { id: "a1", type: "email", text: "Sent “New backend roles” campaign", actor: "You", when: "2h ago" },
    { id: "a2", type: "status", text: "Moved to Screening", actor: "You", when: "1d ago" },
    { id: "a3", type: "upload", text: "Uploaded résumé v2 (encrypted, audited)", actor: "Candidate", when: "2d ago" },
    { id: "a4", type: "consent", text: "Opted in to role alerts", actor: "Candidate", when: "2d ago" },
    { id: "a5", type: "note", text: "Strong on system design — flagged for Atlas req", actor: "You", when: "3d ago" },
  ],
  consentSource: "Web form (role-alert opt-in)",
  consentUpdated: "2d ago",
};

// ── Bulk import queue ───────────────────────────────────────────────────────

export type ImportStatus = "queued" | "parsing" | "encrypting" | "done" | "review";

export interface ImportItem {
  id: string;
  filename: string;
  sizeKb: number;
  status: ImportStatus;
  candidate?: string;
}

export const importStatusLabel: Record<ImportStatus, string> = {
  queued: "Queued",
  parsing: "Parsing",
  encrypting: "Encrypting",
  done: "Imported",
  review: "Needs review",
};

export const importQueue: ImportItem[] = [
  { id: "i1", filename: "a_okafor_resume.pdf", sizeKb: 184, status: "done", candidate: "Amara Okafor" },
  { id: "i2", filename: "d_park_cv.pdf", sizeKb: 142, status: "done", candidate: "Devin Park" },
  { id: "i3", filename: "l_vasquez.docx", sizeKb: 96, status: "encrypting" },
  { id: "i4", filename: "t_reyes_2026.pdf", sizeKb: 203, status: "parsing" },
  { id: "i5", filename: "scan_004.pdf", sizeKb: 511, status: "review" },
  { id: "i6", filename: "p_nair_resume.pdf", sizeKb: 173, status: "queued" },
];

// ── Outreach (mass candidate email) ─────────────────────────────────────────

export type CampaignStatus = "sent" | "scheduled" | "draft";

export interface Campaign {
  id: string;
  name: string;
  subject: string;
  recipients: number;
  openRate: number; // 0–1
  replyRate: number; // 0–1
  status: CampaignStatus;
  when: string;
}

export const campaigns: Campaign[] = [
  { id: "cp1", name: "Backend talent — Q2 reactivation", subject: "New backend roles at our client partners", recipients: 412, openRate: 0.38, replyRate: 0.11, status: "sent", when: "2d ago" },
  { id: "cp2", name: "Frontend / React refresh", subject: "Staff Frontend role — interested?", recipients: 268, openRate: 0.41, replyRate: 0.14, status: "sent", when: "5d ago" },
  { id: "cp3", name: "Data & ML pipeline check-in", subject: "Are you open to new data roles?", recipients: 190, openRate: 0.33, replyRate: 0.09, status: "scheduled", when: "Tomorrow, 9:00 AM" },
  { id: "cp4", name: "Security engineers — net-new reqs", subject: "AppSec & security roles now open", recipients: 96, openRate: 0, replyRate: 0, status: "draft", when: "Not sent" },
];

export const campaignStatusLabel: Record<CampaignStatus, string> = {
  sent: "Sent",
  scheduled: "Scheduled",
  draft: "Draft",
};

export interface EmailTemplate {
  id: string;
  name: string;
  description: string;
}

export const emailTemplates: EmailTemplate[] = [
  { id: "t1", name: "New role intro", description: "Warm intro to a specific open req" },
  { id: "t2", name: "Re-engage past candidate", description: "Reconnect with prior pipeline" },
  { id: "t3", name: "Referral ask", description: "Ask strong candidates for referrals" },
];

export const mergeFields = ["{{first_name}}", "{{title}}", "{{top_skill}}", "{{recruiter_name}}"];

export const audience = {
  total: 2847,
  optedIn: 1204,
  pendingConsent: 1583,
  unsubscribed: 60,
};

export const outreachStats = {
  sent30d: 1240,
  avgOpenRate: "38%",
  avgReplyRate: "12%",
  unsubscribes30d: 9,
};

// ── Settings: plan, billing, team ───────────────────────────────────────────

// NOTE: pricing is a placeholder for the mockup — single integrated plan,
// per-seat. Confirm the real number with the owner.
export const plan = {
  name: "Team",
  price: "$29",
  unit: "/user/mo",
  seatsUsed: 6,
  seatsTotal: 8,
  renews: "Jun 28, 2026",
};

export type TeamRole = "Admin" | "Recruiter" | "Viewer";
export type MemberStatus = "active" | "invited";

export interface TeamMember {
  id: string;
  name: string;
  email: string;
  role: TeamRole;
  status: MemberStatus;
  twoFactor: boolean;
}

export const teamMembers: TeamMember[] = [
  { id: "u1", name: "Riya Sharma", email: "riya@acmestaffing.test", role: "Admin", status: "active", twoFactor: true },
  { id: "u2", name: "Marcus Lee", email: "marcus@acmestaffing.test", role: "Recruiter", status: "active", twoFactor: true },
  { id: "u3", name: "Dana Kim", email: "dana@acmestaffing.test", role: "Recruiter", status: "active", twoFactor: false },
  { id: "u4", name: "Sam Patel", email: "sam@acmestaffing.test", role: "Viewer", status: "invited", twoFactor: false },
];

export const stats = {
  candidates: 2847,
  activeReqs: 18,
  emailsSent30d: 1240,
  responseRate: "31%",
};

// ── Fit detail (one candidate matched against one requisition) ──────────────

export interface SubScore {
  label: string;
  weight: number; // 0–1
  score: number; // 0–100
  evidence: string;
}

export interface ScreeningQuestion {
  tier: "Simple" | "Medium" | "Hard";
  q: string;
}

export const matchDetail = {
  candidate: "Amara Okafor",
  candidateId: "c1",
  req: "Senior Backend Engineer · Northwind Robotics",
  reqId: "r1",
  coreSkills: ["Python", "PostgreSQL", "Distributed systems", "AWS"],
  niceSkills: ["Kafka", "Go", "Terraform"],
  subScores: [
    { label: "Core skill coverage", weight: 0.35, score: 92, evidence: "4/4 core skills evidenced in résumé v2" },
    { label: "Depth & recency", weight: 0.2, score: 84, evidence: "Python across 3 roles, most recent 2025–26" },
    { label: "Domain match", weight: 0.15, score: 70, evidence: "Payments / robotics adjacency" },
    { label: "Experience level", weight: 0.15, score: 88, evidence: "9 yrs vs 7+ required" },
    { label: "Nice-to-have coverage", weight: 0.15, score: 61, evidence: "2/3 preferred skills present" },
  ] as SubScore[],
  // Reported separately — advisory, never folded into the fit score above.
  reviewFlags: [
    { severity: "high", label: "Skill not evidenced", detail: "Kafka is listed but absent from every role description." },
    { severity: "medium", label: "Employment gap", detail: "14-month gap (2023–2024) not explained." },
  ] as ReviewFlag[],
  questions: [
    { tier: "Simple", q: "Walk through how you'd index a 50M-row Postgres table for a range query." },
    { tier: "Medium", q: "Describe a service you migrated to event-driven — what broke, and why?" },
    { tier: "Hard", q: "Design exactly-once processing across a partitioned queue. Trade-offs?" },
  ] as ScreeningQuestion[],
};
