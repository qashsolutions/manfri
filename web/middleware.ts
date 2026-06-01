// Refreshes the Supabase Auth session cookies on each request (the @supabase/ssr
// pattern), so server components / route handlers see a current session. No-ops when
// Supabase env isn't configured (e.g. DATA_SOURCE=mock dev).

import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";

export async function middleware(request: NextRequest): Promise<NextResponse> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const response = NextResponse.next({ request });
  if (!url || !anon) return response; // mock/dev: nothing to refresh

  const supabase = createServerClient(url, anon, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
        for (const { name, value, options } of cookiesToSet) {
          request.cookies.set(name, value);
          response.cookies.set(name, value, options);
        }
      },
    },
  });
  await supabase.auth.getUser();
  return response;
}

export const config = {
  // Run on app routes; skip static assets and the health probe.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/health).*)"],
};
