// LLM screening-question generation via the Vercel AI SDK (Gemini). generateObject with
// a Zod schema enforces exactly 5 SIMPLE + 5 MEDIUM + 5 HARD questions, each with a model
// answer key, grounded in the candidate's parsed résumé skills ∩ the JD. Returns null on
// no-key/timeout/validation failure so the caller falls back to deterministic questions.

import { generateObject } from "ai";
import { z } from "zod";

import type { QuestionInputs, ScreenQ } from "@/lib/domain/questions";
import { AI_TIMEOUT_MS, getModel } from "@/lib/ai/model";

const QA = z.object({
  q: z.string().describe("the screening question"),
  answer: z.string().describe("a concise model answer key the recruiter screens against"),
});
const Schema = z.object({
  simple: z.array(QA).length(5).describe("5 single-concept recall questions"),
  medium: z.array(QA).length(5).describe("5 apply-a-concept / combine-facts questions"),
  hard: z.array(QA).length(5).describe("5 open-ended design/judgment questions"),
});

function prompt(input: QuestionInputs): string {
  return [
    `You are helping a recruiter screen a candidate for the role "${input.jdTitle}".`,
    `Required (CORE) skills: ${input.jdCore.join(", ") || "(none specified)"}.`,
    `Nice-to-have skills: ${input.jdNice.join(", ") || "(none)"}.`,
    `The candidate's résumé evidences these skills: ${input.resumeSkills.join(", ") || "(none parsed)"}.`,
    `Estimated experience: ${input.experienceYears ?? "unknown"} years.`,
    "",
    "Generate screening questions grounded in the intersection of the JD and the résumé",
    "(prefer CORE skills the candidate actually claims). Tiers: SIMPLE = single-concept recall;",
    "MEDIUM = apply a concept / combine 2–3 facts; HARD = open-ended design/judgment under constraints.",
    "Each question gets a concise model answer key. Do not invent résumé facts not implied above.",
  ].join("\n");
}

export async function llmQuestions(input: QuestionInputs): Promise<ScreenQ[] | null> {
  const model = getModel("capable");
  if (!model) return null;
  try {
    const { object } = await generateObject({
      model,
      schema: Schema,
      prompt: prompt(input),
      abortSignal: AbortSignal.timeout(AI_TIMEOUT_MS),
    });
    return [
      ...object.simple.map((x) => ({ tier: "Simple" as const, q: x.q, answer: x.answer })),
      ...object.medium.map((x) => ({ tier: "Medium" as const, q: x.q, answer: x.answer })),
      ...object.hard.map((x) => ({ tier: "Hard" as const, q: x.q, answer: x.answer })),
    ];
  } catch {
    return null; // timeout / model error / schema mismatch → caller falls back
  }
}
