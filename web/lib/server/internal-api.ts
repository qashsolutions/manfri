// Server-side caller for our own /api/v1/* routes from Server Actions — the WRITE twin of
// lib/data/api.ts's read `internalGet`. Forwards the caller's Supabase session cookie so the
// route resolves the org (resolveOrgContext → cookie session) and RLS scopes the write,
// exactly matching how the reads are authenticated/org-scoped. Server-only.

import { cookies } from "next/headers";

function appBase(): string {
  if (process.env.APP_BASE_URL) return process.env.APP_BASE_URL;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3000";
}

export async function apiSend<T = unknown>(method: string, path: string, body?: unknown): Promise<T> {
  const jar = await cookies();
  const res = await fetch(`${appBase()}${path}`, {
    method,
    cache: "no-store",
    headers: { cookie: jar.toString(), "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`lib/server api: ${method} ${path} -> ${res.status} ${txt.slice(0, 200)}`);
  }
  return (await res.json().catch(() => ({}))) as T;
}
