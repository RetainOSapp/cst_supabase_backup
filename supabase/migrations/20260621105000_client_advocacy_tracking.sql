-- Client advocacy tracking: asks/received events for reviews, testimonials,
-- referrals, and renewal/upsell opportunities.

create table if not exists public.client_advocacy_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  client_id uuid references public.clients(id) on delete cascade,
  client_legacy_id text not null,
  company_legacy_id text,
  advocacy_type text not null check (
    advocacy_type in ('review', 'testimonial', 'referral', 'renewal_upsell')
  ),
  action text not null check (action in ('asked', 'received')),
  occurred_at timestamptz,
  notes text,
  csm_team_member_id text,
  actor_member_id uuid references public.company_members(id) on delete set null,
  actor_member_legacy_id text,
  actor_auth_user_id uuid,
  source text not null default 'retainos',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists client_advocacy_events_company_date_idx
  on public.client_advocacy_events(company_id, occurred_at desc);

create index if not exists client_advocacy_events_client_idx
  on public.client_advocacy_events(company_id, client_legacy_id);

create index if not exists client_advocacy_events_reporting_idx
  on public.client_advocacy_events(company_id, advocacy_type, action, csm_team_member_id, occurred_at desc);

alter table public.clients
  add column if not exists advocacy_review_status text not null default 'not_asked'
    check (advocacy_review_status in ('not_asked', 'asked', 'received')),
  add column if not exists advocacy_review_asked_count integer not null default 0,
  add column if not exists advocacy_review_received_count integer not null default 0,
  add column if not exists advocacy_review_last_asked_at timestamptz,
  add column if not exists advocacy_review_last_received_at timestamptz,
  add column if not exists advocacy_review_last_note text,
  add column if not exists advocacy_testimonial_status text not null default 'not_asked'
    check (advocacy_testimonial_status in ('not_asked', 'asked', 'received')),
  add column if not exists advocacy_testimonial_asked_count integer not null default 0,
  add column if not exists advocacy_testimonial_received_count integer not null default 0,
  add column if not exists advocacy_testimonial_last_asked_at timestamptz,
  add column if not exists advocacy_testimonial_last_received_at timestamptz,
  add column if not exists advocacy_testimonial_last_note text,
  add column if not exists advocacy_referral_status text not null default 'not_asked'
    check (advocacy_referral_status in ('not_asked', 'asked', 'received')),
  add column if not exists advocacy_referral_asked_count integer not null default 0,
  add column if not exists advocacy_referral_received_count integer not null default 0,
  add column if not exists advocacy_referral_last_asked_at timestamptz,
  add column if not exists advocacy_referral_last_received_at timestamptz,
  add column if not exists advocacy_referral_last_note text,
  add column if not exists advocacy_renewal_upsell_status text not null default 'not_asked'
    check (advocacy_renewal_upsell_status in ('not_asked', 'asked', 'received')),
  add column if not exists advocacy_renewal_upsell_asked_count integer not null default 0,
  add column if not exists advocacy_renewal_upsell_received_count integer not null default 0,
  add column if not exists advocacy_renewal_upsell_last_asked_at timestamptz,
  add column if not exists advocacy_renewal_upsell_last_received_at timestamptz,
  add column if not exists advocacy_renewal_upsell_last_note text;

with source as (
  select
    c.id as client_id,
    c.company_id,
    c.glide_row_id as client_legacy_id,
    c.company_glide_row_id,
    c.csm_team_member_id,
    b.outcomes_review_ask_date,
    b.outcomes_review_yes_date,
    b.outcomes_review_set,
    b.outcomes_testimonial_ask_date,
    b.outcomes_testimonial_yes_date,
    b.outcomes_testimonial_set,
    b.outcomes_referral_ask_date,
    b.outcomes_referral_yes_date,
    b.outcomes_referral_set,
    b.outcomes_renewal_ask_date,
    b.outcomes_renewal_yes_date,
    b.outcomes_renewal_set
  from public.clients c
  join public.backup_company_clients b
    on b.glide_row_id = c.glide_row_id
   and b.company_id = c.company_glide_row_id
)
insert into public.client_advocacy_events (
  company_id,
  client_id,
  client_legacy_id,
  company_legacy_id,
  advocacy_type,
  action,
  occurred_at,
  csm_team_member_id,
  source,
  metadata
)
select
  company_id,
  client_id,
  client_legacy_id,
  company_glide_row_id,
  advocacy_type,
  action,
  occurred_at,
  csm_team_member_id,
  'glide_migration',
  jsonb_build_object('migration_source', 'backup_company_clients')
