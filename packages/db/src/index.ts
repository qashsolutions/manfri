// @manfriday/db — the TypeScript data layer for the lean ManFriday backend on
// Supabase Postgres. Org isolation is Postgres RLS keyed on the `org_id` claim in
// the Supabase Auth JWT; `withOrg` sets that claim per transaction.

export { getSql, withOrg, closeSql } from "./client";
export type { Sql, OrgContext } from "./client";
export { dashboardStats, listCandidates } from "./queries";
export type {
  DashboardStats,
  CandidateRow,
  ConsentState,
  CandidateStatus,
  RequisitionStatus,
  ProposalOutcome,
  SkillTier,
} from "./schema";
