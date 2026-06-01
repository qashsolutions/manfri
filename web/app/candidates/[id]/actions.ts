"use server";

import { revalidatePath } from "next/cache";

import { apiSend } from "@/lib/server/internal-api";

// Upload a résumé: real <input type="file"> → FormData → base64 → the existing
// POST /api/v1/candidates/{id}/resumes pipeline (store in Storage + parse + version +
// authenticity flags). Refresh the detail page so the new version + parsed skills show.
export async function uploadResumeAction(formData: FormData): Promise<void> {
  const candidateId = String(formData.get("candidate_id") ?? "");
  const file = formData.get("file");
  if (!candidateId || !(file instanceof File) || file.size === 0) return;
  const content_b64 = Buffer.from(await file.arrayBuffer()).toString("base64");
  await apiSend("POST", `/api/v1/candidates/${candidateId}/resumes`, {
    filename: file.name,
    content_type: file.type || "application/octet-stream",
    content_b64,
  });
  revalidatePath(`/candidates/${candidateId}`);
}

// Record a consent event (opt-in / unsubscribe / pending). Updates the candidate flag +
// audit; the outreach audience counts then reflect it.
export async function recordConsentAction(formData: FormData): Promise<void> {
  const candidateId = String(formData.get("candidate_id") ?? "");
  const event = String(formData.get("event") ?? "");
  if (!candidateId || !event) return;
  await apiSend("POST", `/api/v1/candidates/${candidateId}/consent`, { event, source: "recruiter UI" });
  revalidatePath(`/candidates/${candidateId}`);
}

// Propose the candidate to one of the org's requisitions (human action, audited).
export async function createProposalAction(formData: FormData): Promise<void> {
  const candidateId = String(formData.get("candidate_id") ?? "");
  const requisition_id = String(formData.get("requisition_id") ?? "");
  const outcome = String(formData.get("outcome") ?? "proposed");
  const reason = String(formData.get("reason") ?? "").trim();
  if (!candidateId || !requisition_id) return;
  await apiSend("POST", "/api/v1/proposals", {
    candidate_id: candidateId,
    requisition_id,
    outcome,
    reason: reason || null,
  });
  revalidatePath(`/candidates/${candidateId}`);
}
