// Unsubscribe tokens — a self-contained, signed pointer to (org, candidate) so the public
// unsubscribe route needs no login and no lookup table. Format: base64url(payload).base64url(hmac),
// payload = "<orgId>:<candidateId>", hmac = HMAC-SHA256(payload, UNSUBSCRIBE_SECRET). Verify
// is constant-time. The secret never leaves the server; a tampered token simply fails to verify.

import { createHmac, timingSafeEqual } from "node:crypto";

function secret(): string {
  const s = process.env.UNSUBSCRIBE_SECRET;
  if (!s) throw new Error("UNSUBSCRIBE_SECRET is not set (required to sign/verify unsubscribe links).");
  return s;
}

const b64url = (b: Buffer): string => b.toString("base64url");

function hmac(payload: string): Buffer {
  return createHmac("sha256", secret()).update(payload).digest();
}

export function signUnsub(orgId: string, candidateId: string): string {
  const payload = `${orgId}:${candidateId}`;
  return `${b64url(Buffer.from(payload, "utf8"))}.${b64url(hmac(payload))}`;
}

export function verifyUnsub(token: string | null | undefined): { orgId: string; candidateId: string } | null {
  if (!token || typeof token !== "string") return null;
  const dot = token.indexOf(".");
  if (dot <= 0) return null;
  let payload: string;
  let sig: Buffer;
  try {
    payload = Buffer.from(token.slice(0, dot), "base64url").toString("utf8");
    sig = Buffer.from(token.slice(dot + 1), "base64url");
  } catch {
    return null;
  }
  const expected = hmac(payload);
  if (sig.length !== expected.length || !timingSafeEqual(sig, expected)) return null;
  const sep = payload.indexOf(":");
  if (sep <= 0) return null;
  const orgId = payload.slice(0, sep);
  const candidateId = payload.slice(sep + 1);
  if (!orgId || !candidateId) return null;
  return { orgId, candidateId };
}
