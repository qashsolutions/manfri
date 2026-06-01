-- 0001_lean_baseline.sql
-- ManFriday lean baseline — tenancy spine + product tables + RLS keyed on the
-- Supabase Auth JWT `org_id` claim. Portable: runs on local Postgres 16 AND on
-- Supabase. No BEGIN/COMMIT here — the migrate runner wraps each file in one tx.
--
-- Replaces the retired Python schema's non-BYPASSRLS role + `SET LOCAL app.current_org`
-- GUC pattern. DROPPED vs that schema: tenant_key, parse_run, scoring_run,
-- generation_run, score, consent_ledger (replaced by candidate.consent_state + audit log),
-- and the hash-chain columns on the audit table. Candidate PII is stored as plain
-- columns (no envelope encryption) — protected by RLS + Supabase at-rest encryption.

-- ── App role ──────────────────────────────────────────────────────────────────
-- Supabase ships a built-in `authenticated` role that RLS applies to. Locally we
-- create an equivalent non-superuser login role so RLS is actually exercised
-- (superusers bypass RLS). Grants below go to both when present.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'manfriday_authenticated') then
    create role manfriday_authenticated login password 'devpass' nosuperuser nobypassrls;
  end if;
end $$;

-- ── Claim helper ────────────────────────────────────────────────────────────────
-- The org_id from the verified JWT. On Supabase, PostgREST/Auth populate
-- `request.jwt.claims` from the access token (identical to auth.jwt()); the TS
-- backend sets the same GUC per transaction. Null/missing claim ⇒ NULL ⇒ no rows.
create or replace function public.current_org_id() returns uuid
  language sql
  stable
as $$
  -- org_id from the verified JWT: prefer a top-level `org_id` claim (set by the
  -- Supabase custom access-token hook from membership), and fall back to
  -- `app_metadata.org_id` (set on the user via the Admin API). Supporting both means
  -- the claim resolves whether or not the access-token hook is enabled on the project.
  select coalesce(
           nullif(c ->> 'org_id', ''),
           nullif(c -> 'app_metadata' ->> 'org_id', '')
         )::uuid
  from (
    select nullif(coalesce(current_setting('request.jwt.claims', true), ''), '')::jsonb as c
  ) s
$$;

-- ── Global lookup: role (NOT tenant-scoped, no RLS) ─────────────────────────────
create table public.role (
  id  uuid primary key default gen_random_uuid(),
  key text unique not null
);
insert into public.role (key) values ('recruiter'), ('agency_admin')
  on conflict (key) do nothing;

