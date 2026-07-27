#!/usr/bin/env node

import { readFileSync } from "node:fs";

const read = (path) => readFileSync(path, "utf8");
const migration = read("supabase/migrations/20260727120000_pipeline_safe_production_rollout.sql");
const rollback = read("supabase/rollbacks/20260727120000_pipeline_safe_production_rollout.sql");
const cohort = read("supabase/migrations/20260727121000_pipeline_bounded_cohort_contract.sql");
const cohortRollback = read("supabase/rollbacks/20260727121000_pipeline_bounded_cohort_contract.sql");
const preview = read("supabase/migrations/20260724173000_pipeline_current_contract_preview.sql");
const scheduled = read("supabase/migrations/20260720010000_early_renewal_scheduled_activation.sql");

const checks = [];
const check = (label, passed) => checks.push({ label, passed: Boolean(passed) });

check("global scheduler controls default to paused", /scheduler_paused boolean not null default true/i.test(migration)
  && /renewal_materialization_paused boolean not null default true/i.test(migration)
  && !/scheduled_contract_activation_paused/i.test(migration));
check("first-backfill and recurring enrollment are distinct and disabled", /first_backfill_enabled boolean not null default false/i.test(migration)
  && /recurring_enabled boolean not null default false/i.test(migration)
  && /first_backfill_completed_at/i.test(migration) && /recurring_next_run_at/i.test(migration)
  && /recurring_window_days integer not null default 1 check \(recurring_window_days = 1\)/i.test(migration));
check("first backfill requires an explicit ordered date window", /first_backfill_window_start/i.test(migration)
  && /first_backfill_window_end/i.test(migration) && /first_backfill_window_start <= first_backfill_window_end/i.test(migration));
