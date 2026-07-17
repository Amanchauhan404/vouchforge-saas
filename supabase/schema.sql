-- VouchForge AI initial Supabase schema.
-- Run this entire file once in Supabase Dashboard > SQL Editor as the project owner.
-- It creates only private customer-proof storage, tenant isolation, and server-mediated publishing.

begin;

create extension if not exists pgcrypto;
create schema if not exists private;

revoke all on schema private from public;
grant usage on schema private to authenticated;

create table if not exists public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 2 and 120),
  brand_name text not null check (char_length(trim(brand_name)) between 2 and 120),
  industry text not null default '' check (char_length(industry) <= 120),
  plan text not null default 'free' check (plan in ('free', 'pro', 'enterprise')),
  free_mode boolean not null default true,
  trust_score integer not null default 0 check (trust_score between 0 and 100),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.members (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner', 'admin', 'editor', 'viewer')),
  created_at timestamptz not null default timezone('utc', now()),
  unique (workspace_id, user_id)
);

create table if not exists public.campaigns (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  public_slug text not null unique check (public_slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name text not null check (char_length(trim(name)) between 2 and 160),
  status text not null default 'draft' check (status in ('draft', 'active', 'paused', 'archived')),
  public_enabled boolean not null default false,
  launched_at timestamptz,
  ends_at timestamptz,
  created_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  check (ends_at is null or launched_at is null or ends_at >= launched_at)
);

create table if not exists public.contacts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 160),
  email text not null check (char_length(email) between 5 and 254),
  company text not null default '' check (char_length(company) <= 160),
  source text not null default 'manual' check (source in ('manual', 'import', 'public_form', 'integration')),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (workspace_id, email)
);

create table if not exists public.review_requests (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  contact_id uuid references public.contacts(id) on delete set null,
  channel text not null check (channel in ('email', 'sms', 'whatsapp', 'linkedin', 'manual')),
  status text not null default 'queued' check (status in ('queued', 'sent', 'opened', 'reminder_sent', 'responded', 'failed', 'unsubscribed')),
  sent_at timestamptz,
  opened_at timestamptz,
  responded_at timestamptz,
  provider_message_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.submissions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  customer_name text not null check (char_length(trim(customer_name)) between 2 and 120),
  customer_email text not null check (char_length(customer_email) between 5 and 254),
  customer_company text not null default '' check (char_length(customer_company) <= 160),
  feedback_text text not null check (char_length(trim(feedback_text)) between 24 and 5000),
  rating smallint not null check (rating between 1 and 5),
  sentiment text not null default 'neutral' check (sentiment in ('positive', 'neutral', 'negative')),
  source_channel text not null default 'public_form' check (source_channel in ('public_form', 'email', 'sms', 'whatsapp', 'linkedin', 'import', 'manual')),
  status text not null default 'received' check (status in ('received', 'reviewed', 'approved', 'rejected', 'deleted')),
  consent_publish boolean not null default false,
  consent_ai_processing boolean not null default false,
  consent_contact boolean not null default false,
  consent_recorded_at timestamptz,
  collection_ip_hash text,
  raw_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  deleted_at timestamptz,
  check (
    (consent_publish = false and consent_ai_processing = false)
    or consent_recorded_at is not null
  )
);

