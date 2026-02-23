create extension if not exists "pgcrypto";

create table if not exists public.deployments (
  id uuid primary key default gen_random_uuid(),
  user_email text not null,
  agent_name text not null,
  plan text not null check (plan in ('monthly', 'yearly')),
  provider text not null,
  provider_api_key_encrypted text,
  model text not null,
  region text not null,
  status text not null default 'pending' check (status in ('pending', 'provisioning', 'active', 'failed', 'paused')),
  railway_service_id text,
  railway_deployment_id text,
  provision_attempts integer not null default 0,
  error_message text,
  provisioning_started_at timestamptz,
  deployed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.deployment_channels (
  id uuid primary key default gen_random_uuid(),
  deployment_id uuid not null references public.deployments(id) on delete cascade,
  channel text not null,
  token_encrypted text not null,
  created_at timestamptz not null default now()
);

alter table public.deployments add column if not exists provider_api_key_encrypted text;
alter table public.deployments add column if not exists railway_service_id text;
alter table public.deployments add column if not exists railway_deployment_id text;
alter table public.deployments add column if not exists provision_attempts integer not null default 0;
alter table public.deployments add column if not exists error_message text;
alter table public.deployments add column if not exists provisioning_started_at timestamptz;
alter table public.deployments add column if not exists deployed_at timestamptz;
alter table public.deployments add column if not exists updated_at timestamptz not null default now();

create index if not exists idx_deployments_user_email on public.deployments(user_email);
create index if not exists idx_deployments_status on public.deployments(status);
create index if not exists idx_channels_deployment_id on public.deployment_channels(deployment_id);
