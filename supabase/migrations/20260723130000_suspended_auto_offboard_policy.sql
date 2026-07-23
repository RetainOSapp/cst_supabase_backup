-- Company-configurable Suspended/MIA grace period.
--
-- Safe defaults:
--   * disabled for every company;
--   * 28 days when enabled;
--   * only clients with a real program_latest_suspended_date are eligible.
--
-- The effective churn/offboard date is the recorded Suspended timestamp plus
-- the configured grace period. The worker timestamp is retained separately in
-- history/audit metadata so delayed cron execution cannot move reporting into
-- the wrong month.

alter table public.company_settings
  add column if not exists enable_suspended_auto_offboard boolean
    not null default false,
  add column if not exists suspended_auto_offboard_days integer
    not null default 28;

do $constraint$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.company_settings'::regclass
      and conname = 'company_settings_suspended_auto_offboard_days_check'
  ) then
    alter table public.company_settings
      add constraint company_settings_suspended_auto_offboard_days_check
      check (suspended_auto_offboard_days between 1 and 365);
  end if;
end;
$constraint$;

create index if not exists clients_suspended_auto_offboard_due_idx
  on public.clients (company_id, program_latest_suspended_date)
  where program_status_value = 'suspended'
    and program_latest_suspended_date is not null
    and archived_at is null;