create table if not exists public.submission_media (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  submission_id uuid not null references public.submissions(id) on delete cascade,
  kind text not null check (kind in ('image', 'audio', 'video')),
  original_file_name text not null check (char_length(original_file_name) between 1 and 180),
  content_type text not null check (content_type in (
    'image/jpeg', 'image/png', 'image/webp',
    'audio/mpeg', 'audio/wav', 'audio/webm',
    'video/mp4', 'video/webm'
  )),
  byte_size integer not null check (byte_size between 1 and 6291456),
  storage_path text not null unique check (char_length(storage_path) between 8 and 1024),
  upload_status text not null default 'pending' check (upload_status in ('pending', 'uploaded', 'failed', 'deleted')),
  uploaded_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.ai_assets (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  asset_type text not null check (asset_type in (
    'testimonial', 'case-study', 'linkedin-post', 'x-post', 'instagram-caption',
    'google-review', 'quote-card', 'website-widget'
  )),
  title text not null check (char_length(trim(title)) between 2 and 240),
  body text not null check (char_length(trim(body)) between 1 and 12000),
  channel_hint text not null default '' check (char_length(channel_hint) <= 240),
  status text not null default 'draft' check (status in ('draft', 'ready', 'approved', 'published', 'rejected')),
  generated_by text not null default 'template' check (generated_by in ('gemini', 'template', 'human')),
  provenance jsonb not null default '{}'::jsonb,
  approved_by uuid references auth.users(id) on delete set null,
  approved_at timestamptz,
  published_at timestamptz,
  is_public boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  check ((status not in ('approved', 'published')) or approved_at is not null)
);

create table if not exists public.approvals (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  asset_id uuid not null references public.ai_assets(id) on delete cascade,
  step text not null check (step in ('accuracy', 'consent', 'legal', 'publish')),
  status text not null check (status in ('approved', 'rejected', 'changes_requested')),
  reviewer_id uuid not null references auth.users(id) on delete restrict,
  notes text not null default '' check (char_length(notes) <= 2000),
  decided_at timestamptz not null default timezone('utc', now()),
  created_at timestamptz not null default timezone('utc', now()),
  unique (asset_id, step)
);

create table if not exists public.integrations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  provider text not null check (char_length(trim(provider)) between 2 and 120),
  status text not null default 'ready_to_connect' check (status in ('connected', 'test_mode', 'ready_to_connect', 'blocked_paid', 'disabled', 'error')),
  config jsonb not null default '{}'::jsonb,
  connected_by uuid references auth.users(id) on delete set null,
  connected_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (workspace_id, provider)
);

create table if not exists public.publish_targets (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  integration_id uuid references public.integrations(id) on delete set null,
  name text not null check (char_length(trim(name)) between 2 and 160),
  target_type text not null check (target_type in ('widget', 'page', 'blog', 'email', 'linkedin', 'x', 'facebook', 'instagram', 'whatsapp', 'sms')),
  location text not null default '' check (char_length(location) <= 1000),
  status text not null default 'draft' check (status in ('draft', 'published', 'scheduled', 'queued', 'blocked', 'disabled')),
  free_mode_note text not null default '' check (char_length(free_mode_note) <= 240),
  last_published_at timestamptz,
  created_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.publish_jobs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  asset_id uuid not null references public.ai_assets(id) on delete cascade,
  publish_target_id uuid not null references public.publish_targets(id) on delete cascade,
  status text not null default 'queued' check (status in ('queued', 'processing', 'published', 'failed', 'blocked', 'cancelled')),
  idempotency_key text not null check (char_length(idempotency_key) between 8 and 240),
  requested_by uuid not null references auth.users(id) on delete restrict,
  provider_reference text,
  error_code text,
  error_message text,
  attempts integer not null default 0 check (attempts between 0 and 100),
  scheduled_for timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (workspace_id, idempotency_key)
);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  event text not null check (char_length(trim(event)) between 2 and 160),
  actor_id uuid references auth.users(id) on delete set null,
  actor_type text not null check (actor_type in ('member', 'system', 'provider')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.webhook_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (char_length(trim(provider)) between 2 and 120),
  external_event_id text not null check (char_length(trim(external_event_id)) between 1 and 200),
  payload_hash text not null check (payload_hash ~ '^[a-f0-9]{64}$'),
  signature_valid boolean not null default false,
  received_at timestamptz not null default timezone('utc', now()),
  processed_at timestamptz,
  unique (provider, external_event_id)
);

create table if not exists public.data_subject_requests (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  subject_email text not null check (char_length(subject_email) between 5 and 254),
  request_type text not null check (request_type in ('export', 'delete')),
  status text not null default 'received' check (status in ('received', 'verified', 'processing', 'completed', 'rejected')),
  requested_at timestamptz not null default timezone('utc', now()),
  completed_at timestamptz,
  notes text not null default '' check (char_length(notes) <= 2000)
);

create table if not exists public.suppression_entries (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  channel text not null check (channel in ('email', 'sms', 'whatsapp', 'linkedin')),
  identifier_hash text not null check (identifier_hash ~ '^[a-f0-9]{64}$'),
  reason text not null check (reason in ('unsubscribe', 'stop', 'complaint', 'manual')),
  created_at timestamptz not null default timezone('utc', now()),
  unique (workspace_id, channel, identifier_hash)
);

