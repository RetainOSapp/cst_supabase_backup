-- Global client note/history search for the Clients page.
-- Searches current Next Steps plus app-owned and migrated legacy history
-- while respecting the same roster filters used by the Clients page.

create or replace function public.search_client_notes(
  p_company_id text,
  p_search text,
  p_client_name text default null,
  p_csm_id text default null,
  p_assigned_team_member_id text default null,
  p_secondary_assignee_id text default null,
  p_program_values text[] default null,
  p_offer_id text default null,
  p_milestone_id text default null,
  p_renewal_window text default null,
  p_last_contact_age text default null,
  p_next_contact_window text default null,
  p_success_status text default null,
  p_progress_status text default null,
  p_buy_in_status text default null,
  p_review_advocacy_status text default null,
  p_testimonial_advocacy_status text default null,
  p_referral_advocacy_status text default null,
  p_renewal_upsell_advocacy_status text default null,
  p_limit integer default 25,
  p_offset integer default 0
)
returns table (
  source_key text,
  source_type text,
  source_label text,
  client_id text,
  client_name text,
  client_image text,
  csm_team_member_id text,
  event_date timestamptz,
  matched_text text,
  total_count bigint
)
language sql
stable
as $$
with params as (
  select
    lower(trim(coalesce(p_search, ''))) as search_text,
    lower(trim(coalesce(p_client_name, ''))) as client_name_search,
    case p_renewal_window
      when 'next_7' then 7
      when 'next_14' then 14
      when 'next_30' then 30
      when 'next_60' then 60
      when 'next_90' then 90
      else null
    end as renewal_days,
    case p_last_contact_age
      when 'older_7' then 7
      when 'older_14' then 14
      when 'older_30' then 30
      when 'older_60' then 60
      when 'older_90' then 90
      when 'older_180' then 180
      when 'older_365' then 365
      else null
    end as last_contact_days,
    case p_next_contact_window
      when 'next_7' then 7
      when 'next_14' then 14
      when 'next_30' then 30
      when 'next_60' then 60
      when 'next_90' then 90
      else null
    end as next_contact_days
),
selected_company as (
  select
    c.id,
    c.legacy_glide_row_id,
    c.migration_status
  from public.companies c
  where c.id::text = p_company_id
     or c.legacy_glide_row_id = p_company_id
  limit 1
),
source_clients as (
  select
    'app'::text as source_kind,
    cl.glide_row_id,
    cl.client_name,
    cl.client_image,
    cl.csm_team_member_id,
    cl.csm_secondary_assignee_id,
    cl.program_status_value,
    cl.offer_milestones_current_offer_id,
    cl.offer_milestones_current_milestone_id,
    cl.current_contract_end_date_for_filtering,
    cl.current_contract_end_date,
    cl.csm_date_of_last_contact,
    cl.csm_date_of_next_contact,
    cl.outcomes_success_value_for_filtering,
    cl.outcomes_progress_for_filtering,
    cl.outcomes_buy_in_for_filtering,
    cl.advocacy_review_status,
    cl.advocacy_testimonial_status,
    cl.advocacy_referral_status,
    cl.advocacy_renewal_upsell_status,
    cl.next_steps_value,
    cl.updated_at as next_steps_updated_at
  from public.clients cl
  join selected_company sc on sc.id = cl.company_id
  where sc.migration_status in ('pilot', 'migrated')
    and cl.archived_at is null

  union all

  select
    'mirror'::text as source_kind,
    bc.glide_row_id,
    bc.client_name,
    bc.client_image,
    bc.csm_team_member_id,
    bc.csm_secondary_assignee_id,
    bc.program_status_value,
    bc.offer_milestones_current_offer_id,
    bc.offer_milestones_current_milestone_id,
    bc.current_contract_end_date_for_filtering,
    bc.current_contract_end_date,
    bc.csm_date_of_last_contact,
    bc.csm_date_of_next_contact,
    bc.outcomes_success_value_for_filtering,
    bc.outcomes_progress_for_filtering,
    bc.outcomes_buy_in_for_filtering,
    case
      when bc.outcomes_review_set is true or bc.outcomes_review_yes_date is not null then 'received'
      when bc.outcomes_review_ask_date is not null then 'asked'
      else 'not_asked'
    end as advocacy_review_status,
    case
      when bc.outcomes_testimonial_set is true or bc.outcomes_testimonial_yes_date is not null then 'received'
      when bc.outcomes_testimonial_ask_date is not null then 'asked'
      else 'not_asked'
    end as advocacy_testimonial_status,
    case
      when bc.outcomes_referral_set is true or bc.outcomes_referral_yes_date is not null then 'received'
      when bc.outcomes_referral_ask_date is not null then 'asked'
      else 'not_asked'
    end as advocacy_referral_status,
    case
      when bc.outcomes_renewal_set is true or bc.outcomes_renewal_yes_date is not null then 'received'
      when bc.outcomes_renewal_ask_date is not null then 'asked'
      else 'not_asked'
    end as advocacy_renewal_upsell_status,
    bc.next_steps_value,
    bc.next_steps_update_time as next_steps_updated_at
  from public.backup_company_clients bc
  left join selected_company sc on true
  where coalesce(sc.migration_status, 'mirror_only') = 'mirror_only'
    and bc.company_id = coalesce(sc.legacy_glide_row_id, p_company_id)
),
filtered_clients as (
  select c.*
  from source_clients c
  cross join params p
  where p.search_text <> ''
    and (
      p.client_name_search = ''
      or position(p.client_name_search in lower(coalesce(c.client_name, ''))) > 0
    )
    and (
      nullif(p_assigned_team_member_id, '') is null
      or c.csm_team_member_id = p_assigned_team_member_id
      or c.csm_secondary_assignee_id = p_assigned_team_member_id
    )
    and (
      nullif(p_assigned_team_member_id, '') is not null
      or nullif(p_csm_id, '') is null
      or (p_csm_id = '__unassigned' and c.csm_team_member_id is null)
      or c.csm_team_member_id = p_csm_id
    )
    and (
      nullif(p_secondary_assignee_id, '') is null
      or c.csm_secondary_assignee_id = p_secondary_assignee_id
    )
    and (
      p_program_values is null
      or cardinality(p_program_values) = 0
      or c.program_status_value = any(p_program_values)
    )
    and (
      nullif(p_offer_id, '') is null
      or c.offer_milestones_current_offer_id = p_offer_id
    )
    and (
      nullif(p_milestone_id, '') is null
      or c.offer_milestones_current_milestone_id = p_milestone_id
    )
    and (
      p_renewal_window is null
      or p_renewal_window = ''
      or (
        p_renewal_window = 'overdue'
        and coalesce(c.current_contract_end_date_for_filtering, c.current_contract_end_date) < current_date
      )
      or (
        p.renewal_days is not null
        and coalesce(c.current_contract_end_date_for_filtering, c.current_contract_end_date) >= current_date
        and coalesce(c.current_contract_end_date_for_filtering, c.current_contract_end_date) < current_date + make_interval(days => p.renewal_days + 1)
      )
    )
    and (
      p_last_contact_age is null
      or p_last_contact_age = ''
      or (p_last_contact_age = 'never' and c.csm_date_of_last_contact is null)
      or (
        p.last_contact_days is not null
        and c.csm_date_of_last_contact < current_date - make_interval(days => p.last_contact_days)
      )
    )
    and (
      p_next_contact_window is null
      or p_next_contact_window = ''
      or (p_next_contact_window = 'overdue' and c.csm_date_of_next_contact < current_date)
      or (p_next_contact_window = 'none' and c.csm_date_of_next_contact is null)
      or (
        p.next_contact_days is not null
        and c.csm_date_of_next_contact >= current_date
        and c.csm_date_of_next_contact < current_date + make_interval(days => p.next_contact_days + 1)
      )
    )
    and (nullif(p_success_status, '') is null or c.outcomes_success_value_for_filtering = p_success_status)
    and (nullif(p_progress_status, '') is null or c.outcomes_progress_for_filtering = p_progress_status)
    and (nullif(p_buy_in_status, '') is null or c.outcomes_buy_in_for_filtering = p_buy_in_status)
    and (nullif(p_review_advocacy_status, '') is null or c.advocacy_review_status = p_review_advocacy_status)
    and (nullif(p_testimonial_advocacy_status, '') is null or c.advocacy_testimonial_status = p_testimonial_advocacy_status)
    and (nullif(p_referral_advocacy_status, '') is null or c.advocacy_referral_status = p_referral_advocacy_status)
    and (nullif(p_renewal_upsell_advocacy_status, '') is null or c.advocacy_renewal_upsell_status = p_renewal_upsell_advocacy_status)
),
matches as (
  select
    'current_next_steps:' || fc.glide_row_id as source_key,
    'current_next_steps'::text as source_type,
    'Current Next Steps'::text as source_label,
    fc.glide_row_id as client_id,
    fc.client_name,
    fc.client_image,
    fc.csm_team_member_id,
    coalesce(fc.next_steps_updated_at, now()) as event_date,
    fc.next_steps_value as matched_text
  from filtered_clients fc
  cross join params p
  where fc.next_steps_value is not null
    and position(p.search_text in lower(fc.next_steps_value)) > 0

  union all

  select
    'app_history:' || che.id::text as source_key,
    case
      when che.next_steps is not null and position(p.search_text in lower(che.next_steps)) > 0 then 'next_steps_history'
      when che.notes is not null and position(p.search_text in lower(che.notes)) > 0 then 'history_note'
      when che.source ilike '%call_summary%' or che.event_type ilike '%call_summary%' then 'call_summary'
      else 'history_event'
    end as source_type,
    case
      when che.next_steps is not null and position(p.search_text in lower(che.next_steps)) > 0 then 'Next Steps History'
      when che.notes is not null and position(p.search_text in lower(che.notes)) > 0 then 'History Note'
      when che.source ilike '%call_summary%' or che.event_type ilike '%call_summary%' then 'Call Summary'
      else 'History Event'
    end as source_label,
    fc.glide_row_id as client_id,
    fc.client_name,
    fc.client_image,
    fc.csm_team_member_id,
    che.created_at as event_date,
    concat_ws(E'\n', che.next_steps, che.notes, che.summary, che.title) as matched_text
  from filtered_clients fc
  join selected_company sc on true
  join public.client_history_events che
    on che.company_id = sc.id
   and che.legacy_client_glide_row_id = fc.glide_row_id
  cross join params p
  where fc.source_kind = 'app'
    and position(
      p.search_text
      in lower(concat_ws(E'\n', che.next_steps, che.notes, che.summary, che.title))
    ) > 0

  union all

  select
    'legacy_history:' || bch.glide_row_id as source_key,
    'legacy_' || coalesce(bch.change_type_code, 'history') as source_type,
    case bch.change_type_code
      when 'next-steps' then 'Legacy Next Steps'
      when 'call-tracker' then 'Legacy Call Tracker'
      when 'renewal' then 'Legacy Renewal Note'
      when 'program-status' then 'Legacy Program Note'
      when 'contract' then 'Legacy Contract Note'
      when 'north-star' then 'Legacy North Star'
      else 'Legacy History'
    end as source_label,
    fc.glide_row_id as client_id,
    fc.client_name,
    fc.client_image,
    fc.csm_team_member_id,
    bch.modified_date as event_date,
    concat_ws(E'\n', bch.value, bch.original_value, bch.context) as matched_text
  from filtered_clients fc
  join public.backup_company_clients_history bch
    on bch.client_id = fc.glide_row_id
  cross join params p
  where position(
    p.search_text
    in lower(concat_ws(E'\n', bch.value, bch.original_value, bch.context))
  ) > 0
),
clean_matches as (
  select *
  from matches
  where nullif(trim(matched_text), '') is not null
),
numbered as (
  select
    clean_matches.*,
    count(*) over () as total_count
  from clean_matches
)
select
  numbered.source_key,
  numbered.source_type,
  numbered.source_label,
  numbered.client_id,
  numbered.client_name,
  numbered.client_image,
  numbered.csm_team_member_id,
  numbered.event_date,
  numbered.matched_text,
  numbered.total_count
from numbered
order by numbered.event_date desc nulls last, numbered.client_name asc, numbered.source_key asc
limit greatest(1, least(coalesce(p_limit, 25), 100))
offset greatest(0, coalesce(p_offset, 0));
$$;

grant execute on function public.search_client_notes(
  text,
  text,
  text,
  text,
  text,
  text,
  text[],
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  integer,
  integer
) to authenticated;
