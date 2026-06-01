"use server";

import { revalidatePath } from "next/cache";

import { apiSend } from "@/lib/server/internal-api";

// Create a candidate from the /candidates intake form, then refresh the list so the new
// row appears. PII (name/email) goes through the RLS-scoped POST /api/v1/candidates route.
export async function createCandidateAction(formData: FormData): Promise<void> {
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const consent_state = String(formData.get("consent_state") ?? "pending");
  if (!name && !email) return; // nothing to create
  await apiSend("POST", "/api/v1/candidates", {
    name: name || null,
    email: email || null,
    consent_state,
  });
  revalidatePath("/candidates");
}
