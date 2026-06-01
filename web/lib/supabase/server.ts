// Supabase server client bound to the Next.js cookie store (@supabase/ssr). Used by
// the login server action, the auth middleware, and the cookie-session branch of the
// org-context resolver. Reads/writes the HttpOnly auth cookies so the recruiter's
// session persists across requests.

import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";

function env(): { url: string; anon: string } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) {
    throw new Error("Supabase env missing: NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY");
  }
  return { url, anon };
}

export async function createSupabaseServerClient() {
  const { url, anon } = env();
  const cookieStore = await cookies();
  return createServerClient(url, anon, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
        try {
          for (const { name, value, options } of cookiesToSet) cookieStore.set(name, value, options);
        } catch {
          // setAll called from a Server Component — safe to ignore; middleware refreshes cookies.
        }
      },
    },
  });
}
