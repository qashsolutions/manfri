-- 0003_storage_resumes.sql — Supabase Storage bucket for résumé originals (PII) with
-- org-scoped RLS. Supabase-only (skipped where there is no `storage` schema, e.g. local
-- Postgres). The server uploads via the service role (bypasses Storage RLS) under an
-- org-prefixed path; these policies are defence-in-depth so a user JWT is path-restricted
-- to its own org. The first path segment is the org_id (see web/lib/supabase/storage.ts).

insert into storage.buckets (id, name, public)
values ('resumes', 'resumes', false)
on conflict (id) do nothing;

drop policy if exists "resumes_org_select" on storage.objects;
create policy "resumes_org_select" on storage.objects
  for select to authenticated
  using (bucket_id = 'resumes' and (storage.foldername(name))[1] = (public.current_org_id())::text);

drop policy if exists "resumes_org_insert" on storage.objects;
create policy "resumes_org_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'resumes' and (storage.foldername(name))[1] = (public.current_org_id())::text);
