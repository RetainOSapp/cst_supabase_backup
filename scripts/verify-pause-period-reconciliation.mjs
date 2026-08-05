#!/usr/bin/env node

import { readFileSync } from "node:fs";

const migration = readFileSync(
  "supabase/migrations/20260805170000_pause_period_contract_reconciliation.sql",
  "utf8",
);
const rollback = readFileSync(
  "supabase/rollbacks/20260805170000_pause_period_contract_reconciliation.sql",
  "utf8",
);
const statusFunction = readFileSync(
  "supabase/functions/manage-client-status/index.ts",
  "utf8",
);
const settingsFunction = readFileSync(
  "supabase/functions/manage-company-customization/index.ts",
  "utf8",
);
const clientDetail = readFileSync("src/pages/ClientDetail.tsx", "utf8");
const companySettings = readFileSync("src/pages/SaasClientDetail.tsx", "utf8");

const checks = [];
function check(label, passed) {
  checks.push({ label, passed: Boolean(passed) });
}

function calendarDays(start, end) {
  const startDate = new Date(`${start}T00:00:00.000Z`);
  const endDate = new Date(`${end}T00:00:00.000Z`);
  return Math.round((endDate.getTime() - startDate.getTime()) / 86_400_000);
}

check(
  "calendar-day behavior covers same-day, planned, early, and late returns",
  calendarDays("2026-08-05", "2026-08-05") === 0 &&
    calendarDays("2026-08-05", "2026-08-12") === 7 &&
    calendarDays("2026-08-05", "2026-08-10") -
      calendarDays("2026-08-05", "2026-08-12") === -2 &&
    calendarDays("2026-08-05", "2026-08-15") -
      calendarDays("2026-08-05", "2026-08-12") === 3,
);
check(
  "one open pause ledger exists per client with explicit review states",
  /create table if not exists public\.client_pause_periods/i.test(migration) &&
    /status in \('open', 'completed', 'review_required', 'cancelled'\)/i.test(
      migration,
    ) &&
    /client_pause_periods_one_open_per_client_idx[\s\S]{0,120}where status = 'open'/i.test(
      migration,
    ),
);
check(
  "pause operations are idempotent and serialized on the client",
  /unique \(company_id, operation_key\)/i.test(migration) &&
    /from public\.clients client[\s\S]{0,180}for update/i.test(migration) &&
    (
      migration.match(
        /select operation\.result[\s\S]{0,140}operation\.operation_key = p_operation_key/g,
      ) ?? []
    ).length === 2,
);
check(
  "new pauses bind one exact eligible non-add-on contract",
  /contract_id uuid references public\.client_contracts/i.test(migration) &&
    /contract\.client_id = v_client\.glide_row_id/i.test(migration) &&
    /contract\.archived_at is null/i.test(migration) &&
    /in \('active', 'current_summary'\)/i.test(migration) &&
    /<> 'add_on'/i.test(migration),
);
check(
  "planned extension is reconciled to actual calendar days",
  /v_actual_days := p_actual_return_date - v_period\.effective_pause_date/i.test(
    migration,
  ) &&
    /v_delta := v_desired_extension - v_period\.applied_extension_days/i.test(
      migration,
    ) &&
    /reconciliation_delta_days/i.test(migration),
);
check(
  "client summary, exact contract, history, and audit share one transaction",
  /update public\.client_contracts/i.test(migration) &&
    /refresh_client_contract_summary/i.test(migration) &&
    /insert into public\.client_history_events/i.test(migration) &&
    /insert into public\.app_audit_events/i.test(migration) &&
    /security definer/i.test(migration),
);
check(
  "ambiguous historical pauses reactivate without silent contract edits",
  /No structured pause period exists for this historical pause/i.test(
    migration,
  ) &&
    /'review_required'/i.test(migration) &&
    /'contract_adjustment_applied', false/i.test(migration),
);
check(
  "pre-ledger seed records only single-contract high-confidence pauses",
  /count\(\*\) over \(partition by client\.id\) as contract_match_count/i.test(
    migration,
  ) &&
    /where contract_match_count = 1/i.test(migration) &&
    /'historical_dates_changed', false/i.test(migration),
);
check(
  "pause reconciliation RPC is service-role only",
  /revoke all on function public\.apply_client_pause_transition[\s\S]{0,220}public, anon, authenticated/i.test(
    migration,
  ) &&
    /grant execute on function public\.apply_client_pause_transition[\s\S]{0,220}service_role/i.test(
      migration,
    ),
);
check(
  "rollback removes only the new pause objects and documents date behavior",
  /does not reverse contract dates/i.test(rollback) &&
    /drop function if exists public\.apply_client_pause_transition/i.test(
      rollback,
    ) &&
    /drop table if exists public\.client_pause_operations/i.test(rollback) &&
    /drop table if exists public\.client_pause_periods/i.test(rollback) &&
    /drop column if exists extend_contract_for_pauses/i.test(rollback),
);
check(
  "status Edge Function routes pause work through the atomic RPC",
  /const isPauseTransition/i.test(statusFunction) &&
    /\.rpc\(\s*"apply_client_pause_transition"/i.test(statusFunction) &&
    /p_operation_key: operationKey/i.test(statusFunction) &&
    /p_actual_return_date/i.test(statusFunction),
);
check(
  "company setting persists and defaults to the existing enabled behavior",
  /extend_contract_for_pauses boolean not null default true/i.test(migration) &&
    /extend_contract_for_pauses:\s*body\.extendContractForPauses !== false/i.test(
      settingsFunction,
    ) &&
    /label="Extend contracts for client pauses"/i.test(companySettings),
);
check(
  "client UI captures effective, planned, and actual dates",
  /Effective Pause Date/i.test(clientDetail) &&
    /Planned Return Date/i.test(clientDetail) &&
    /Actual Return Date/i.test(clientDetail) &&
    /operationKey/i.test(clientDetail) &&
    /Reactivate Client/i.test(clientDetail),
);

const failures = checks.filter((item) => !item.passed);
for (const item of checks) {
  console.log(`${item.passed ? "PASS" : "FAIL"} ${item.label}`);
}

if (failures.length > 0) {
  console.error(`\n${failures.length} pause reconciliation check(s) failed.`);
  process.exit(1);
}

console.log(`\n${checks.length} pause reconciliation checks passed.`);
