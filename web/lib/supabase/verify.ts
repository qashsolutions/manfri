// Verify a Supabase Auth access token (Bearer) and return the user. Used by the
// org-context resolver for server-to-server / API calls carrying a real Supabase JWT.
// Deliberately imports ONLY supabase-js (no next/headers) so it is safe to load
// outside a Next request scope (e.g. the live slice proof script).

import { createClient, type User } from "@supabase/supabase-js";

function env(): { url: string; anon: string } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) {
    throw new Error("Supabase env missing: NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY");
  }
  return { url, anon };
}

/** Verify a JWT with Supabase Auth; returns the user or null if invalid. */
export async function getUserFromBearer(token: string): Promise<User | null> {
  const { url, anon } = env();
  const sb = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await sb.auth.getUser(token);
  return error ? null : data.user;
}
