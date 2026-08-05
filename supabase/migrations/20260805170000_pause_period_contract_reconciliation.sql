-- Pause-period contract reconciliation.
--
-- New pauses are recorded as immutable periods bound to one exact contract.
-- The approved window is applied provisionally and reconciled to the actual
-- return date. Historical pauses without enough evidence are preserved and
-- flagged for review instead of silently changing contract dates.

alter table public.company_settings
  add column if not exists extend_contract_for_pauses boolean not null default true;

create table if not exists public.client_pause_periods (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  legacy_client_glide_row_id text not null,
  contract_id uuid references public.client_contracts(id) on delete set null,
  status text not null default 'open'
    check (status in ('open', 'completed', 'review_required', 'cancelled')),
  effective_pause_date date not null,
  planned_return_date date,
  actual_return_date date,
  planned_days integer not null default 0 check (planned_days >= 0),
  applied_extension_days integer not null default 0,
  actual_days integer,
  reconciliation_delta_days integer,
  baseline_contract_end_date timestamptz,
  projected_contract_end_date timestamptz,
  final_contract_end_date timestamptz,
  reason text,
  notes text,
  opened_by_auth_user_id uuid references auth.users(id) on delete set null,
  opened_by_member_id uuid references public.company_members(id) on delete set null,
  closed_by_auth_user_id uuid references auth.users(id) on delete set null,
  closed_by_member_id uuid references public.company_members(id) on delete set null,
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists client_pause_periods_one_open_per_client_idx
  on public.client_pause_periods (client_id)
  where status = 'open';

create index if not exists client_pause_periods_company_status_idx
  on public.client_pause_periods (company_id, status, effective_pause_date desc);

create index if not exists client_pause_periods_client_created_idx
  on public.client_pause_periods (client_id, created_at desc);

drop trigger if exists client_pause_periods_set_updated_at
  on public.client_pause_periods;
create trigger client_pause_periods_set_updated_at
before update on public.client_pause_periods
for each row execute function public.set_updated_at();

alter table public.client_pause_periods enable row level security;

drop policy if exists "client_pause_periods_company_read"
  on public.client_pause_periods;
create policy "client_pause_periods_company_read"
on public.client_pause_periods
for select
to authenticated
using (public.can_read_company(company_id));

revoke all on table public.client_pause_periods
  from public, anon, authenticated;
grant select on table public.client_pause_periods to authenticated;
grant all on table public.client_pause_periods to service_role;

create table if not exists public.client_pause_operations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  pause_period_id uuid references public.client_pause_periods(id) on delete set null,
  operation_key text not null,
  operation_type text not null
    check (operation_type in ('pause', 'update_pause', 'reactivate')),
  result jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (company_id, operation_key)
);

alter table public.client_pause_operations enable row level security;
revoke all on table public.client_pause_operations
  from public, anon, authenticated;
grant all on table public.client_pause_operations to service_role;