check("materialization requires explicit window, pipeline, cap, and run type", /materialize_renewal_pipeline_window\([\s\S]*p_pipeline_id uuid,[\s\S]*p_window_start timestamptz,[\s\S]*p_window_end timestamptz,[\s\S]*p_max_create integer,[\s\S]*p_run_key text,[\s\S]*p_run_type text/i.test(migration));
check("current-contract preview remains the sole eligibility source", /from public\.preview_due_renewal_pipeline_items\(p_company_id, p_pipeline_id, p_evaluation_as_of\)/i.test(migration)
  && !/from public\.client_contracts[\s\S]{0,120}materialize_renewal_pipeline_window/i.test(migration));
check("renewal materialization order is deterministic", /order by contract_end_at, client_id, contract_id/i.test(migration));
check("source contract and automation-key duplicate defenses are retained", /on conflict\(company_id, automation_key\)[\s\S]{0,100}do nothing/i.test(migration)
  && /client_pipeline_items_active_source_contract_unique_idx/i.test(read("supabase/migrations/20260715020000_pipeline_phase_3_4_workflows.sql")));
check("company lock and every automation kill switch are enforced", /pg_advisory_xact_lock\(hashtextextended\(p_company_id::text, 0\)\)/i.test(migration)
  && /v_controls\.scheduler_paused or v_controls\.renewal_materialization_paused/i.test(migration)
  && /is_company_pipeline_enabled\(p_company_id\)/i.test(migration)
  && /automation_paused/i.test(migration) && /renewal_generation_enabled/i.test(migration));
check("run keys bind immutable materialization inputs", /Automation run key % was already bound to different immutable inputs/i.test(migration)
  && /v_run\.window_start_at is distinct from p_window_start/i.test(migration)
  && /v_run\.max_create is distinct from p_max_create/i.test(migration)
  && /if v_run\.status = 'completed'/i.test(migration));
check("scheduler run keys bind normalized immutable inputs while paused cron is inert", /Scheduler run key % was already bound to different immutable inputs/i.test(migration)
  && /v_run_as_of timestamptz := date_trunc\('minute', p_as_of\)/i.test(migration)
  && /if v_controls\.scheduler_paused then return jsonb_build_object\('status', 'paused'/i.test(migration));
check("per-company and total creation caps are applied", /per_company_max_create/i.test(migration)
  && /max_total_create/i.test(migration) && /v_created >= p_max_create/i.test(migration)
  && /exit when v_total >= least\(p_max_total_create, v_controls\.max_total_create\)/i.test(migration));
check("scheduler only selects due enabled company renewal pipelines", /settings\.first_backfill_scheduled_for <= p_as_of/i.test(migration)
  && /settings\.recurring_next_run_at <= p_as_of/i.test(migration)
  && /pipeline\.pipeline_type = 'renewal' and pipeline\.is_enabled and pipeline\.auto_create_renewal_items/i.test(migration)
  && /company_settings\.enable_pipeline/i.test(migration));
check("first backfill is continuation-safe when capped", /if p_run_type = 'first_backfill' then[\s\S]*first_backfill_completed_at = case when v_capped = 0 then now\(\) else null end/i.test(migration)
  && /first_backfill_attempt = case when v_capped = 0 then first_backfill_attempt else first_backfill_attempt \+ 1 end/i.test(migration));
check("scheduler has failure isolation and durable scheduler/run audit evidence", /pipeline_scheduler_runs/i.test(migration)
  && /begin[\s\S]*materialize_renewal_pipeline_window[\s\S]*exception when others then/i.test(migration)
  && /pipeline_materialization_completed/i.test(migration) && /pipeline_materialization_failed/i.test(migration));
check("existing scheduled activation processor remains independent and is not reinvoked", /externally_scheduled/i.test(migration)
  && !/process_due_scheduled_contract_activations\(p_as_of/i.test(migration)
  && /process_due_scheduled_contract_activations\(timestamptz, integer\)/i.test(scheduled));
check("recurring runs use evaluation time separately from the lead-window cohort", /p_evaluation_as_of timestamptz/i.test(migration)
  && /p_as_of \+ make_interval\(days => v_lead\)/i.test(migration)
  && /v_end := v_start \+ make_interval\(days => v_setting\.recurring_window_days\) - interval '1 microsecond'/i.test(migration)
  && /recurring_next_run_at = date_trunc\('day', p_evaluation_as_of\) \+ make_interval\(days => recurring_window_days\)/i.test(migration)
  && /p_window_end > p_evaluation_as_of \+ make_interval\(days => v_pipeline\.renewal_lead_days::integer\)/i.test(migration));
check("bounded cohort tokens bind exact actors, dates, cap, selected contracts, and expiry", /pipeline_renewal_preview_tokens/i.test(cohort)
  && /actor_auth_user_id uuid not null/i.test(cohort) && /selected_contract_ids uuid\[\] not null/i.test(cohort)
  && /previewed_at timestamptz not null default now\(\)/i.test(cohort) && /v_as_of \+ interval '15 minutes'/i.test(cohort) && /max_items between 1 and 100/i.test(cohort));
check("bounded cohort consume rejects altered, expired, cross-actor, and stale tokens", /Preview token binding does not match this request/i.test(cohort)
  && /Preview token has expired/i.test(cohort) && /Preview token is stale/i.test(cohort)
  && /pg_advisory_xact_lock/i.test(cohort));
check("cohort preview evaluates present eligibility and always returns explicit full-vs-selected counts", /v_as_of timestamptz := now\(\)/i.test(cohort)
  && /v_as_of := v_token\.previewed_at/i.test(cohort) && /selected_count/i.test(cohort)
  && /filter \(where selected\.contract_id is not null\)/i.test(cohort));
check("orchestrator and materializer are service-only", /revoke all on function public\.materialize_renewal_pipeline_window[\s\S]*public, anon, authenticated/i.test(migration)
  && /grant execute on function public\.run_due_pipeline_scheduler[\s\S]*to service_role/i.test(migration));
check("automation status is truthful, cron-aware, and service-only",
  /get_pipeline_automation_status/i.test(migration)
  && /jobname = \$1 and active/i.test(migration)
  && /scheduledContractActivation', 'independent_existing_scheduler'/i.test(migration)
  && /revoke all on function public\.get_pipeline_automation_status\(uuid\) from public, anon, authenticated/i.test(migration));
check("operational tables are service-only", /enable row level security;[\s\S]*revoke all on public\.pipeline_scheduler_controls, public\.pipeline_renewal_rollout_settings, public\.pipeline_scheduler_runs/i.test(migration));
check("rollback durably pauses and skips destructive teardown when evidence exists",
  rollback.indexOf("set scheduler_paused = true") < rollback.indexOf("v_has_evidence")
  && /if v_has_evidence then[\s\S]*raise warning[\s\S]*return;/i.test(rollback)
  && !/raise exception 'Rollback refused/i.test(rollback));
check("rollback removes the new service functions and foundations", /drop function if exists public\.run_due_pipeline_scheduler/i.test(rollback)
  && /drop function if exists public\.materialize_renewal_pipeline_window/i.test(rollback)
  && /drop table if exists public\.pipeline_scheduler_runs/i.test(rollback));
check("bounded-cohort rollback revokes execution before preserving evidence",
  cohortRollback.indexOf("revoke execute") < cohortRollback.indexOf("v_has_evidence")
  && /if v_has_evidence then[\s\S]*raise warning[\s\S]*return;/i.test(cohortRollback)
  && /drop table if exists public\.pipeline_renewal_preview_tokens/i.test(cohortRollback));
check("preview migration still establishes current-contract source of truth", /Historical\/superseded contracts are never eligible/i.test(preview));
check("rollout SQL never mutates Glide backup tables", !/\b(?:insert into|update|delete from)\s+public\.backup_/i.test(migration));

const failures = checks.filter(({ passed }) => !passed);
for (const { label, passed } of checks) console.log(`${passed ? "PASS" : "FAIL"} ${label}`);
console.log(`\n${checks.length - failures.length}/${checks.length} checks passed.`);
if (failures.length) process.exitCode = 1;
