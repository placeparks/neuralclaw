create extension if not exists "pgcrypto";

do $$
begin
  if not exists (select 1 from pg_type where typname = 'billing_plan') then
    create type billing_plan as enum ('monthly', 'yearly');
  end if;
  if not exists (select 1 from pg_type where typname = 'provider_key') then
    create type provider_key as enum ('openai', 'anthropic', 'openrouter', 'local');
  end if;
  if not exists (select 1 from pg_type where typname = 'agent_status') then
    create type agent_status as enum ('pending', 'provisioning', 'active', 'failed', 'paused');
  end if;
  if not exists (select 1 from pg_type where typname = 'channel_key') then
    create type channel_key as enum ('telegram', 'discord', 'slack', 'whatsapp', 'signal');
  end if;
  if not exists (select 1 from pg_type where typname = 'mesh_permission') then
    create type mesh_permission as enum ('delegate', 'read_only', 'blocked');
  end if;
end $$;

create table if not exists public.app_users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  display_name text not null,
  password_hash text not null,
  password_salt text not null,
  mesh_enabled boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.app_users add column if not exists mesh_enabled boolean not null default false;
alter table public.agents add column if not exists railway_domain text;
alter table public.agents add column if not exists persona text;

create table if not exists public.agents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.app_users(id) on delete cascade,
  agent_name text not null,
  plan billing_plan not null,
  provider provider_key not null,
  provider_api_key_encrypted text,
  model text not null,
  region text not null,
  status agent_status not null default 'pending',
  railway_service_id text,
  railway_deployment_id text,
  railway_domain text,
  provision_attempts integer not null default 0,
  error_message text,
  provisioning_started_at timestamptz,
  deployed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.agent_channels (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references public.agents(id) on delete cascade,
  channel channel_key not null,
  token_encrypted text not null,
  created_at timestamptz not null default now(),
  unique(agent_id, channel)
);

create table if not exists public.mesh_links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.app_users(id) on delete cascade,
  source_agent_id uuid not null references public.agents(id) on delete cascade,
  target_agent_id uuid not null references public.agents(id) on delete cascade,
  permission mesh_permission not null default 'delegate',
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  unique(source_agent_id, target_agent_id)
);

create table if not exists public.agent_events (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references public.agents(id) on delete cascade,
  event_type text not null,
  level text not null default 'info',
  message text not null,
  metadata jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_users_email on public.app_users(email);
create index if not exists idx_agents_user on public.agents(user_id);
create index if not exists idx_agents_status on public.agents(status);
create index if not exists idx_agent_channels_agent on public.agent_channels(agent_id);
create index if not exists idx_mesh_links_user on public.mesh_links(user_id);
create index if not exists idx_events_agent on public.agent_events(agent_id, created_at desc);

-- Backfill from legacy tables if they exist and new rows are missing.
insert into public.app_users (email, display_name, password_hash, password_salt)
select distinct d.user_email, split_part(d.user_email, '@', 1), 'legacy', 'legacy'
from public.deployments d
where d.user_email is not null
on conflict (email) do nothing;

insert into public.agents (
  id, user_id, agent_name, plan, provider, provider_api_key_encrypted, model, region, status,
  railway_service_id, railway_deployment_id, provision_attempts, error_message,
  provisioning_started_at, deployed_at, created_at, updated_at
)
select
  d.id,
  u.id,
  d.agent_name,
  d.plan::billing_plan,
  d.provider::provider_key,
  d.provider_api_key_encrypted,
  d.model,
  d.region,
  d.status::agent_status,
  d.railway_service_id,
  d.railway_deployment_id,
  d.provision_attempts,
  d.error_message,
  d.provisioning_started_at,
  d.deployed_at,
  d.created_at,
  d.updated_at
from public.deployments d
join public.app_users u on u.email = d.user_email
where not exists (select 1 from public.agents a where a.id = d.id);

insert into public.agent_channels (agent_id, channel, token_encrypted, created_at)
select dc.deployment_id, dc.channel::channel_key, dc.token_encrypted, dc.created_at
from public.deployment_channels dc
where exists (select 1 from public.agents a where a.id = dc.deployment_id)
on conflict (agent_id, channel) do nothing;
