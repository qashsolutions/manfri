// Optional LLM authenticity pass (advisory). Toggleable via AI_AUTHENTICITY=1 (off by
// default for cost). Uses the cheap/fast Gemini model to flag likely fabrication/inflation
// signals from the parsed (non-PII) fields. Returns [] on disabled/no-key/timeout/error so
// ingest always succeeds with the deterministic flags.

import { generateObject } from "ai";
import { z } from "zod";

import type { AuthenticityFlag } from "@/lib/domain/authenticity";
import { AI_TIMEOUT_MS, getModel } from "@/lib/ai/model";

const Schema = z.object({
  flags: z
    .array(
      z.object({
        severity: z.enum(["low", "medium", "high"]),
        message: z.string().describe("a short advisory note about a possible inflation/fabrication signal"),
      }),
    )
    .max(5),
});

export function llmAuthenticityEnabled(): boolean {
  return process.env.AI_AUTHENTICITY === "1";
}

export async function llmAuthenticityFlags(parsed: Record<string, unknown>): Promise<AuthenticityFlag[]> {
  if (!llmAuthenticityEnabled()) return [];
  const model = getModel("fast");
  if (!model) return [];
  try {
    const { object } = await generateObject({
      model,
      schema: Schema,
      abortSignal: AbortSignal.timeout(AI_TIMEOUT_MS),
      prompt: [
        "These are NON-PII parsed signals from a résumé. Flag only *advisory* signals of likely",
        "skill inflation or fabrication (e.g. breadth implausible for the experience, contradictory",
        "dates, generic/templated phrasing). Be conservative; do not accuse. Return at most 5.",
        "",
        `skills: ${JSON.stringify((parsed.skills as string[] | undefined) ?? [])}`,
        `total_experience_years: ${JSON.stringify(parsed.total_experience_years ?? null)}`,
        `date_ranges: ${JSON.stringify(parsed.date_ranges ?? [])}`,
        `text_chars: ${JSON.stringify((parsed.stats as { text_chars?: number } | undefined)?.text_chars ?? 0)}`,
      ].join("\n"),
    });
    return object.flags.map((f) => ({ code: "llm_authenticity", severity: f.severity, message: f.message }));
  } catch {
    return [];
  }
}
