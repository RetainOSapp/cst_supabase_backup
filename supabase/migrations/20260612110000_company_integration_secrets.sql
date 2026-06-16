-- Server-owned per-company tokens for inbound integrations.
-- Tokens are stored as SHA-256 hashes and are intentionally not readable by
-- browser clients. Supabase service-role callers bypass RLS for webhook checks.

create extension if not exists pgcrypto with schema extensions;

create table if not exists public.company_integration_secrets (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  integration_type text not null
    check (
      integration_type in (
        'call_summary_next_steps',
        'call_ai_transcript',
        'client_create',
        'client_update',
        'course_completion'
      )
    ),
  label text not null default 'Default token',
  token_hash text not null check (length(token_hash) >= 64),
  token_prefix text,
  status text not null default 'active'
    check (status in ('active', 'revoked')),
  expires_at timestamptz,
  last_used_at timestamptz,
  last_used_from text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  revoked_at timestamptz,
  unique (company_id, integration_type, token_hash)
);

create index if not exists company_integration_secrets_active_idx
  on public.company_integration_secrets (company_id, integration_type, status)
  where status = 'active';

drop trigger if exists company_integration_secrets_set_updated_at
  on public.company_integration_secrets;
create trigger company_integration_secrets_set_updated_at
before update on public.company_integration_secrets
for each row execute function public.set_updated_at();

alter table public.company_integration_secrets enable row level security;

drop policy if exists "company_integration_secrets_no_client_access"
  on public.company_integration_secrets;
create policy "company_integration_secrets_no_client_access"
on public.company_integration_secrets for all
using (false)
with check (false);

revoke all on public.company_integration_secrets from anon, authenticated;

comment on table public.company_integration_secrets is
  'App-owned per-company inbound integration token hashes. Manage through service-role SQL or a future admin Edge Function; never expose raw tokens or hashes to clients.';

comment on column public.company_integration_secrets.token_hash is
  'SHA-256 hex digest of the raw company integration token. Example: encode(extensions.digest(''raw-token'', ''sha256''), ''hex'').';

comment on column public.company_integration_secrets.token_prefix is
  'Optional non-secret display/debug prefix, for example the first 8-12 characters of the raw token.';

update public.resources
set
  description = 'Provider-agnostic setup guide for sending call summaries or next steps into a specific RetainOS client profile with a company-specific token.',
  content = 'This dynamic guide shows the selected company ID, the RetainOS endpoint, the company-specific integration token header pattern, and the JSON payload shape for client notes or next steps updates.',
  updated_at = now()
where dynamic_key = 'client_call_summary_webhook';
