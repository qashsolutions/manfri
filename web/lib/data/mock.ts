// Mock provider — serves the synthetic fixtures from sample-data.ts.
// This is the default source in dev / staging / Vercel preview (DATA_SOURCE unset
// or "mock"). No real PII ever flows through here.

import {
  audience,
  campaigns,
  candidateDetail,
  candidates,
  emailTemplates,
  importQueue,
  jdCompleteness,
  jdSkills,
  matchDetail,
  outreachStats,
  plan,
  proposalHistory,
  requisitions,
  reviewFlags,
  stats,
  teamMembers,
  topMatches,
} from "../sample-data";
import type { DataProvider, MatchRow } from "./contract";

export const mockProvider: DataProvider = {
  getStats: async () => stats,

  listCandidates: async () => candidates,
  getCandidate: async (id) => candidates.find((c) => c.id === id) ?? null,
  getCandidateDetail: async () => candidateDetail,
  getReviewFlags: async () => reviewFlags,
  getProposalHistory: async () => proposalHistory,
  getImportQueue: async () => importQueue,

  listRequisitions: async () => requisitions,
  getRequisition: async (id) => requisitions.find((r) => r.id === id) ?? null,
  getJdSkills: async () => jdSkills,
  getJdCompleteness: async () => jdCompleteness,
  getTopMatches: async () =>
    topMatches
      .map((m): MatchRow | null => {
        const candidate = candidates.find((c) => c.id === m.candidateId);
        return candidate ? { ...m, candidate } : null;
      })
      .filter((m): m is MatchRow => m !== null),
  getMatchDetail: async () => matchDetail,

  listCampaigns: async () => campaigns,
  getEmailTemplates: async () => emailTemplates,
  getAudience: async () => audience,
  getOutreachStats: async () => outreachStats,

  getPlan: async () => plan,
  listTeamMembers: async () => teamMembers,
};
