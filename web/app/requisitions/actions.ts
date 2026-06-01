"use server";

import { redirect } from "next/navigation";

import { apiSend } from "@/lib/server/internal-api";

interface SuggestedSkill {
  name: string;
  tier: string;
  weight: number;
  sort_order: number;
}

// Create a requisition from the intake form. If a JD was pasted, run skill extraction and
// persist the CORE/NICE rubric (so completeness + matches reflect it), then open the detail.
export async function createRequisitionAction(formData: FormData): Promise<void> {
  const title = String(formData.get("title") ?? "").trim();
  if (!title) return;
  const jd_text = String(formData.get("jd_text") ?? "").trim() || null;

  const req = await apiSend<{ id: string }>("POST", "/api/v1/requisitions", {
    title,
    location: String(formData.get("location") ?? "").trim() || null,
    employment_type: String(formData.get("employment_type") ?? "").trim() || null,
    openings: Number(formData.get("openings") ?? 1) || 1,
    jd_text,
  });

  if (jd_text) {
    const { suggested } = await apiSend<{ suggested: SuggestedSkill[] }>(
      "POST",
      `/api/v1/requisitions/${req.id}/extract-skills`,
    );
    if (suggested.length > 0) {
      await apiSend("PUT", `/api/v1/requisitions/${req.id}/skills`, { skills: suggested });
    }
  }

  redirect(`/requisitions/${req.id}`);
}
