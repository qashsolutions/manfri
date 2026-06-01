-- 0004_screen_questions.sql — cache for generated screening question sets, keyed on
-- (candidate, requisition). `input_hash` (a hash of the résumé skills + JD + generator)
-- lets a read detect staleness and regenerate when the résumé/JD/model changes.
-- RLS-scoped like every tenant table. No BEGIN/COMMIT (the migrate runner wraps each file).

create table public.screen_question_set (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references public.organization(id) on delete cascade,
  candidate_id   uuid not null references public.candidate(id) on delete cascade,
  requisition_id uuid not null references public.requisition(id) on delete cascade,
  input_hash     text not null,
  model_id       text not null,
  questions      jsonb not null,
  created_at     timestamptz not null default now(),
  unique (candidate_id, requisition_id)
);
create index on public.screen_question_set(org_id);

alter table public.screen_question_set enable row level security;
alter table public.screen_question_set force  row level security;
create policy tenant_isolation on public.screen_question_set
  using (org_id = public.current_org_id())
  with check (org_id = public.current_org_id());

do $$
declare
  r text;
begin
  foreach r in array array['manfriday_authenticated', 'authenticated', 'service_role'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('grant select, insert, update, delete on public.screen_question_set to %I', r);
    end if;
  end loop;
end $$;
