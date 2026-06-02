"use server";

import { revalidatePath } from "next/cache";

import { apiSend } from "@/lib/server/internal-api";

// Create a campaign for a requisition (enqueues one send per consent-eligible candidate),
// then drive the resumable processor to drain the queue. Each /process call sends one batch
// (≤100); for small audiences this loop finishes them all inline. A very large audience would
// hit MAX_CHUNKS here and leave the rest `queued` — a cron hitting the same /process route
// drains the tail (resumable by design). v1 keeps it inline; the route is the seam for a cron.
const MAX_CHUNKS = 20; // up to ~2000 recipients drained synchronously

export async function createCampaignAction(formData: FormData): Promise<void> {
  const requisition_id = String(formData.get("requisition_id") ?? "").trim();
  const subject = String(formData.get("subject") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  if (!requisition_id || !subject || !body) return;

  const { id, queued } = await apiSend<{ id: string; queued: number }>("POST", "/api/v1/campaigns", {
    requisition_id,
    subject,
    body,
  });

  if (queued > 0) {
    for (let i = 0; i < MAX_CHUNKS; i++) {
      const { remaining } = await apiSend<{ remaining: number }>("POST", `/api/v1/campaigns/${id}/process`);
      if (remaining === 0) break;
    }
  }

  revalidatePath("/outreach");
}