create or replace function public.apply_client_pause_transition(
  p_company_id uuid,
  p_client_id uuid,
  p_target_status text,
  p_reason text,
  p_notes text,
  p_effective_pause_date date,
  p_planned_return_date date,
  p_actual_return_date date,
  p_operation_key text,
  p_actor_auth_user_id uuid,
  p_actor_member_id uuid,
  p_actor_role text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_client public.clients%rowtype;
  v_updated_client public.clients%rowtype;
  v_contract public.client_contracts%rowtype;
  v_updated_contract public.client_contracts%rowtype;
  v_period public.client_pause_periods%rowtype;
  v_history public.client_history_events%rowtype;
  v_existing_result jsonb;
  v_before jsonb;
  v_after jsonb;
  v_result jsonb;
  v_operation_type text;
  v_status_label text;
  v_summary text;
  v_extension_enabled boolean;
  v_planned_days integer := 0;
  v_actual_days integer;
  v_desired_extension integer := 0;
  v_delta integer := 0;
  v_contract_end timestamptz;
  v_new_contract_end timestamptz;
  v_contract_days numeric;
  v_review_reason text;
begin
  if coalesce((select auth.role()), '') <> 'service_role' then
    raise insufficient_privilege using message =
      'Pause transitions are service-only.';
  end if;

  if coalesce(btrim(p_operation_key), '') = '' then
    raise exception 'A pause operation key is required.';
  end if;

  select operation.result
  into v_existing_result
  from public.client_pause_operations operation
  where operation.company_id = p_company_id
    and operation.operation_key = p_operation_key;

  if v_existing_result is not null then
    return v_existing_result;
  end if;

  select * into strict v_client
  from public.clients client
  where client.id = p_client_id
    and client.company_id = p_company_id
    and client.archived_at is null
  for update;

  -- Recheck after the client lock so concurrent retries with the same key
  -- return the committed result instead of applying the transition twice.
  select operation.result
  into v_existing_result
  from public.client_pause_operations operation
  where operation.company_id = p_company_id
    and operation.operation_key = p_operation_key;

  if v_existing_result is not null then
    return v_existing_result;
  end if;

  select coalesce(settings.extend_contract_for_pauses, true)
  into v_extension_enabled
  from public.company_settings settings
  where settings.company_id = p_company_id;
  v_extension_enabled := coalesce(v_extension_enabled, true);

  if p_target_status = 'paused' then
    if p_effective_pause_date is null or p_planned_return_date is null then
      raise exception 'Add both the effective pause date and planned return date.';
    end if;
    if p_planned_return_date < p_effective_pause_date then
      raise exception 'Planned return date cannot be before the pause date.';
    end if;

    v_planned_days := p_planned_return_date - p_effective_pause_date;

    if v_client.program_status_value = 'paused' then
      v_operation_type := 'update_pause';

      select * into v_period
      from public.client_pause_periods period
      where period.client_id = v_client.id
        and period.status = 'open'
      for update;

      if v_period.id is null then
        raise exception
          'This pause predates structured pause tracking. Reactivate it without a contract adjustment, then use the historical cleanup review before changing dates.';
      end if;

      if p_effective_pause_date <> v_period.effective_pause_date then
        raise exception
          'The effective pause date is locked after the pause begins.';
      end if;

      v_extension_enabled := case
        when v_period.metadata->>'contract_extension_enabled' = 'true' then true
        when v_period.metadata->>'contract_extension_enabled' = 'false' then false
        else v_extension_enabled
      end;

      if v_period.contract_id is not null then
        select * into v_contract
        from public.client_contracts contract
        where contract.id = v_period.contract_id
          and contract.company_id = p_company_id
        for update;
      end if;

      v_desired_extension :=
        case
          when v_extension_enabled
            and v_contract.id is not null
            and v_contract.archived_at is null
          then v_planned_days
          else 0
        end;
      v_delta := v_desired_extension - v_period.applied_extension_days;

      if v_contract.id is not null and v_delta <> 0 then
        v_contract_end := coalesce(
          v_contract.end_date,
          case
            when v_contract.start_date is not null
              and v_contract.contract_days is not null
            then v_contract.start_date
              + make_interval(days => round(v_contract.contract_days)::integer)
            else null
          end
        );
        if v_contract_end is null then
          raise exception 'The bound contract has no usable end date.';
        end if;
        v_new_contract_end := v_contract_end + make_interval(days => v_delta);
        v_contract_days :=
          case
            when v_contract.contract_days is null then null
            else v_contract.contract_days + v_delta
          end;

        update public.client_contracts
        set end_date = v_new_contract_end,
            contract_days = v_contract_days,
            metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
              'latest_pause_period_id', v_period.id,
              'latest_pause_extension_days', v_desired_extension,
              'latest_pause_extension_at', now()
            )
        where id = v_contract.id
        returning * into v_updated_contract;
      else
        v_updated_contract := v_contract;
      end if;

      update public.client_pause_periods
      set planned_return_date = p_planned_return_date,
          planned_days = v_planned_days,
          applied_extension_days = v_desired_extension,
          projected_contract_end_date =
            case
              when v_updated_contract.id is not null
              then v_updated_contract.end_date
              else projected_contract_end_date
            end,
          reason = p_reason,
          notes = p_notes,
          metadata = metadata || jsonb_build_object(
            'last_updated_by_role', p_actor_role,
            'last_updated_at', now()
          )
      where id = v_period.id
      returning * into v_period;

      if v_updated_contract.id is not null then
        select * into v_updated_client
        from public.refresh_client_contract_summary(
          p_company_id,
          v_client.id,
          now()
        );
      else
        v_updated_client := v_client;
      end if;

      update public.clients
      set program_status_reason = p_reason,
          program_paused_return_date =
            p_planned_return_date::timestamptz,
          program_latest_pause_extension_days = v_desired_extension
      where id = v_client.id
      returning * into v_updated_client;

      v_summary := format(
        'Updated pause return date to %s. Contract adjustment changed by %s day%s.',
        to_char(p_planned_return_date, 'Mon FMDD, YYYY'),
        v_delta,
        case when abs(v_delta) = 1 then '' else 's' end
      );
    else
      v_operation_type := 'pause';

      select contract.* into v_contract
      from public.client_contracts contract
      where contract.company_id = p_company_id
        and contract.client_id = v_client.glide_row_id
        and contract.archived_at is null
        and lower(coalesce(contract.status, 'active'))
          in ('active', 'current_summary')
        and lower(coalesce(
          contract.contract_type,
          contract.metadata->>'contract_type',
          'standard'
        )) <> 'add_on'
        and (contract.start_date is null
          or contract.start_date::date <= p_effective_pause_date)
        and (
          contract.end_date is null
          or contract.end_date::date >= p_effective_pause_date
          or (
            contract.start_date is not null
            and contract.contract_days is not null
            and (
              contract.start_date
                + make_interval(days => round(contract.contract_days)::integer)
            )::date >= p_effective_pause_date
          )
        )
      order by
        case
          when contract.end_date::date = coalesce(
            v_client.current_contract_end_date_for_filtering,
            v_client.current_contract_end_date
          )::date then 0
          else 1
        end,
        case
          when lower(coalesce(contract.status, 'active')) = 'active' then 0
          else 1
        end,
        coalesce(contract.end_date, 'infinity'::timestamptz) desc,
        contract.created_at desc
      limit 1
      for update;

      v_contract_end := coalesce(
        v_contract.end_date,
        case
          when v_contract.start_date is not null
            and v_contract.contract_days is not null
          then v_contract.start_date
            + make_interval(days => round(v_contract.contract_days)::integer)
          else null
        end
      );

      v_desired_extension :=
        case
          when v_extension_enabled
            and v_contract.id is not null
            and v_contract_end is not null
          then v_planned_days
          else 0
        end;

      insert into public.client_pause_periods (
        company_id,
        client_id,
        legacy_client_glide_row_id,
        contract_id,
        status,
        effective_pause_date,
        planned_return_date,
        planned_days,
        applied_extension_days,
        baseline_contract_end_date,
        reason,
        notes,
        opened_by_auth_user_id,
        opened_by_member_id,
        metadata
      ) values (
        p_company_id,
        v_client.id,
        v_client.glide_row_id,
        v_contract.id,
        'open',
        p_effective_pause_date,
        p_planned_return_date,
        v_planned_days,
        v_desired_extension,
        v_contract_end,
        p_reason,
        p_notes,
        p_actor_auth_user_id,
        p_actor_member_id,
        jsonb_build_object(
          'contract_extension_enabled', v_extension_enabled,
          'contract_binding', case
            when v_contract.id is null then 'no_eligible_contract'
            else 'exact_contract'
          end
        )
      )
      returning * into v_period;

      if v_desired_extension <> 0 then
        v_new_contract_end :=
          v_contract_end + make_interval(days => v_desired_extension);
        v_contract_days :=
          case
            when v_contract.contract_days is null then null
            else v_contract.contract_days + v_desired_extension
          end;

        update public.client_contracts
        set end_date = v_new_contract_end,
            contract_days = v_contract_days,
            metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
              'latest_pause_period_id', v_period.id,
              'latest_pause_extension_days', v_desired_extension,
              'latest_pause_extension_at', now()
            )
        where id = v_contract.id
        returning * into v_updated_contract;

        update public.client_pause_periods
        set projected_contract_end_date = v_updated_contract.end_date
        where id = v_period.id
        returning * into v_period;

        select * into v_updated_client
        from public.refresh_client_contract_summary(
          p_company_id,
          v_client.id,
          now()
        );
      else
        v_updated_contract := v_contract;
        v_updated_client := v_client;
      end if;

      update public.clients
      set program_status_value = 'paused',
          program_status_reason = p_reason,
          program_paused_return_date =
            p_planned_return_date::timestamptz,
          program_latest_paused_date =
            p_effective_pause_date::timestamptz,
          program_latest_pause_extension_days = v_desired_extension
      where id = v_client.id
      returning * into v_updated_client;

      v_summary := format(
        'Changed status from %s to paused. Planned return: %s.%s',
        coalesce(v_client.program_status_value, 'unset'),
        to_char(p_planned_return_date, 'Mon FMDD, YYYY'),
        case
          when v_desired_extension > 0 then format(
            ' Provisionally extended the bound contract by %s day%s.',
            v_desired_extension,
            case when v_desired_extension = 1 then '' else 's' end
          )
          when not v_extension_enabled then
            ' Contract extension is disabled for this company.'
          else
            ' No eligible contract was changed; review is required.'
        end
      );
    end if;
  elsif p_target_status in ('front-end', 'back-end')
    and v_client.program_status_value = 'paused' then
    v_operation_type := 'reactivate';

    if p_actual_return_date is null then
      raise exception 'Add the client''s actual return date.';
    end if;

    select * into v_period
    from public.client_pause_periods period
    where period.client_id = v_client.id
      and period.status = 'open'
    for update;

    if v_period.id is null then
      v_review_reason :=
        'No structured pause period exists for this historical pause.';

      insert into public.client_pause_periods (
        company_id,
        client_id,
        legacy_client_glide_row_id,
        status,
        effective_pause_date,
        planned_return_date,
        actual_return_date,
        planned_days,
        applied_extension_days,
        reason,
        notes,
        opened_by_auth_user_id,
        opened_by_member_id,
        closed_by_auth_user_id,
        closed_by_member_id,
        opened_at,
        closed_at,
        metadata
      ) values (
        p_company_id,
        v_client.id,
        v_client.glide_row_id,
        'review_required',
        coalesce(
          v_client.program_latest_paused_date::date,
          p_actual_return_date
        ),
        v_client.program_paused_return_date::date,
        p_actual_return_date,
        greatest(
          0,
          coalesce(v_client.program_paused_return_date::date,
            p_actual_return_date)
          - coalesce(v_client.program_latest_paused_date::date,
            p_actual_return_date)
        ),
        coalesce(v_client.program_latest_pause_extension_days, 0)::integer,
        p_reason,
        p_notes,
        p_actor_auth_user_id,
        p_actor_member_id,
        p_actor_auth_user_id,
        p_actor_member_id,
        coalesce(v_client.program_latest_paused_date, now()),
        now(),
        jsonb_build_object(
          'review_reason', v_review_reason,
          'legacy_pause', true,
          'contract_adjustment_applied', false
        )
      )
      returning * into v_period;

      update public.clients
      set program_status_value = p_target_status,
          program_status_reason = p_reason,
          program_paused_return_date = null
      where id = v_client.id
      returning * into v_updated_client;

      v_summary := format(
        'Changed status from paused to %s on %s. Contract dates were not changed because this historical pause needs review.',
        p_target_status,
        to_char(p_actual_return_date, 'Mon FMDD, YYYY')
      );
    else
      if p_actual_return_date < v_period.effective_pause_date then
        raise exception 'Actual return date cannot be before the pause date.';
      end if;

      v_actual_days := p_actual_return_date - v_period.effective_pause_date;
      v_extension_enabled := case
        when v_period.metadata->>'contract_extension_enabled' = 'true' then true
        when v_period.metadata->>'contract_extension_enabled' = 'false' then false
        else v_extension_enabled
      end;

      if v_period.contract_id is not null then
        select * into v_contract
        from public.client_contracts contract
        where contract.id = v_period.contract_id
          and contract.company_id = p_company_id
        for update;
      end if;

      if v_period.contract_id is not null
        and (v_contract.id is null or v_contract.archived_at is not null) then
        v_review_reason :=
          'The contract bound to this pause is no longer editable.';
      elsif v_extension_enabled and v_period.contract_id is null then
        v_review_reason :=
          'No eligible contract was bound when this pause began.';
      end if;

      v_desired_extension :=
        case
          when v_extension_enabled
            and v_contract.id is not null
            and v_contract.archived_at is null
          then v_actual_days
          else 0
        end;
      v_delta := v_desired_extension - v_period.applied_extension_days;

      if v_contract.id is not null
        and v_contract.archived_at is null
        and v_delta <> 0 then
        v_contract_end := coalesce(
          v_contract.end_date,
          case
            when v_contract.start_date is not null
              and v_contract.contract_days is not null
            then v_contract.start_date
              + make_interval(days => round(v_contract.contract_days)::integer)
            else null
          end
        );
        if v_contract_end is null then
          v_review_reason := 'The bound contract has no usable end date.';
        else
          v_new_contract_end := v_contract_end
            + make_interval(days => v_delta);
          v_contract_days :=
            case
              when v_contract.contract_days is null then null
              else v_contract.contract_days + v_delta
            end;

          update public.client_contracts
          set end_date = v_new_contract_end,
              contract_days = v_contract_days,
              metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
                'latest_pause_period_id', v_period.id,
                'latest_pause_actual_days', v_actual_days,
                'latest_pause_reconciled_at', now()
              )
          where id = v_contract.id
          returning * into v_updated_contract;
        end if;
      else
        v_updated_contract := v_contract;
      end if;

      update public.client_pause_periods
      set status = case
            when v_review_reason is null then 'completed'
            else 'review_required'
          end,
          actual_return_date = p_actual_return_date,
          actual_days = v_actual_days,
          reconciliation_delta_days =
            case when v_review_reason is null then v_delta else null end,
          applied_extension_days =
            case
              when v_review_reason is null then v_desired_extension
              else applied_extension_days
            end,
          final_contract_end_date =
            case
              when v_updated_contract.id is not null
              then v_updated_contract.end_date
              else projected_contract_end_date
            end,
          closed_by_auth_user_id = p_actor_auth_user_id,
          closed_by_member_id = p_actor_member_id,
          closed_at = now(),
          notes = coalesce(p_notes, notes),
          metadata = metadata || jsonb_strip_nulls(jsonb_build_object(
            'review_reason', v_review_reason,
            'reconciled_by_role', p_actor_role,
            'reconciled_at', now()
          ))
      where id = v_period.id
      returning * into v_period;

      if v_updated_contract.id is not null then
        select * into v_updated_client
        from public.refresh_client_contract_summary(
          p_company_id,
          v_client.id,
          now()
        );
      else
        v_updated_client := v_client;
      end if;

      update public.clients
      set program_status_value = p_target_status,
          program_status_reason = p_reason,
          program_paused_return_date = null,
          program_latest_pause_extension_days =
            case
              when v_review_reason is null then v_desired_extension
              else program_latest_pause_extension_days
            end
      where id = v_client.id
      returning * into v_updated_client;

      v_summary := format(
        'Changed status from paused to %s. Actual return: %s.%s',
        p_target_status,
        to_char(p_actual_return_date, 'Mon FMDD, YYYY'),
        case
          when v_review_reason is not null then
            format(' Contract dates were not changed: %s', v_review_reason)
          when v_delta = 0 then
            ' The planned extension already matched the actual pause.'
          else format(
            ' Reconciled the bound contract by %s day%s; total pause extension is %s day%s.',
            v_delta,
            case when abs(v_delta) = 1 then '' else 's' end,
            v_desired_extension,
            case when v_desired_extension = 1 then '' else 's' end
          )
        end
      );
    end if;
  else
    raise exception
      'Pause reconciliation supports pausing, editing an open pause, or reactivating a paused client.';
  end if;

  v_status_label := initcap(replace(p_target_status, '-', ' '));
  v_before := to_jsonb(v_client);
  v_after := to_jsonb(v_updated_client);

  insert into public.client_history_events (
    company_id,
    legacy_client_glide_row_id,
    actor_auth_user_id,
    actor_member_id,
    event_type,
    source,
    title,
    summary,
    notes,
    payload
  ) values (
    p_company_id,
    v_client.glide_row_id,
    p_actor_auth_user_id,
    p_actor_member_id,
    'client_status_changed',
    'client_pause_reconciliation',
    case
      when v_operation_type = 'update_pause' then 'Pause dates updated'
      else format('Status changed to %s', v_status_label)
    end,
    v_summary,
    p_notes,
    jsonb_build_object(
      'actor_role', p_actor_role,
      'operation_type', v_operation_type,
      'from_status', v_client.program_status_value,
      'to_status', p_target_status,
      'reason', p_reason,
      'effective_pause_date', v_period.effective_pause_date,
      'planned_return_date', v_period.planned_return_date,
      'actual_return_date', v_period.actual_return_date,
      'planned_days', v_period.planned_days,
      'actual_days', v_period.actual_days,
      'applied_extension_days', v_period.applied_extension_days,
      'reconciliation_delta_days', v_period.reconciliation_delta_days,
      'pause_period_id', v_period.id,
      'contract_id', v_period.contract_id,
      'review_required', v_period.status = 'review_required',
      'before', v_before,
      'after', v_after
    )
  )
  returning * into v_history;

  insert into public.app_audit_events (
    company_id,
    actor_auth_user_id,
    actor_member_id,
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
    p_company_id,
    p_actor_auth_user_id,
    p_actor_member_id,
    'client_pause_transition',
    'client_pause_reconciliation',
    'clients',
    v_updated_client.id,
    v_client.glide_row_id,
    'Client pause transition',
    v_summary,
    v_before,
    v_after,
    jsonb_build_object(
      'actor_role', p_actor_role,
      'operation_type', v_operation_type,
      'operation_key', p_operation_key,
      'pause_period_id', v_period.id,
      'contract_id', v_period.contract_id,
      'history_event_id', v_history.id
    )
  );

  v_result := jsonb_build_object(
    'ok', true,
    'client', to_jsonb(v_updated_client),
    'event', to_jsonb(v_history),
    'updatedContract',
      case
        when v_updated_contract.id is null then null
        else to_jsonb(v_updated_contract)
      end,
    'pausePeriod', to_jsonb(v_period),
    'operationType', v_operation_type,
    'reviewRequired', v_period.status = 'review_required',
    'message', v_summary
  );

  insert into public.client_pause_operations (
    company_id,
    client_id,
    pause_period_id,
    operation_key,
    operation_type,
    result
  ) values (
    p_company_id,
    v_client.id,
    v_period.id,
    p_operation_key,
    v_operation_type,
    v_result
  );

  return v_result;
