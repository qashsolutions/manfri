"use server";

import { revalidatePath } from "next/cache";

import { apiSend } from "@/lib/server/internal-api";
import type { SkillInput } from "@/app/requisitions/[id]/types";

// Persist the recruiter-confirmed CORE/NICE rubric (reorder + reweight + tier) via the
// existing PUT /api/v1/requisitions/{id}/skills route, then refresh so matches re-rank.
// Called from the SkillsEditor client component.
export async function saveSkillsAction(reqId: string, skills: SkillInput[]): Promise<void> {
  const normalized = skills.map((s, i) => ({
    name: s.name,
    tier: s.tier,
    weight: s.weight,
    sort_order: i,
  }));
  await apiSend("PUT", `/api/v1/requisitions/${reqId}/skills`, { skills: normalized });
  revalidatePath(`/requisitions/${reqId}`);
}
