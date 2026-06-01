// Row/result types for the lean schema (mirror of migrations/0001_lean_baseline.sql).
// Hand-authored to keep the foundation dependency-light; query functions in
// queries.ts return these shapes.

export type ConsentState = "pending" | "opted_in" | "unsubscribed";
export type CandidateStatus = "new" | "contacted" | "screening" | "submitted";
export type RequisitionStatus = "open" | "on_hold" | "filled";
export type ProposalOutcome = "proposed" | "interviewing" | "rejected" | "hired";
export type SkillTier = "core" | "nice";

/** Headline counts for one org's dashboard (all RLS-scoped). */
export interface DashboardStats {
  candidates: number;
  requisitions: number;
  openRequisitions: number;
  proposals: number;
  optedIn: number;
}

/** One candidate row joined with its current résumé's skills + résumé count. */
export interface CandidateRow {
  id: string;
  name: string | null;
  email: string | null;
  status: CandidateStatus;
  consentState: ConsentState;
  createdAt: Date;
  skills: string[];
  resumeCount: number;
}