end;
$$;

revoke all on function public.apply_client_pause_transition(
  uuid, uuid, text, text, text, date, date, date, text, uuid, uuid, text
) from public, anon, authenticated;
grant execute on function public.apply_client_pause_transition(
  uuid, uuid, text, text, text, date, date, date, text, uuid, uuid, text
) to service_role;

comment on function public.apply_client_pause_transition is
  'Atomically records pause periods, binds one exact contract, reconciles planned versus actual pause days, writes history/audit evidence, and safely flags ambiguous legacy pauses.';

-- Seed only high-confidence open pauses created by the pre-ledger RetainOS
-- workflow. This records existing evidence without changing any client or
-- contract dates. Ambiguous legacy CST pauses remain outside the ledger and
-- therefore fail closed on contract reconciliation.
with contract_matches as (
  select
    client.id as client_id,
    client.company_id,
    client.glide_row_id,
    client.program_latest_paused_date::date as effective_pause_date,
    client.program_paused_return_date::date as planned_return_date,
    coalesce(client.program_latest_pause_extension_days, 0)::integer
      as applied_extension_days,
    contract.id as contract_id,
    contract.end_date,
    count(*) over (partition by client.id) as contract_match_count
  from public.clients client
  join public.client_contracts contract
    on contract.company_id = client.company_id
   and contract.client_id = client.glide_row_id
   and contract.archived_at is null
   and lower(coalesce(contract.status, 'active'))
     in ('active', 'current_summary')
   and contract.end_date::date = coalesce(
     client.current_contract_end_date_for_filtering,
     client.current_contract_end_date
   )::date
  where client.archived_at is null
    and client.program_status_value = 'paused'
    and client.program_latest_paused_date is not null
    and client.program_paused_return_date is not null
    and client.program_latest_pause_extension_days is not null
),
safe_matches as (
  select *
  from contract_matches
  where contract_match_count = 1
    and planned_return_date >= effective_pause_date
)
insert into public.client_pause_periods (
  company_id,
  client_id,
  legacy_client_glide_row_id,
  contract_id,
  status,
  effective_pause_date,
  planned_return_date,
  planned_days,
  applied_extension_days,
  baseline_contract_end_date,
  projected_contract_end_date,
  opened_at,
  metadata
)
select
  match.company_id,
  match.client_id,
  match.glide_row_id,
  match.contract_id,
  'open',
  match.effective_pause_date,
  match.planned_return_date,
  match.planned_return_date - match.effective_pause_date,
  match.applied_extension_days,
  match.end_date
    - make_interval(days => match.applied_extension_days),
  match.end_date,
  match.effective_pause_date::timestamptz,
  jsonb_build_object(
    'seeded_from', 'pre_ledger_retainos_pause',
    'contract_extension_enabled', true,
    'historical_dates_changed', false
  )
from safe_matches match
where not exists (
  select 1
  from public.client_pause_periods existing
  where existing.client_id = match.client_id
    and existing.status = 'open'
);

notify pgrst, 'reload schema';
