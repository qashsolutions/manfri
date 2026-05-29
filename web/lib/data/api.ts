// API provider — the real data source for production (DATA_SOURCE=api).
//
// Not wired yet: the FastAPI product endpoints (candidates, requisitions, JD
// analysis, matching) don't exist — Phase 0 built the compliance spine, not the
// product surface. Until they do, every method throws a clear error so an
// accidental DATA_SOURCE=api fails loudly instead of silently.
//
// When the endpoints land, replace each `notWired(...)` with a typed fetch, e.g.:
//
//   import createClient from "openapi-fetch";
//   import type { paths } from "@manfriday/contracts";
//   const client = createClient<paths>({ baseUrl: process.env.API_BASE_URL });
//   listCandidates: async () => {
//     const { data, error } = await client.GET("/candidates");
//     if (error) throw error;
//     return data;
//   },
//
// Note: pages that use this provider must opt out of static generation
// (`export const dynamic = "force-dynamic"`), or the build will call these at
// build time. The mock provider has no such constraint.

import type { DataProvider } from "./contract";

function notWired(method: string): never {
  throw new Error(
    `lib/data: "${method}" has no API implementation yet. ` +
      "The FastAPI product endpoints aren't built — keep DATA_SOURCE=mock until they are.",
  );
}

export const apiProvider: DataProvider = {
  getStats: async () => notWired("getStats"),

  listCandidates: async () => notWired("listCandidates"),
  getCandidate: async () => notWired("getCandidate"),
  getCandidateDetail: async () => notWired("getCandidateDetail"),
  getReviewFlags: async () => notWired("getReviewFlags"),
  getProposalHistory: async () => notWired("getProposalHistory"),
  getCandidateOrgs: async () => notWired("getCandidateOrgs"),
  getImportQueue: async () => notWired("getImportQueue"),

  listRequisitions: async () => notWired("listRequisitions"),
  getRequisition: async () => notWired("getRequisition"),
  getJdSkills: async () => notWired("getJdSkills"),
  getJdCompleteness: async () => notWired("getJdCompleteness"),
  getTopMatches: async () => notWired("getTopMatches"),
  getMatchDetail: async () => notWired("getMatchDetail"),

  listCampaigns: async () => notWired("listCampaigns"),
  getEmailTemplates: async () => notWired("getEmailTemplates"),
  getAudience: async () => notWired("getAudience"),
  getOutreachStats: async () => notWired("getOutreachStats"),

  getPlan: async () => notWired("getPlan"),
  listTeamMembers: async () => notWired("listTeamMembers"),
};