create index if not exists members_user_workspace_idx on public.members (user_id, workspace_id);
create index if not exists campaigns_workspace_created_idx on public.campaigns (workspace_id, created_at desc);
create index if not exists contacts_workspace_created_idx on public.contacts (workspace_id, created_at desc);
create index if not exists review_requests_workspace_status_idx on public.review_requests (workspace_id, status, created_at desc);
create index if not exists submissions_workspace_created_idx on public.submissions (workspace_id, created_at desc);
create index if not exists submissions_campaign_status_idx on public.submissions (campaign_id, status, created_at desc);
create index if not exists submission_media_submission_idx on public.submission_media (submission_id, created_at desc);
create index if not exists ai_assets_workspace_status_idx on public.ai_assets (workspace_id, status, created_at desc);
create index if not exists ai_assets_public_widget_idx on public.ai_assets (workspace_id, asset_type, published_at desc) where status = 'published' and is_public = true;
create index if not exists approvals_asset_idx on public.approvals (asset_id, decided_at desc);
create index if not exists publish_targets_workspace_idx on public.publish_targets (workspace_id, created_at desc);
create index if not exists publish_jobs_workspace_status_idx on public.publish_jobs (workspace_id, status, created_at desc);
create index if not exists audit_logs_workspace_created_idx on public.audit_logs (workspace_id, created_at desc);
create index if not exists webhook_events_received_idx on public.webhook_events (provider, received_at desc);
create index if not exists data_subject_requests_workspace_idx on public.data_subject_requests (workspace_id, status, requested_at desc);

create or replace function private.touch_updated_at()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create or replace function private.add_workspace_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.members (workspace_id, user_id, role)
  values (new.id, new.created_by, 'owner')
  on conflict (workspace_id, user_id) do nothing;
  return new;
end;
$$;

create or replace function private.ensure_campaign_workspace()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  campaign_workspace_id uuid;
begin
  select workspace_id into campaign_workspace_id
  from public.campaigns
  where id = new.campaign_id;

  if campaign_workspace_id is null or campaign_workspace_id <> new.workspace_id then
    raise exception 'campaign must belong to the same workspace';
  end if;
  return new;
end;
$$;

create or replace function private.ensure_target_integration_workspace()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  integration_workspace_id uuid;
begin
  if new.integration_id is null then
    return new;
  end if;

  select workspace_id into integration_workspace_id
  from public.integrations
  where id = new.integration_id;

  if integration_workspace_id is null or integration_workspace_id <> new.workspace_id then
    raise exception 'integration must belong to the same workspace';
  end if;
  return new;
end;
$$;

create or replace function private.ensure_approval_workspace()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  asset_workspace_id uuid;
begin
  select workspace_id into asset_workspace_id
  from public.ai_assets
  where id = new.asset_id;

  if asset_workspace_id is null or asset_workspace_id <> new.workspace_id then
    raise exception 'asset must belong to the same workspace';
  end if;
  return new;
end;
$$;

create or replace function private.ensure_publish_job_workspace()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.ai_assets asset
    join public.publish_targets target on target.id = new.publish_target_id
    where asset.id = new.asset_id
      and asset.workspace_id = new.workspace_id
      and target.workspace_id = new.workspace_id
  ) then
    raise exception 'asset and publishing target must belong to the same workspace';
  end if;
  return new;
end;
$$;

create or replace function private.is_workspace_member(target_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.members member_row
    where member_row.workspace_id = target_workspace_id
      and member_row.user_id = (select auth.uid())
  );
$$;