create or replace function public.process_due_suspended_auto_offboards(
  p_as_of timestamptz default now(),
  p_limit integer default 100
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_due record;
  v_after public.clients%rowtype;
  v_before jsonb;
  v_effective_at timestamptz;
  v_status_label text;
  v_churn_label text;
  v_summary text;
  v_history_id uuid;
  v_completed integer := 0;
  v_failed integer := 0;
begin
  if p_as_of is null then
    raise exception 'Processing timestamp is required.';
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 500 then
    raise exception 'Auto-offboard batch limit must be between 1 and 500.';
  end if;

  for v_due in
    select
      client.id,
      client.company_id,
      client.glide_row_id,
      client.client_name,
      client.program_latest_suspended_date,
      client.current_contract_end_date,
      settings.suspended_auto_offboard_days,
      settings.metadata
    from public.clients client
    join public.company_settings settings
      on settings.company_id = client.company_id
     and settings.enable_suspended_auto_offboard = true
    where client.archived_at is null
      and client.program_status_value = 'suspended'
      and client.program_latest_suspended_date is not null
      and client.program_latest_suspended_date
        + make_interval(days => settings.suspended_auto_offboard_days)
        <= p_as_of
    order by
      client.program_latest_suspended_date
        + make_interval(days => settings.suspended_auto_offboard_days),
      client.id
    limit p_limit
    for update of client skip locked
  loop
    begin
      select to_jsonb(client)
        into v_before
      from public.clients client
      where client.id = v_due.id;

      v_effective_at :=
        v_due.program_latest_suspended_date
        + make_interval(days => v_due.suspended_auto_offboard_days);
      v_status_label := coalesce(
        nullif(
          v_due.metadata -> 'program_status_labels' ->> 'suspended',
          ''
        ),
        'Suspended'
      );
      v_churn_label := v_status_label || ' auto-offboard';
      v_summary := format(
        'Automatically changed from %s to Offboarded after %s days without returning. Churn effective %s.',
        v_status_label,
        v_due.suspended_auto_offboard_days,
        v_effective_at::date
      );

      insert into public.company_churn_reasons (
        company_id,
        value,
        label,
        category,
        requires_notes,
        counts_as_churn,
        position,
        status,
        metadata
      ) values (
        v_due.company_id,
        'auto_suspended_timeout',
        v_churn_label,
        'automation',
        false,
        true,
        1000,
        'active',
        jsonb_build_object(
          'system_managed', true,
          'automation', 'suspended_timeout'
        )
      )
      on conflict (company_id, value) do update
      set
        label = excluded.label,
        category = excluded.category,
        requires_notes = false,
        counts_as_churn = true,
        status = 'active',
        archived_at = null,
        metadata = coalesce(
          public.company_churn_reasons.metadata,
          '{}'::jsonb
        ) || excluded.metadata;

      update public.clients client
      set
        program_status_value = 'off-boarded',
        program_status_reason = v_summary,
        program_paused_return_date = null,
        client_age_date_offboarded = v_effective_at,
        client_age_date_offboarded_for_filtering = v_effective_at,
        churn_reason_value = 'auto_suspended_timeout',
        churn_comments = v_summary,
        metadata = coalesce(client.metadata, '{}'::jsonb)
          || jsonb_build_object(
            'offboarding',
            jsonb_build_object(
              'actual_end_date', v_effective_at,
              'contract_end_date', v_due.current_contract_end_date,
              'churned', true,
              'churn_status', 'churned',
              'churn_reason', 'auto_suspended_timeout',
              'churn_reason_label', v_churn_label,
              'notes', v_summary,
              'good_fit_for_offer', null,
              'recorded_at', p_as_of,
              'recorded_by_role', 'system',
              'automation', 'suspended_timeout',
              'suspended_at', v_due.program_latest_suspended_date,
              'grace_days', v_due.suspended_auto_offboard_days,
              'effective_at', v_effective_at
            )
          )
      where client.id = v_due.id
        and client.company_id = v_due.company_id
        and client.program_status_value = 'suspended'
        and client.program_latest_suspended_date
          = v_due.program_latest_suspended_date
      returning * into v_after;

      if v_after.id is null then
        continue;
      end if;

      insert into public.client_history_events (
        company_id,
        legacy_client_glide_row_id,
        event_type,
        source,
        title,
        summary,
        notes,
        payload
      ) values (
        v_due.company_id,
        v_due.glide_row_id,
        'client_status_changed',
        'suspended_auto_offboard',
        'Status automatically changed to Offboarded',
        v_summary,
        v_summary,
        jsonb_build_object(
          'actor_role', 'system',
          'from_status', 'suspended',
          'to_status', 'off-boarded',
          'reason', 'auto_suspended_timeout',
          'automation', 'suspended_timeout',
          'suspended_at', v_due.program_latest_suspended_date,
          'grace_days', v_due.suspended_auto_offboard_days,
          'effective_at', v_effective_at,
          'processed_at', p_as_of,
          'before', v_before,
          'after', to_jsonb(v_after)
        )
      )
      returning id into v_history_id;

      insert into public.app_audit_events (
        company_id,
        event_type,
        source,
        entity_table,
        entity_id,
        legacy_glide_row_id,
        title,
        summary,
        before_data,
        after_data,
        metadata
      ) values (
        v_due.company_id,
        'client_status_changed',
        'suspended_auto_offboard',
        'clients',
        v_due.id,
        v_due.glide_row_id,
        'Client automatically offboarded',
        coalesce(v_due.client_name, v_due.glide_row_id),
        v_before,
        to_jsonb(v_after),
        jsonb_build_object(
          'history_event_id', v_history_id,
          'actor_role', 'system',
          'from_status', 'suspended',
          'to_status', 'off-boarded',
          'automation', 'suspended_timeout',
          'suspended_at', v_due.program_latest_suspended_date,
          'grace_days', v_due.suspended_auto_offboard_days,
          'effective_at', v_effective_at,
          'processed_at', p_as_of
        )
      );

      v_completed := v_completed + 1;
    exception when others then
      v_failed := v_failed + 1;
      insert into public.app_audit_events (
        company_id,
        event_type,
        source,
        entity_table,
        entity_id,
        legacy_glide_row_id,
        title,
        summary,
        metadata
      ) values (
        v_due.company_id,
        'client_status_changed',
        'suspended_auto_offboard',
        'clients',
        v_due.id,
        v_due.glide_row_id,
        'Automatic offboarding needs review',
        'The Suspended/MIA auto-offboard worker could not process this client.',
        jsonb_build_object(
          'automation', 'suspended_timeout',
          'error', sqlerrm,
          'processed_at', p_as_of
        )
      );
    end;
  end loop;

  return jsonb_build_object(
    'completed_count', v_completed,
    'failed_count', v_failed,
    'remaining_due_count', (
      select count(*)
      from public.clients client
      join public.company_settings settings
        on settings.company_id = client.company_id
       and settings.enable_suspended_auto_offboard = true
      where client.archived_at is null
        and client.program_status_value = 'suspended'
        and client.program_latest_suspended_date is not null
        and client.program_latest_suspended_date
          + make_interval(days => settings.suspended_auto_offboard_days)
          <= p_as_of
    )
  );
end;
$$;

revoke all on function public.process_due_suspended_auto_offboards(
  timestamptz,
  integer
) from public, anon, authenticated;
grant execute on function public.process_due_suspended_auto_offboards(
  timestamptz,
  integer
) to service_role;

-- Explicit automated MIA churn must count as churn even when the effective
-- date is after the scheduled contract end or no trustworthy contract exists.
-- Patch only the app-owned half of the actor-scoped function; the mirror half
-- remains unchanged.
do $actor_kpi_patch$
declare
  function_definition text;
  old_predicate constant text := $old$
        and contract.current_contract_end_date is not null
        and coalesce(
          client.client_age_date_offboarded,
          client.client_age_date_offboarded_for_filtering
        ) < contract.current_contract_end_date
$old$;
  new_predicate constant text := $new$
        and (
          exists (
            select 1
            from public.clients source
            where source.company_id = client.company_id
              and source.glide_row_id = client.glide_row_id
              and source.churn_reason_value = 'auto_suspended_timeout'
          )
          or (
            contract.current_contract_end_date is not null
            and coalesce(
              client.client_age_date_offboarded,
              client.client_age_date_offboarded_for_filtering
            ) < contract.current_contract_end_date
          )
        )
$new$;
  replacement_count integer;
begin
  select pg_get_functiondef(
    'public.dashboard_kpi_counts_actor_scoped(text,text,text,text[],text,timestamptz,timestamptz,timestamptz,timestamptz)'::regprocedure
  ) into function_definition;

  replacement_count :=
    (
      length(function_definition)
      - length(replace(function_definition, old_predicate, ''))
    ) / length(old_predicate);
  if replacement_count <> 1 then
    raise exception
      'Expected one app-owned churn predicate, found %',
      replacement_count;
  end if;

  execute replace(function_definition, old_predicate, new_predicate);
end;
$actor_kpi_patch$;

-- Once an automated MIA churn exists, it cannot become renewal eligible just
-- because its 28-day effective date fell after an old contract end.
do $renewal_patch$
declare
  function_definition text;
  old_predicate constant text := $old$
  where client.program_status_value not in ('paused', 'suspended')
    and (
$old$;
  new_predicate constant text := $new$
  where client.program_status_value not in ('paused', 'suspended')
    and not (
      client.program_status_value = 'off-boarded'
      and exists (
        select 1
        from public.clients source
        join selected_company company
          on company.id = source.company_id
        where source.glide_row_id = candidate.client_id
          and source.churn_reason_value = 'auto_suspended_timeout'
      )
    )
    and (
$new$;
  replacement_count integer;
begin
  select pg_get_functiondef(
    'public._dashboard_renewal_cohort_counts_fast_unchecked(text,text,text,text[],text,timestamptz,timestamptz,timestamptz,timestamptz,text)'::regprocedure
  ) into function_definition;

  replacement_count :=
    (
      length(function_definition)
      - length(replace(function_definition, old_predicate, ''))
    ) / length(old_predicate);
  if replacement_count <> 1 then
    raise exception
      'Expected one renewal eligibility predicate, found %',
      replacement_count;
  end if;

  execute replace(function_definition, old_predicate, new_predicate);
end;
$renewal_patch$;

do $cron$
declare
  v_exists boolean := false;
begin
  if to_regclass('cron.job') is not null then
    execute 'select exists(select 1 from cron.job where jobname = $1)'
      into v_exists using 'retainos-suspended-auto-offboards';
    if not v_exists then
      execute 'select cron.schedule($1, $2, $3)'
        using
          'retainos-suspended-auto-offboards',
          '*/15 * * * *',
          'select public.process_due_suspended_auto_offboards(now(), 100);';
    end if;
  end if;
end;
$cron$;

notify pgrst, 'reload schema';