from (
  select company_id, client_id, client_legacy_id, company_glide_row_id, csm_team_member_id,
    'review'::text as advocacy_type, 'asked'::text as action,
    outcomes_review_ask_date::timestamptz as occurred_at
  from source
  where outcomes_review_ask_date is not null
  union all
  select company_id, client_id, client_legacy_id, company_glide_row_id, csm_team_member_id,
    'review', 'received', outcomes_review_yes_date::timestamptz
  from source
  where outcomes_review_set is true or outcomes_review_yes_date is not null
  union all
  select company_id, client_id, client_legacy_id, company_glide_row_id, csm_team_member_id,
    'testimonial', 'asked', outcomes_testimonial_ask_date::timestamptz
  from source
  where outcomes_testimonial_ask_date is not null
  union all
  select company_id, client_id, client_legacy_id, company_glide_row_id, csm_team_member_id,
    'testimonial', 'received', outcomes_testimonial_yes_date::timestamptz
  from source
  where outcomes_testimonial_set is true or outcomes_testimonial_yes_date is not null
  union all
  select company_id, client_id, client_legacy_id, company_glide_row_id, csm_team_member_id,
    'referral', 'asked', outcomes_referral_ask_date::timestamptz
  from source
  where outcomes_referral_ask_date is not null
  union all
  select company_id, client_id, client_legacy_id, company_glide_row_id, csm_team_member_id,
    'referral', 'received', outcomes_referral_yes_date::timestamptz
  from source
  where outcomes_referral_set is true or outcomes_referral_yes_date is not null
  union all
  select company_id, client_id, client_legacy_id, company_glide_row_id, csm_team_member_id,
    'renewal_upsell', 'asked', outcomes_renewal_ask_date::timestamptz
  from source
  where outcomes_renewal_ask_date is not null
  union all
  select company_id, client_id, client_legacy_id, company_glide_row_id, csm_team_member_id,
    'renewal_upsell', 'received', outcomes_renewal_yes_date::timestamptz
  from source
  where outcomes_renewal_set is true or outcomes_renewal_yes_date is not null
) migrated_events;

with event_summary as (
  select
    company_id,
    client_legacy_id,
    advocacy_type,
    count(*) filter (where action = 'asked')::integer as asked_count,
    count(*) filter (where action = 'received')::integer as received_count,
    max(occurred_at) filter (where action = 'asked') as last_asked_at,
    max(occurred_at) filter (where action = 'received') as last_received_at
  from public.client_advocacy_events
  group by company_id, client_legacy_id, advocacy_type
),
pivoted as (
  select
    company_id,
    client_legacy_id,
    max(asked_count) filter (where advocacy_type = 'review') as review_asked_count,
    max(received_count) filter (where advocacy_type = 'review') as review_received_count,
    max(last_asked_at) filter (where advocacy_type = 'review') as review_last_asked_at,
    max(last_received_at) filter (where advocacy_type = 'review') as review_last_received_at,
    max(asked_count) filter (where advocacy_type = 'testimonial') as testimonial_asked_count,
    max(received_count) filter (where advocacy_type = 'testimonial') as testimonial_received_count,
    max(last_asked_at) filter (where advocacy_type = 'testimonial') as testimonial_last_asked_at,
    max(last_received_at) filter (where advocacy_type = 'testimonial') as testimonial_last_received_at,
    max(asked_count) filter (where advocacy_type = 'referral') as referral_asked_count,
    max(received_count) filter (where advocacy_type = 'referral') as referral_received_count,
    max(last_asked_at) filter (where advocacy_type = 'referral') as referral_last_asked_at,
    max(last_received_at) filter (where advocacy_type = 'referral') as referral_last_received_at,
    max(asked_count) filter (where advocacy_type = 'renewal_upsell') as renewal_upsell_asked_count,
    max(received_count) filter (where advocacy_type = 'renewal_upsell') as renewal_upsell_received_count,
    max(last_asked_at) filter (where advocacy_type = 'renewal_upsell') as renewal_upsell_last_asked_at,
    max(last_received_at) filter (where advocacy_type = 'renewal_upsell') as renewal_upsell_last_received_at
  from event_summary
  group by company_id, client_legacy_id
)
update public.clients c
set
  advocacy_review_asked_count = coalesce(p.review_asked_count, 0),
  advocacy_review_received_count = coalesce(p.review_received_count, 0),
  advocacy_review_status = case
    when coalesce(p.review_received_count, 0) > 0 then 'received'
    when coalesce(p.review_asked_count, 0) > 0 then 'asked'
    else 'not_asked'
  end,
  advocacy_review_last_asked_at = p.review_last_asked_at,
  advocacy_review_last_received_at = p.review_last_received_at,
  advocacy_testimonial_asked_count = coalesce(p.testimonial_asked_count, 0),
  advocacy_testimonial_received_count = coalesce(p.testimonial_received_count, 0),
  advocacy_testimonial_status = case
    when coalesce(p.testimonial_received_count, 0) > 0 then 'received'
    when coalesce(p.testimonial_asked_count, 0) > 0 then 'asked'
    else 'not_asked'
  end,
  advocacy_testimonial_last_asked_at = p.testimonial_last_asked_at,
  advocacy_testimonial_last_received_at = p.testimonial_last_received_at,
  advocacy_referral_asked_count = coalesce(p.referral_asked_count, 0),
  advocacy_referral_received_count = coalesce(p.referral_received_count, 0),
  advocacy_referral_status = case
    when coalesce(p.referral_received_count, 0) > 0 then 'received'
    when coalesce(p.referral_asked_count, 0) > 0 then 'asked'
    else 'not_asked'
  end,
  advocacy_referral_last_asked_at = p.referral_last_asked_at,
  advocacy_referral_last_received_at = p.referral_last_received_at,
  advocacy_renewal_upsell_asked_count = coalesce(p.renewal_upsell_asked_count, 0),
  advocacy_renewal_upsell_received_count = coalesce(p.renewal_upsell_received_count, 0),
  advocacy_renewal_upsell_status = case
    when coalesce(p.renewal_upsell_received_count, 0) > 0 then 'received'
    when coalesce(p.renewal_upsell_asked_count, 0) > 0 then 'asked'
    else 'not_asked'
  end,
  advocacy_renewal_upsell_last_asked_at = p.renewal_upsell_last_asked_at,
  advocacy_renewal_upsell_last_received_at = p.renewal_upsell_last_received_at
from pivoted p
where c.company_id = p.company_id
  and c.glide_row_id = p.client_legacy_id;