create or replace function private.has_workspace_role(target_workspace_id uuid, allowed_roles text[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.members member_row
    where member_row.workspace_id = target_workspace_id
      and member_row.user_id = (select auth.uid())
      and member_row.role = any (allowed_roles)
  );
$$;

create or replace function private.is_workspace_member_path(workspace_prefix text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.members member_row
    where member_row.workspace_id::text = workspace_prefix
      and member_row.user_id = (select auth.uid())
  );
$$;

revoke all on function private.touch_updated_at() from public;
revoke all on function private.add_workspace_owner() from public;
revoke all on function private.ensure_campaign_workspace() from public;
revoke all on function private.ensure_target_integration_workspace() from public;
revoke all on function private.ensure_approval_workspace() from public;
revoke all on function private.ensure_publish_job_workspace() from public;
revoke all on function private.is_workspace_member(uuid) from public;
revoke all on function private.has_workspace_role(uuid, text[]) from public;
revoke all on function private.is_workspace_member_path(text) from public;

grant execute on function private.is_workspace_member(uuid) to authenticated;
grant execute on function private.has_workspace_role(uuid, text[]) to authenticated;
grant execute on function private.is_workspace_member_path(text) to authenticated;

drop trigger if exists workspaces_add_owner on public.workspaces;
create trigger workspaces_add_owner
after insert on public.workspaces
for each row execute function private.add_workspace_owner();

drop trigger if exists campaigns_touch_updated_at on public.campaigns;
create trigger campaigns_touch_updated_at
before update on public.campaigns
for each row execute function private.touch_updated_at();

drop trigger if exists contacts_touch_updated_at on public.contacts;
create trigger contacts_touch_updated_at
before update on public.contacts
for each row execute function private.touch_updated_at();

drop trigger if exists review_requests_touch_updated_at on public.review_requests;
create trigger review_requests_touch_updated_at
before update on public.review_requests
for each row execute function private.touch_updated_at();

drop trigger if exists submissions_touch_updated_at on public.submissions;
create trigger submissions_touch_updated_at
before update on public.submissions
for each row execute function private.touch_updated_at();

drop trigger if exists submission_media_touch_updated_at on public.submission_media;
create trigger submission_media_touch_updated_at
before update on public.submission_media
for each row execute function private.touch_updated_at();

drop trigger if exists ai_assets_touch_updated_at on public.ai_assets;
create trigger ai_assets_touch_updated_at
before update on public.ai_assets
for each row execute function private.touch_updated_at();

drop trigger if exists integrations_touch_updated_at on public.integrations;
create trigger integrations_touch_updated_at
before update on public.integrations
for each row execute function private.touch_updated_at();

drop trigger if exists publish_targets_touch_updated_at on public.publish_targets;
create trigger publish_targets_touch_updated_at
before update on public.publish_targets
for each row execute function private.touch_updated_at();

drop trigger if exists publish_jobs_touch_updated_at on public.publish_jobs;
create trigger publish_jobs_touch_updated_at
before update on public.publish_jobs
for each row execute function private.touch_updated_at();

drop trigger if exists submissions_require_campaign_workspace on public.submissions;
create trigger submissions_require_campaign_workspace
before insert or update of workspace_id, campaign_id on public.submissions
for each row execute function private.ensure_campaign_workspace();

drop trigger if exists review_requests_require_campaign_workspace on public.review_requests;
create trigger review_requests_require_campaign_workspace
before insert or update of workspace_id, campaign_id on public.review_requests
for each row execute function private.ensure_campaign_workspace();

drop trigger if exists ai_assets_require_campaign_workspace on public.ai_assets;
create trigger ai_assets_require_campaign_workspace
before insert or update of workspace_id, campaign_id on public.ai_assets
for each row execute function private.ensure_campaign_workspace();

drop trigger if exists publish_targets_require_campaign_workspace on public.publish_targets;
create trigger publish_targets_require_campaign_workspace
before insert or update of workspace_id, campaign_id on public.publish_targets
for each row execute function private.ensure_campaign_workspace();

drop trigger if exists publish_targets_require_integration_workspace on public.publish_targets;
create trigger publish_targets_require_integration_workspace
before insert or update of workspace_id, integration_id on public.publish_targets
for each row execute function private.ensure_target_integration_workspace();

drop trigger if exists approvals_require_asset_workspace on public.approvals;
create trigger approvals_require_asset_workspace
before insert or update of workspace_id, asset_id on public.approvals
for each row execute function private.ensure_approval_workspace();

drop trigger if exists publish_jobs_require_workspace on public.publish_jobs;
create trigger publish_jobs_require_workspace
before insert or update of workspace_id, asset_id, publish_target_id on public.publish_jobs
for each row execute function private.ensure_publish_job_workspace();

alter table public.workspaces enable row level security;
alter table public.members enable row level security;
alter table public.campaigns enable row level security;
alter table public.contacts enable row level security;
alter table public.review_requests enable row level security;
alter table public.submissions enable row level security;
alter table public.submission_media enable row level security;
alter table public.ai_assets enable row level security;
alter table public.approvals enable row level security;
alter table public.integrations enable row level security;
alter table public.publish_targets enable row level security;
alter table public.publish_jobs enable row level security;
alter table public.audit_logs enable row level security;
alter table public.webhook_events enable row level security;
alter table public.data_subject_requests enable row level security;
alter table public.suppression_entries enable row level security;

revoke all on all tables in schema public from anon;
revoke all on all tables in schema public from authenticated;

grant select, insert on public.workspaces to authenticated;
grant select on public.members to authenticated;
grant select, insert on public.campaigns to authenticated;
grant select on public.contacts to authenticated;
grant select on public.review_requests to authenticated;
grant select on public.submissions to authenticated;
grant select on public.submission_media to authenticated;
grant select on public.ai_assets to authenticated;
grant select on public.approvals to authenticated;
grant select on public.integrations to authenticated;
grant select, insert on public.publish_targets to authenticated;
grant select on public.publish_jobs to authenticated;
grant select on public.audit_logs to authenticated;
grant select on public.data_subject_requests to authenticated;
grant select on public.suppression_entries to authenticated;

drop policy if exists workspaces_select_member on public.workspaces;
create policy workspaces_select_member
on public.workspaces for select to authenticated
using ((select private.is_workspace_member(id)));

drop policy if exists workspaces_insert_self on public.workspaces;
create policy workspaces_insert_self
on public.workspaces for insert to authenticated
with check (
  created_by = (select auth.uid())
  and plan = 'free'
  and free_mode = true
  and trust_score = 0
);

drop policy if exists members_select_member on public.members;
create policy members_select_member
on public.members for select to authenticated
using ((select private.is_workspace_member(workspace_id)));

drop policy if exists campaigns_select_member on public.campaigns;
create policy campaigns_select_member
on public.campaigns for select to authenticated
using ((select private.is_workspace_member(workspace_id)));

drop policy if exists campaigns_insert_editor on public.campaigns;
create policy campaigns_insert_editor
on public.campaigns for insert to authenticated
with check (
  created_by = (select auth.uid())
  and (select private.has_workspace_role(workspace_id, array['owner', 'admin', 'editor']))
);

drop policy if exists contacts_select_member on public.contacts;
create policy contacts_select_member
on public.contacts for select to authenticated
using ((select private.is_workspace_member(workspace_id)));

drop policy if exists review_requests_select_member on public.review_requests;
create policy review_requests_select_member
on public.review_requests for select to authenticated
using ((select private.is_workspace_member(workspace_id)));

drop policy if exists submissions_select_member on public.submissions;
create policy submissions_select_member
on public.submissions for select to authenticated
using ((select private.is_workspace_member(workspace_id)));

drop policy if exists submission_media_select_member on public.submission_media;
create policy submission_media_select_member
on public.submission_media for select to authenticated
using ((select private.is_workspace_member(workspace_id)));

drop policy if exists ai_assets_select_member on public.ai_assets;
create policy ai_assets_select_member
on public.ai_assets for select to authenticated
using ((select private.is_workspace_member(workspace_id)));

drop policy if exists approvals_select_member on public.approvals;
create policy approvals_select_member
on public.approvals for select to authenticated
using ((select private.is_workspace_member(workspace_id)));

drop policy if exists integrations_select_member on public.integrations;
create policy integrations_select_member
on public.integrations for select to authenticated
using ((select private.is_workspace_member(workspace_id)));

drop policy if exists publish_targets_select_member on public.publish_targets;
create policy publish_targets_select_member
on public.publish_targets for select to authenticated
using ((select private.is_workspace_member(workspace_id)));

drop policy if exists publish_targets_insert_editor on public.publish_targets;
create policy publish_targets_insert_editor
on public.publish_targets for insert to authenticated
with check (
  created_by = (select auth.uid())
  and (select private.has_workspace_role(workspace_id, array['owner', 'admin', 'editor']))
);

drop policy if exists publish_jobs_select_member on public.publish_jobs;
create policy publish_jobs_select_member
on public.publish_jobs for select to authenticated
using ((select private.is_workspace_member(workspace_id)));

drop policy if exists audit_logs_select_member on public.audit_logs;
create policy audit_logs_select_member
on public.audit_logs for select to authenticated
using ((select private.is_workspace_member(workspace_id)));

drop policy if exists data_subject_requests_select_admin on public.data_subject_requests;
create policy data_subject_requests_select_admin
on public.data_subject_requests for select to authenticated
using ((select private.has_workspace_role(workspace_id, array['owner', 'admin'])));

drop policy if exists suppression_entries_select_admin on public.suppression_entries;
create policy suppression_entries_select_admin
on public.suppression_entries for select to authenticated
using ((select private.has_workspace_role(workspace_id, array['owner', 'admin'])));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'proof-media',
  'proof-media',
  false,
  6291456,
  array[
    'image/jpeg', 'image/png', 'image/webp',
    'audio/mpeg', 'audio/wav', 'audio/webm',
    'video/mp4', 'video/webm'
  ]::text[]
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists proof_media_member_read on storage.objects;
create policy proof_media_member_read
on storage.objects for select to authenticated
using (
  bucket_id = 'proof-media'
  and (select private.is_workspace_member_path((storage.foldername(name))[1]))
);

commit;
