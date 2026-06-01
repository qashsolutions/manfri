-- 0005_campaigns.sql — mass-email v1 (Capability #6). A `campaign` is one outreach send
-- tied to a requisition; `campaign_send` is one row per recipient (queued → sent/failed),
-- which makes the send resumable (a worker/route only picks `queued` rows) and gives a
-- per-campaign delivery ledger. Both are tenant tables: org-scoped + RLS like every other
-- table (FORCE + USING + WITH CHECK on org_id = current_org_id()). No BEGIN/COMMIT — the
-- migrate runner wraps each file in a transaction.

create table public.campaign (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references public.organization(id) on delete cascade,
  requisition_id uuid not null references public.requisition(id) on delete cascade,
  subject        text not null,
  body           text not null,
  created_by     uuid,                         -- Supabase Auth user id of the recruiter (no cross-schema FK)
  status         text not null default 'draft'
                   check (status in ('draft','sending','sent','failed')),
  created_at     timestamptz not null default now()
);
create index on public.campaign(org_id);
create index on public.campaign(requisition_id);

create table public.campaign_send (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organization(id) on delete cascade,
  campaign_id   uuid not null references public.campaign(id) on delete cascade,
  candidate_id  uuid not null references public.candidate(id) on delete cascade,
  status        text not null default 'queued'
                  check (status in ('queued','sent','failed')),
  error         text,
  provider_id   text,                          -- provider message id once accepted
  sent_at       timestamptz,
  created_at    timestamptz not null default now(),
  unique (campaign_id, candidate_id)           -- idempotent enqueue / resumable processing
);
create index on public.campaign_send(org_id);
create index on public.campaign_send(campaign_id);
create index on public.campaign_send(campaign_id, status);

alter table public.campaign       enable row level security;
alter table public.campaign       force  row level security;
alter table public.campaign_send  enable row level security;
alter table public.campaign_send  force  row level security;

create policy tenant_isolation on public.campaign
  using (org_id = public.current_org_id())
  with check (org_id = public.current_org_id());
create policy tenant_isolation on public.campaign_send
  using (org_id = public.current_org_id())
  with check (org_id = public.current_org_id());

do $$
declare
  r text;
  t text;
begin
  foreach t in array array['campaign', 'campaign_send'] loop
    foreach r in array array['manfriday_authenticated', 'authenticated', 'service_role'] loop
      if exists (select 1 from pg_roles where rolname = r) then
        execute format('grant select, insert, update, delete on public.%I to %I', t, r);
      end if;
    end loop;
  end loop;
end $$;
