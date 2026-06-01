"use server";

import { redirect } from "next/navigation";

import { createSupabaseServerClient } from "@/lib/supabase/server";

// Real email+password sign-in via Supabase Auth. On success the session cookies are
// set by the server client and the recruiter lands on the dashboard; the issued JWT
// carries org_id (from the access-token hook / app_metadata) which drives RLS.
export async function signInAction(formData: FormData): Promise<void> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) redirect("/login?error=" + encodeURIComponent("Email and password are required"));

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) redirect("/login?error=" + encodeURIComponent(error.message));
  redirect("/");
}
