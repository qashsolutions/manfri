// Screening-question types + a deterministic, skill-grounded fallback used when no LLM
// provider is configured (graceful degradation). Produces exactly 5 SIMPLE + 5 MEDIUM +
// 5 HARD questions, each with a model answer key, grounded in the JD's CORE/NICE skills
// and the candidate's parsed skills. The LLM path (web/lib/ai/questions.ts) returns the
// same shape with higher-quality, résumé-specific phrasing.

import { createHash } from "node:crypto";

export type Tier = "Simple" | "Medium" | "Hard";

export interface ScreenQ {
  tier: Tier;
  q: string;
  answer: string;
}

export interface QuestionInputs {
  jdTitle: string;
  jdCore: string[];
  jdNice: string[];
  resumeSkills: string[];
  experienceYears: number | null;
}

const uniq = (xs: string[]): string[] => [...new Set(xs.filter(Boolean))];

/** Stable hash of the inputs (+ generator id) so questions regenerate when résumé/JD/model changes. */
export function questionsInputHash(inputs: QuestionInputs, generator: string): string {
  const norm = {
    title: inputs.jdTitle,
    core: [...inputs.jdCore].sort(),
    nice: [...inputs.jdNice].sort(),
    skills: [...inputs.resumeSkills].sort(),
    years: inputs.experienceYears,
    generator,
  };
  return createHash("sha256").update(JSON.stringify(norm)).digest("hex");
}

export function deterministicQuestions(inputs: QuestionInputs): ScreenQ[] {
  // Grounding pool: JD core first, then the candidate's matched/claimed skills, then nice.
  const pool = uniq([...inputs.jdCore, ...inputs.resumeSkills, ...inputs.jdNice]);
  const focus = pool.length ? pool : [inputs.jdTitle || "the role's core stack"];
  const at = (i: number): string => focus[i % focus.length] as string;

  const out: ScreenQ[] = [];
  for (let i = 0; i < 5; i++) {
    const s = at(i);
    out.push({
      tier: "Simple",
      q: `Explain ${s}: what it is and a concrete way you've used it.`,
      answer: `A correct, concise definition of ${s} plus a specific first-hand example of using it.`,
    });
  }
  for (let i = 0; i < 5; i++) {
    const s = at(i);
    const s2 = at(i + 1);
    out.push({
      tier: "Medium",
      q: `Describe a problem you solved with ${s} (and ${s2} if relevant): your approach and the trade-offs.`,
      answer: `A real scenario applying ${s}, the alternatives considered, and a clear rationale for the chosen approach.`,
    });
  }
  for (let i = 0; i < 5; i++) {
    const s = at(i);
    out.push({
      tier: "Hard",
      q: `Design a production system for a ${inputs.jdTitle || "senior"} role that relies on ${s} under scale and failure constraints. Walk through the trade-offs.`,
      answer: `Sound architecture, failure modes, scaling/consistency trade-offs, and a justified role for ${s}.`,
    });
  }
  return out;
}
