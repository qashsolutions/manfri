// The data-access contract. Both the mock and api providers implement this one
// interface, so they cannot drift — add a method here and TypeScript forces
// both providers to implement it. Pages import data only through `@/lib/data`.

import type {
  Audience,
  Campaign,
  Candidate,
  CandidateDetail,
  EmailTemplate,
  ImportItem,
  JdCompleteness,
  JdSkill,
  Match,
  MatchDetail,
  OutreachStats,
  Plan,
  Proposal,
  Requisition,
  ReviewFlag,
  Stats,
  TeamMember,
} from "../sample-data";

// A ranked match joined with its candidate (what a real /matches endpoint returns).
export type MatchRow = Match & { candidate: Candidate };

export interface DataProvider {
  // Dashboard
  getStats(): Promise<Stats>;

  // Candidates
  listCandidates(): Promise<Candidate[]>;
  getCandidate(id: string): Promise<Candidate | null>;
  getCandidateDetail(id: string): Promise<CandidateDetail>;
  getReviewFlags(candidateId: string): Promise<ReviewFlag[]>;
  getProposalHistory(candidateId: string): Promise<Proposal[]>;
  getImportQueue(): Promise<ImportItem[]>;

  // Requisitions & matching
  listRequisitions(): Promise<Requisition[]>;
  getRequisition(id: string): Promise<Requisition | null>;
  getJdSkills(reqId: string): Promise<JdSkill[]>;
  getJdCompleteness(reqId: string): Promise<JdCompleteness>;
  getTopMatches(reqId: string): Promise<MatchRow[]>;
  getMatchDetail(reqId?: string, candidateId?: string): Promise<MatchDetail>;

  // Outreach
  listCampaigns(): Promise<Campaign[]>;
  getEmailTemplates(): Promise<EmailTemplate[]>;
  getAudience(): Promise<Audience>;
  getOutreachStats(): Promise<OutreachStats>;

  // Settings
  getPlan(): Promise<Plan>;
  listTeamMembers(): Promise<TeamMember[]>;
}
