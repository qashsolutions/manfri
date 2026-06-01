// Vercel AI SDK model selection. Default provider: Google Gemini (cheapest across the
// SIMPLE/MEDIUM/HARD tiers), via @ai-sdk/google. Models are env-overridable. When no
// provider key is set, getModel() returns null so callers fall back to deterministic
// behavior (graceful degradation — the non-LLM paths always work).

import { createGoogleGenerativeAI } from "@ai-sdk/google";

export type ModelTier = "fast" | "capable";

// @ai-sdk/google's own env var, with a GEMINI_API_KEY alias for convenience.
function apiKey(): string | undefined {
  return process.env.GOOGLE_GENERATIVE_AI_API_KEY ?? process.env.GEMINI_API_KEY;
}

export function aiEnabled(): boolean {
  return Boolean(apiKey());
}

function modelId(tier: ModelTier): string {
  // Defaults are current GA models (gemini-2.0-flash is being discontinued). Override via
  // env — this project uses gemini-3-flash-preview / gemini-3.1-flash-lite (see .env.local).
  if (tier === "fast") return process.env.AI_MODEL_FAST ?? "gemini-2.5-flash-lite"; // cheap authenticity pass
  return process.env.AI_MODEL_CAPABLE ?? "gemini-2.5-flash"; // recruiter-facing question generation
}

/** A Gemini model for the given tier, or null if no provider key is configured. */
export function getModel(tier: ModelTier) {
  const key = apiKey();
  if (!key) return null;
  const google = createGoogleGenerativeAI({ apiKey: key });
  return google(modelId(tier));
}

export function activeModelId(tier: ModelTier): string {
  return `${aiEnabled() ? "google" : "none"}:${modelId(tier)}`;
}

export const AI_TIMEOUT_MS = Number(process.env.AI_TIMEOUT_MS ?? 30_000);
