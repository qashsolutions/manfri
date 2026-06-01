// Deterministic matching, JD completeness, advisory review flags, and JD skill
// suggestion — ported from services/api/app/matching/{score,flags}.py and the
// extract-skills endpoint (EXTRACTION_REPORT §2/§3). Pure functions, no I/O.

import { findSkills } from "@/lib/domain/skills";

export const MATCHER_VERSION = "skill-overlap@1";

const CORE_SHARE = 0.8;
const NICE_SHARE = 0.2;

export interface JdSkillInput {
  name: string;
  tier: "core" | "nice";
  weight: number;
}

export interface SkillMatch {
  name: string;
  tier: string;
  weight: number;
  present: boolean;
}

export interface MatchBreakdown {
  fit: number; // 0..100, a documented weighted sum (not opaque)
  core_coverage: number;
  nice_coverage: number;
  matched: string[];
  missing_core: string[];
  skills: SkillMatch[];
}

function coverage(present: number, total: number): number {
  return total > 0 ? present / total : 0;
}

/** Transparent skill-overlap fit: 0.8·core_coverage + 0.2·nice_coverage (CORE dominates). */
export function scoreCandidate(candidateSkills: string[], jdSkills: JdSkillInput[]): MatchBreakdown {
  const present = new Set(candidateSkills.map((s) => s.toLowerCase()));
  let coreTotal = 0;
  let coreHave = 0;
  let niceTotal = 0;
  let niceHave = 0;
  const matched: string[] = [];
  const missingCore: string[] = [];
  const skills: SkillMatch[] = [];

  for (const { name, tier, weight } of jdSkills) {
    const isPresent = present.has(name.toLowerCase());
    skills.push({ name, tier, weight, present: isPresent });
    if (tier === "core") {
      coreTotal += weight;
      if (isPresent) coreHave += weight;
      else missingCore.push(name);
    } else {
      niceTotal += weight;
      if (isPresent) niceHave += weight;
    }
    if (isPresent) matched.push(name);
  }

  const coreCoverage = coverage(coreHave, coreTotal);
  const niceCoverage = coverage(niceHave, niceTotal);
  let fitFraction: number;
  if (coreTotal > 0 && niceTotal > 0) fitFraction = CORE_SHARE * coreCoverage + NICE_SHARE * niceCoverage;
  else if (coreTotal > 0) fitFraction = coreCoverage;
  else fitFraction = niceCoverage;

  return {
    fit: Math.round(fitFraction * 100),
    core_coverage: Number(coreCoverage.toFixed(4)),
    nice_coverage: Number(niceCoverage.toFixed(4)),
    matched,
    missing_core: missingCore,
    skills,
  };
}

// ── JD completeness (weighted checks summing to 100) ───────────────────────────
export interface CompletenessItem {
  key: string;
  present: boolean;
  hint: string;
}
export interface JdCompletenessResult {
  score: number;
  items: CompletenessItem[];
}

const COMPLETENESS_CHECKS: ReadonlyArray<readonly [string, number, string]> = [
  ["title", 15, "Add a clear job title."],
  ["location", 10, "Add a location or mark it remote."],
  ["employment_type", 10, "Specify employment type (full-time, contract, …)."],
  ["jd_text", 15, "Paste the full job description text."],
  ["core_skills", 30, "Add at least three CORE (must-have) skills."],
  ["nice_skills", 20, "Add at least one NICE-to-have skill."],
];

export function jdCompleteness(input: {
  title: string | null;
  location: string | null;
  employment_type: string | null;
  jd_text: string | null;
  core_skill_count: number;
  nice_skill_count: number;
}): JdCompletenessResult {
  const satisfied: Record<string, boolean> = {
    title: Boolean(input.title && input.title.trim()),
    location: Boolean(input.location && input.location.trim()),
    employment_type: Boolean(input.employment_type && input.employment_type.trim()),
    jd_text: Boolean(input.jd_text && input.jd_text.trim().length >= 200),
    core_skills: input.core_skill_count >= 3,
    nice_skills: input.nice_skill_count >= 1,
  };
  let score = 0;
  const items: CompletenessItem[] = [];
  for (const [key, weight, hint] of COMPLETENESS_CHECKS) {
    const present = satisfied[key] ?? false;
    if (present) score += weight;
    items.push({ key, present, hint });
  }
  return { score, items };
}

// ── Advisory data-quality review flags (never auto-reject, never folded into fit) ──
export interface ReviewFlag {
  code: string;
  severity: "low" | "medium" | "high";
  message: string;
}

const SPARSE_CHARS = 500;

export function reviewFlags(parsed: Record<string, unknown> | null | undefined): ReviewFlag[] {
  if (!parsed) return [];
  const flags: ReviewFlag[] = [];
  const contact = (parsed.contact ?? {}) as { has_email?: boolean; has_phone?: boolean };
  const stats = (parsed.stats ?? {}) as { text_chars?: number };
  const skills = parsed.skills as unknown[] | undefined;

  if (!contact.has_email && !contact.has_phone) {
    flags.push({ code: "no_contact", severity: "high", message: "No email or phone detected — outreach may not be possible." });
  }
  if (!skills || skills.length === 0) {
    flags.push({ code: "no_skills_detected", severity: "medium", message: "No recognized skills detected in the résumé text." });
  }
  if ((stats.text_chars ?? 0) < SPARSE_CHARS) {
    flags.push({ code: "sparse_resume", severity: "low", message: "Résumé text is very short — extracted detail may be incomplete." });
  }
  if (parsed.total_experience_years === null || parsed.total_experience_years === undefined) {
    flags.push({ code: "no_experience_signal", severity: "low", message: "No dates or durations found — experience could not be estimated." });
  }
  return flags;
}

// ── JD skill suggestion (advisory — every found skill suggested as core@1.0) ──────
export interface SuggestedSkill {
  name: string;
  tier: "core";
  weight: number;
  sort_order: number;
}

export function suggestJdSkills(jdText: string | null | undefined): SuggestedSkill[] {
  if (!jdText) return [];
  return findSkills(jdText).map((name, i) => ({ name, tier: "core" as const, weight: 1.0, sort_order: i }));
}
