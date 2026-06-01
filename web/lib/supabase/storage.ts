// Supabase Storage access for résumé originals (PII). The server writes via the
// service-role client to a PRIVATE bucket under an ORG-PREFIXED path
// (`{org_id}/{candidate_id}/{content_hash}`); reads are server-mediated via short-lived
// signed URLs. Org isolation is enforced by the org-prefixed path (derived from the
// verified request org) AND a storage RLS policy keyed on the org_id JWT claim
// (migrations/0003) — DB RLS alone doesn't cover Storage objects.

import { createClient } from "@supabase/supabase-js";

export const RESUME_BUCKET = "resumes";

function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Supabase service env missing: NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
  }
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export function resumeObjectPath(orgId: string, candidateId: string, contentHash: string): string {
  return `${orgId}/${candidateId}/${contentHash}`;
}

/** Upload résumé bytes under the org-prefixed path; returns the storage path. */
export async function uploadResumeObject(
  orgId: string,
  candidateId: string,
  contentHash: string,
  bytes: Uint8Array,
  contentType: string | null,
): Promise<string> {
  const path = resumeObjectPath(orgId, candidateId, contentHash);
  const { error } = await serviceClient()
    .storage.from(RESUME_BUCKET)
    .upload(path, bytes, { contentType: contentType ?? "application/octet-stream", upsert: true });
  if (error) throw new Error(`storage upload failed: ${error.message}`);
  return path;
}

/** Short-lived signed URL for a résumé object (server-mediated read). */
export async function signedResumeUrl(path: string, expiresIn = 300): Promise<string> {
  const { data, error } = await serviceClient().storage.from(RESUME_BUCKET).createSignedUrl(path, expiresIn);
  if (error || !data) throw new Error(`signed url failed: ${error?.message ?? "unknown"}`);
  return data.signedUrl;
}
