// Deterministic fake-résumé / plausibility checks (advisory only — never auto-reject;
// never folded into the fit score). Computed at ingest from the parsed (non-PII) fields,
// extending the existing data-quality review-flags pattern. The optional LLM pass lives
// in web/lib/ai/authenticity.ts. Duplicate detection needs a DB query, so the flag is
// produced in the ingest pipeline via `duplicateResumeFlag`.

import { reviewFlags } from "@/lib/domain/match";
import type { DateRange } from "@/lib/domain/parse";

export interface AuthenticityFlag {
  code: string;
  severity: "low" | "medium" | "high";
  message: string;
}

// "implausible experience-vs-skill-count": ≥20 distinct skills AND more than 4 skills per
// year of experience (or experience unknown). Catches the "10 yrs + 55 skills" case.
const SKILLS_FLOOR = 20;
const SKILLS_PER_YEAR = 4;
// Timeline overlap slack (years) before flagging overlapping/inflated dated roles.
const OVERLAP_SLACK = 2;

export function deterministicAuthenticityFlags(parsed: Record<string, unknown> | null | undefined): AuthenticityFlag[] {
  if (!parsed) return [];
  const flags: AuthenticityFlag[] = [];
  const skills = (parsed.skills as string[] | undefined) ?? [];
  const years = (parsed.total_experience_years as number | null | undefined) ?? null;

  if (skills.length >= SKILLS_FLOOR && (years === null || skills.length > years * SKILLS_PER_YEAR)) {
    flags.push({
      code: "implausible_skill_breadth",
      severity: "medium",
      message: `${skills.length} distinct skills claimed${years !== null ? ` against ~${years} years of experience` : ""} — verify depth, not just breadth.`,
    });
  }

  const ranges = ((parsed.date_ranges as DateRange[] | undefined) ?? []).filter((r) => Number.isFinite(r.start));
  if (ranges.length >= 2) {
    const anchor = Math.max(...ranges.flatMap((r) => [r.start, r.end ?? 0]));
    const norm = ranges.map((r) => ({ start: r.start, end: r.end ?? anchor }));
    const sumLen = norm.reduce((a, r) => a + Math.max(0, r.end - r.start), 0);
    const span = Math.max(...norm.map((r) => r.end)) - Math.min(...norm.map((r) => r.start));
    if (sumLen > span + OVERLAP_SLACK) {
      flags.push({
        code: "overlapping_timeline",
        severity: "medium",
        message: `Dated roles total ~${sumLen} years within a ${span}-year window — overlapping or inflated timeline; clarify concurrent roles.`,
      });
    }
  }
  return flags;
}

export function duplicateResumeFlag(otherCandidateId: string): AuthenticityFlag {
  return {
    code: "duplicate_resume",
    severity: "high",
    message: `Identical résumé content already exists for another candidate in this org (${otherCandidateId.slice(0, 8)}…) — possible duplicate or recycled résumé.`,
  };
}

// Data-quality review flags (computed fresh) + persisted authenticity flags (from ingest),
// surfaced together for the recruiter. Same {code, severity, message} shape throughout.
export function allAdvisoryFlags(parsed: Record<string, unknown> | null | undefined): AuthenticityFlag[] {
  const persisted = (parsed?.authenticity as AuthenticityFlag[] | undefined) ?? [];
  return [...reviewFlags(parsed), ...persisted];
}