-- ── Tenant root ─────────────────────────────────────────────────────────────────
create table public.organization (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- ── Client (a company the agency serves; org-scoped) ────────────────────────────
create table public.client (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.organization(id) on delete cascade,
  name       text not null,
  is_self    boolean not null default false,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index on public.client(org_id);

-- ── App user (a recruiter, homed in one org; backed by a Supabase Auth user) ────
create table public.app_user (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references public.organization(id) on delete cascade,
  auth_user_id uuid unique,                 -- links to Supabase auth.users(id)
  email        text not null,
  status       text not null default 'active',
  created_at   timestamptz not null default now(),
  deleted_at   timestamptz,
  unique (org_id, email)
);
create index on public.app_user(org_id);

-- ── Membership (user ⇄ org with a role) ─────────────────────────────────────────
create table public.membership (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.organization(id) on delete cascade,
  user_id    uuid not null references public.app_user(id) on delete cascade,
  role_id    uuid not null references public.role(id),
  created_at timestamptz not null default now(),
  unique (org_id, user_id)
);
create index on public.membership(org_id);
create index on public.membership(user_id);

-- ── Candidate (org-scoped; PII as plain columns; simple consent flag) ───────────
create table public.candidate (
  id                 uuid primary key default gen_random_uuid(),
  org_id             uuid not null references public.organization(id) on delete cascade,
  external_ref       text,
  name               text,
  email              text,
  phone              text,
  email_normalized   text generated always as (lower(btrim(email))) stored,
  consent_state      text not null default 'pending'
                       check (consent_state in ('pending','opted_in','unsubscribed')),
  consent_source     text,
  consent_updated_at timestamptz,
  status             text not null default 'new'
                       check (status in ('new','contacted','screening','submitted')),
  created_at         timestamptz not null default now(),
  deleted_at         timestamptz
);
create index on public.candidate(org_id);
-- Within-org dedupe by normalized email (only when an email is present).
create unique index uq_candidate_org_email
  on public.candidate(org_id, email_normalized)
  where email_normalized is not null;

-- ── Resume (immutable, versioned) ───────────────────────────────────────────────
create table public.resume (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organization(id) on delete cascade,
  candidate_id  uuid not null references public.candidate(id) on delete cascade,
  version       integer not null,
  content_hash  text not null,
  storage_uri   text not null,
  content_type  text,
  parsed_jsonb  jsonb,
  is_current    boolean not null default true,
  superseded_by uuid references public.resume(id) on delete set null,
  created_at    timestamptz not null default now(),
  unique (candidate_id, version),
  unique (candidate_id, content_hash)
);
create index on public.resume(org_id);
create index on public.resume(candidate_id);
create unique index uq_resume_current_per_candidate
  on public.resume(candidate_id) where is_current;

-- ── Requisition (a job + its JD) ────────────────────────────────────────────────
create table public.requisition (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.organization(id) on delete cascade,
  client_id       uuid references public.client(id) on delete set null,
  title           text not null,
  location        text,
  employment_type text,
  openings        integer not null default 1,
  status          text not null default 'open'
                    check (status in ('open','on_hold','filled')),
  jd_text         text,
  created_at      timestamptz not null default now(),
  deleted_at      timestamptz
);
create index on public.requisition(org_id);

-- ── JD skill (the CORE/NICE weighted rubric the matcher reads) ──────────────────
create table public.jd_skill (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.organization(id) on delete cascade,
  requisition_id  uuid not null references public.requisition(id) on delete cascade,
  name            text not null,
  tier            text not null check (tier in ('core','nice')),
  weight          numeric not null default 1.0,
  sort_order      integer not null default 0
);
create index on public.jd_skill(org_id);
create index on public.jd_skill(requisition_id);

-- ── Proposal (candidate × req outcome) ──────────────────────────────────────────
create table public.proposal (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.organization(id) on delete cascade,
  candidate_id    uuid not null references public.candidate(id) on delete cascade,
  requisition_id  uuid not null references public.requisition(id) on delete cascade,
  outcome         text not null default 'proposed'
                    check (outcome in ('proposed','interviewing','rejected','hired')),
  reason          text,
  decided_by      uuid,
  decided_at      timestamptz,
  created_at      timestamptz not null default now()
);
create index on public.proposal(org_id);

-- ── Audit log (PLAIN append-only — no hash chain) ───────────────────────────────
create table public.audit_event (
  id           uuid primary key default gen_random_uuid(),
  seq          bigint generated always as identity,
  org_id       uuid not null references public.organization(id) on delete cascade,
  actor_id     uuid,
  actor_type   text not null default 'user',
  action       text not null,
  entity_type  text,
  entity_id    uuid,
  before_jsonb jsonb,
  after_jsonb  jsonb,
  occurred_at  timestamptz not null default now()
);
create index on public.audit_event(org_id);
create index on public.audit_event(org_id, seq);

-- ── Row-Level Security: tenant_isolation on every tenant-scoped table ───────────
-- organization is keyed on id; everything else on org_id. FORCE so the policy
-- applies even to the table owner (a non-superuser app role still gets filtered;
-- superusers bypass RLS regardless, which is why the app connects as a plain role).
do $$
declare
  t record;
begin
  for t in
    select unnest(array[
      'client','app_user','membership','candidate','resume',
      'requisition','jd_skill','proposal','audit_event'
    ]) as tbl
  loop
    execute format('alter table public.%I enable row level security', t.tbl);
    execute format('alter table public.%I force  row level security', t.tbl);
    execute format(
      'create policy tenant_isolation on public.%I using (org_id = public.current_org_id()) with check (org_id = public.current_org_id())',
      t.tbl);
  end loop;
end $$;

alter table public.organization enable row level security;
alter table public.organization force  row level security;
create policy tenant_isolation on public.organization
  using (id = public.current_org_id())
  with check (id = public.current_org_id());

-- ── Grants (least privilege) ────────────────────────────────────────────────────
-- audit_event is append-only: SELECT + INSERT only (no UPDATE/DELETE granted).
do $$
declare
  r text;
begin
  foreach r in array array['manfriday_authenticated','authenticated'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('grant usage on schema public to %I', r);
      execute format('grant select on public.role to %I', r);
      execute format(
        'grant select, insert, update, delete on public.organization, public.client, public.app_user, public.membership, public.candidate, public.resume, public.requisition, public.jd_skill, public.proposal to %I', r);
      execute format('grant select, insert on public.audit_event to %I', r);
    end if;
  end loop;
end $$;

-- ── Supabase Custom Access Token Hook ───────────────────────────────────────────
-- GoTrue calls this when minting an access token; we inject the user's org_id (and
-- role) as top-level JWT claims, looked up from app_user/membership by the Supabase
-- auth user id. RLS then reads org_id from request.jwt.claims. Enable it in the
-- Supabase dashboard (Authentication → Hooks → Custom Access Token) or via config.
create or replace function public.custom_access_token_hook(event jsonb)
  returns jsonb
  language plpgsql
  stable
as $$
declare
  v_org    uuid;
  v_role   text;
  v_claims jsonb;
begin
  select m.org_id, r.key
    into v_org, v_role
  from public.app_user u
  join public.membership m on m.user_id = u.id
  join public.role r       on r.id = m.role_id
  where u.auth_user_id = (event ->> 'user_id')::uuid
    and u.deleted_at is null
  order by m.created_at asc
  limit 1;

  v_claims := coalesce(event -> 'claims', '{}'::jsonb);
  if v_org is not null then
    v_claims := jsonb_set(v_claims, '{org_id}',   to_jsonb(v_org::text), true);
    v_claims := jsonb_set(v_claims, '{org_role}', to_jsonb(coalesce(v_role, 'recruiter')), true);
  end if;
  return jsonb_set(event, '{claims}', v_claims, true);
end;
$$;

-- On Supabase, GoTrue invokes the hook as `supabase_auth_admin`; grant it access.
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'supabase_auth_admin') then
    grant usage on schema public to supabase_auth_admin;
    grant execute on function public.custom_access_token_hook(jsonb) to supabase_auth_admin;
    grant select on public.app_user, public.membership, public.role to supabase_auth_admin;
  end if;
end $$;
