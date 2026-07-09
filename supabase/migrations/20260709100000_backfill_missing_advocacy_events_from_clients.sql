-- Backfill migrated/client-summary advocacy dates into event rows for Moves Method.
-- This is idempotent: it only inserts when the same company/client/type/action/date
-- is not already present in client_advocacy_events.

with target_company as (
  select id, legacy_glide_row_id
  from public.companies
  where legacy_glide_row_id = 'wd7vy0vaQK2hgB3IRqy17w'
),
summary_events as (
  select
    c.company_id,
    c.id as client_id,
    c.glide_row_id as client_legacy_id,
    c.company_glide_row_id as company_legacy_id,
    c.csm_team_member_id,
    'review'::text as advocacy_type,
    'asked'::text as action,
    c.advocacy_review_last_asked_at as occurred_at,
    c.advocacy_review_last_note as notes
  from public.clients c
  join target_company tc on tc.id = c.company_id
  where c.advocacy_review_last_asked_at is not null

  union all
  select
    c.company_id,
    c.id,
    c.glide_row_id,
    c.company_glide_row_id,
    c.csm_team_member_id,
    'review',
    'received',
    c.advocacy_review_last_received_at,
    c.advocacy_review_last_note
  from public.clients c
  join target_company tc on tc.id = c.company_id
  where c.advocacy_review_last_received_at is not null

  union all
  select
    c.company_id,
    c.id,
    c.glide_row_id,
    c.company_glide_row_id,
    c.csm_team_member_id,
    'testimonial',
    'asked',
    c.advocacy_testimonial_last_asked_at,
    c.advocacy_testimonial_last_note
  from public.clients c
  join target_company tc on tc.id = c.company_id
  where c.advocacy_testimonial_last_asked_at is not null

  union all
  select
    c.company_id,
    c.id,
    c.glide_row_id,
    c.company_glide_row_id,
    c.csm_team_member_id,
    'testimonial',
    'received',
    c.advocacy_testimonial_last_received_at,
    c.advocacy_testimonial_last_note
  from public.clients c
  join target_company tc on tc.id = c.company_id
  where c.advocacy_testimonial_last_received_at is not null

  union all
  select
    c.company_id,
    c.id,
    c.glide_row_id,
    c.company_glide_row_id,
    c.csm_team_member_id,
    'referral',
    'asked',
    c.advocacy_referral_last_asked_at,
    c.advocacy_referral_last_note
  from public.clients c
  join target_company tc on tc.id = c.company_id
  where c.advocacy_referral_last_asked_at is not null

  union all
  select
    c.company_id,
    c.id,
    c.glide_row_id,
    c.company_glide_row_id,
    c.csm_team_member_id,
    'referral',
    'received',
    c.advocacy_referral_last_received_at,
    c.advocacy_referral_last_note
  from public.clients c
  join target_company tc on tc.id = c.company_id
  where c.advocacy_referral_last_received_at is not null

  union all
  select
    c.company_id,
    c.id,
    c.glide_row_id,
    c.company_glide_row_id,
    c.csm_team_member_id,
    'renewal_upsell',
    'asked',
    c.advocacy_renewal_upsell_last_asked_at,
    c.advocacy_renewal_upsell_last_note
  from public.clients c
  join target_company tc on tc.id = c.company_id
  where c.advocacy_renewal_upsell_last_asked_at is not null

  union all
  select
    c.company_id,
    c.id,
    c.glide_row_id,
    c.company_glide_row_id,
    c.csm_team_member_id,
    'renewal_upsell',
    'received',
    c.advocacy_renewal_upsell_last_received_at,
    c.advocacy_renewal_upsell_last_note
  from public.clients c
  join target_company tc on tc.id = c.company_id
  where c.advocacy_renewal_upsell_last_received_at is not null
)
insert into public.client_advocacy_events (
  company_id,
  client_id,
  client_legacy_id,
  company_legacy_id,
  advocacy_type,
  action,
  occurred_at,
  notes,
  csm_team_member_id,
  source,
  metadata
)
select
  se.company_id,
  se.client_id,
  se.client_legacy_id,
  se.company_legacy_id,
  se.advocacy_type,
  se.action,
  se.occurred_at,
  se.notes,
  se.csm_team_member_id,
  'client_summary_backfill',
  jsonb_build_object(
    'backfill_source', 'clients_advocacy_summary',
    'backfilled_at', now()
  )
from summary_events se
where not exists (
  select 1
  from public.client_advocacy_events existing
  where existing.company_id = se.company_id
    and existing.client_legacy_id = se.client_legacy_id
    and existing.advocacy_type = se.advocacy_type
    and existing.action = se.action
    and existing.occurred_at = se.occurred_at
);
