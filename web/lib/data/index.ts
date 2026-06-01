// Single data-access entry point for the UI. Pages import everything they need
// (data functions, domain types, label maps) from `@/lib/data` and never touch
// the provider implementations or the mock fixtures directly.
//
// The active source is chosen by the DATA_SOURCE env var:
//   - unset / "mock"  → synthetic fixtures (dev, staging, Vercel preview)
//   - "api"           → real FastAPI/Supabase data (production)
// Swapping environments is config, not code — no page changes.

import { apiProvider } from "./api";
import type { DataProvider } from "./contract";
import { mockProvider } from "./mock";

export const dataSource: "mock" | "api" =
  process.env.DATA_SOURCE === "api" ? "api" : "mock";

const provider: DataProvider = dataSource === "api" ? apiProvider : mockProvider;

// Explicit re-exports (not `export *`) so the active provider is the single
// source of these names and adding a method is a deliberate one-line change.
export const getStats = provider.getStats;
export const listCandidates = provider.listCandidates;
export const getCandidate = provider.getCandidate;
export const getCandidateDetail = provider.getCandidateDetail;
export const getReviewFlags = provider.getReviewFlags;
export const getProposalHistory = provider.getProposalHistory;
export const getImportQueue = provider.getImportQueue;
export const listRequisitions = provider.listRequisitions;
export const getRequisition = provider.getRequisition;
export const getJdSkills = provider.getJdSkills;
export const getJdCompleteness = provider.getJdCompleteness;
export const getTopMatches = provider.getTopMatches;
export const getMatchDetail = provider.getMatchDetail;
export const listCampaigns = provider.listCampaigns;
export const getEmailTemplates = provider.getEmailTemplates;
export const getAudience = provider.getAudience;
export const getOutreachStats = provider.getOutreachStats;
export const getPlan = provider.getPlan;
export const listTeamMembers = provider.listTeamMembers;

// Static domain config (identical in mock and prod — not "data").
export {
  campaignStatusLabel,
  importStatusLabel,
  mergeFields,
  proposalOutcomeLabel,
  reqStatusLabel,
  statusLabel,
} from "../sample-data";

// Domain types.
export type {
  ActivityEvent,
  ActivityType,
  Audience,
  Campaign,
  CampaignStatus,
  Candidate,
  CandidateDetail,
  CandidateStatus,
  CompletenessItem,
  EmailTemplate,
  FlagSeverity,
  ImportItem,
  ImportStatus,
  JdCompleteness,
  JdSkill,
  Match,
  MatchDetail,
  MemberStatus,
  OutreachStats,
  Plan,
  Proposal,
  ProposalOutcome,
  Requisition,
  ReqStatus,
  ResumeVersion,
  ReviewFlag,
  ScreeningQuestion,
  Stats,
  SubScore,
  TeamMember,
  TeamRole,
} from "../sample-data";
export type { DataProvider, MatchRow } from "./contract";
