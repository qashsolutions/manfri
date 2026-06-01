-- 0002_pgvector_embedding.sql
-- pgvector embedding store for Phase-2 semantic / hybrid matching. The migrate
-- runner applies this only when the `vector` extension is available (Supabase has it;
-- it is also present on this dev box). RLS-governed by org_id like every tenant table,
-- so KNN can never match across orgs. Not used by the Phase-1 lexical matcher.

create extension if not exists vector;

create table public.embedding (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.organization(id) on delete cascade,
  owner_type text not null,           -- 'candidate' | 'requisition' | 'jd_skill' ...
  owner_id   uuid not null,
  model_id   text not null,
  dim        integer not null,
  vector     vector(1024) not null,
  created_at timestamptz not null default now()
);
create index on public.embedding(org_id);
create index ix_embedding_vector_hnsw
  on public.embedding using hnsw (vector vector_cosine_ops)
  with (m = 16, ef_construction = 64);

alter table public.embedding enable row level security;
alter table public.embedding force  row level security;
create policy tenant_isolation on public.embedding
  using (org_id = public.current_org_id())
  with check (org_id = public.current_org_id());

do $$
declare
  r text;
begin
  foreach r in array array['manfriday_authenticated','authenticated'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('grant select, insert, update, delete on public.embedding to %I', r);
    end if;
  end loop;
end $$;
