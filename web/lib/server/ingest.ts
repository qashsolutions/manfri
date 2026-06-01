// Résumé ingestion + inline deterministic parse + advisory authenticity flags. Ports
// services/api/app/{ingestion,resumes}.py + parsing/pipeline.py (EXTRACTION_REPORT §3),
// minus the dropped parse_run. Validates (size cap + EICAR), stores bytes in Supabase
// Storage (org-prefixed), parses, computes ADVISORY authenticity flags (deterministic +
// cross-candidate duplicate + optional LLM), creates the immutable/versioned resume row
// (parsed_jsonb incl. an `authenticity` array), and writes an actor-attributed audit event.
// All RLS-scoped via withOrg. Authenticity is advisory — nothing here auto-rejects.

import { createHash } from "node:crypto";

import { withOrg } from "@manfriday/db";

import { llmAuthenticityFlags } from "@/lib/ai/authenticity";
import { deterministicAuthenticityFlags, duplicateResumeFlag } from "@/lib/domain/authenticity";
import { parseResumeBytes, toJsonb } from "@/lib/domain/parse";
import { uploadResumeObject } from "@/lib/supabase/storage";

export const MAX_RESUME_BYTES = 10 * 1024 * 1024; // 10 MiB
const EICAR = "EICAR-STANDARD-ANTIVIRUS-TEST-FILE"; // dev malware-scan sentinel

export class IngestRejectedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "IngestRejectedError";
  }
}

export interface IngestResult {
  resumeId: string;
  version: number;
  deduped: boolean;
  skillsFound: number;
  extractionMethod: string;
  authenticityFlags: number;
}

export async function ingestAndParseResume(opts: {
  orgId: string;
  candidateId: string;
  bytes: Uint8Array;
  contentType: string | null;
  filename: string | null;
  actorId?: string | null;
}): Promise<IngestResult> {
  const { orgId, candidateId, bytes, contentType, filename, actorId = null } = opts;
  if (bytes.length > MAX_RESUME_BYTES) throw new IngestRejectedError(`resume exceeds ${MAX_RESUME_BYTES} bytes`);
  if (Buffer.from(bytes).includes(EICAR)) throw new IngestRejectedError("malware signature detected");

  const contentHash = createHash("sha256").update(bytes).digest("hex");
  const storageUri = await uploadResumeObject(orgId, candidateId, contentHash, bytes, contentType);
  const parsed = await parseResumeBytes(bytes, contentType, filename);
  const parsedJsonb = toJsonb(parsed);

  // Authenticity (advisory) — deterministic + optional LLM run outside the tx (no long tx);
  // the duplicate check needs the RLS-scoped query, so it's added inside.
  const detFlags = deterministicAuthenticityFlags(parsedJsonb);
  const llmFlags = await llmAuthenticityFlags(parsedJsonb);

  return withOrg({ orgId }, async (sql) => {
    const existing = await sql<{ id: string; version: number }[]>`
      select id, version from resume where candidate_id = ${candidateId} and content_hash = ${contentHash} limit 1`;
    if (existing[0]) {
      return {
        resumeId: existing[0].id,
        version: existing[0].version,
        deduped: true,
        skillsFound: parsed.skills.length,
        extractionMethod: parsed.extraction_method,
        authenticityFlags: 0,
      };
    }

    // Cross-candidate duplicate within the org (same résumé bytes, different person).
    const dup = await sql<{ candidate_id: string }[]>`
      select candidate_id from resume where content_hash = ${contentHash} and candidate_id <> ${candidateId} limit 1`;
    const authenticity = [
      ...detFlags,
      ...(dup[0] ? [duplicateResumeFlag(dup[0].candidate_id)] : []),
      ...llmFlags,
    ];
    const finalJsonb = { ...parsedJsonb, authenticity };

    const maxRows = await sql<{ v: number }[]>`
      select coalesce(max(version), 0)::int as v from resume where candidate_id = ${candidateId}`;
    const version = (maxRows[0]?.v ?? 0) + 1;
    await sql`update resume set is_current = false where candidate_id = ${candidateId} and is_current`;
    const ins = await sql<{ id: string }[]>`
      insert into resume (org_id, candidate_id, version, content_hash, storage_uri, content_type, parsed_jsonb, is_current)
      values (${orgId}, ${candidateId}, ${version}, ${contentHash}, ${storageUri}, ${contentType}, ${sql.json(finalJsonb as never)}, true)
      returning id`;
    const resumeId = ins[0]!.id;
    await sql`insert into audit_event (org_id, actor_id, action, entity_type, entity_id, after_jsonb)
      values (${orgId}, ${actorId}, 'resume.ingested', 'resume', ${resumeId},
              ${sql.json({ content_hash: contentHash, version, skills_found: parsed.skills.length, authenticity_flags: authenticity.length })})`;
    return {
      resumeId,
      version,
      deduped: false,
      skillsFound: parsed.skills.length,
      extractionMethod: parsed.extraction_method,
      authenticityFlags: authenticity.length,
    };
  });
}
