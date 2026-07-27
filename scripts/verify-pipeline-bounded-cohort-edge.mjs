#!/usr/bin/env node

import { readFileSync } from "node:fs";

const read = (path) => readFileSync(path, "utf8");
const edge = read("supabase/functions/manage-pipeline-automation/index.ts");
const migration = read("supabase/migrations/20260727121000_pipeline_bounded_cohort_contract.sql");
const rollout = read("supabase/migrations/20260727120000_pipeline_safe_production_rollout.sql");
const config = read("supabase/config.toml");

const checks = [];
const check = (label, passed) => checks.push({ label, passed: Boolean(passed) });

check("management boundary retains gateway JWT verification and authenticated actor lookup",
  /\[functions\.manage-pipeline-automation\]\s*verify_jwt\s*=\s*true/m.test(config)
  && /requireAuthenticatedActor/.test(edge)
  && /isRegisteredSuperAdmin/.test(edge));
check("preview accepts only an explicitly bounded, valid ISO-date cohort",
  /ISO_DATE_PATTERN/.test(edge)
  && /parsed\.toISOString\(\)\.slice\(0, 10\) !== date/.test(edge)
  && /renewalDateFrom > renewalDateTo/.test(edge)
  && /toMs - fromMs\) \/ 86_400_000 > 366/.test(edge)
  && /maxItems < 1 \|\| maxItems > 100/.test(edge));
check("preview delegates cohort construction and token issuance to the service-only RPC",
  /\.rpc\("preview_renewal_pipeline_cohort"/.test(edge)
  && /p_actor_auth_user_id: authenticatedActor\.id/.test(edge)
  && /p_actor_member_id: actor\.memberId/.test(edge)
  && /binding: result\.binding \?\? null/.test(edge));
check("run remains SuperAdmin-only and consumes a bounded server token",
  /if \(actor\.role !== "super_admin"\)/.test(edge)
  && /previewToken\.length > 256/.test(edge)
  && /\.rpc\("consume_renewal_pipeline_cohort"/.test(edge)
  && /p_preview_token: previewToken/.test(edge));
check("legacy unbounded manual generator is unreachable from this Edge route",
  !/generate_due_renewal_pipeline_items/.test(edge));
check("read-only automation status uses the service-only status RPC",
  /action === "status"/.test(edge)
  && /\.rpc\("get_pipeline_automation_status"/.test(edge)
  && /get_pipeline_automation_status\(uuid\)/i.test(rollout));
check("database cohort contract is service-only, actor-bound, short-lived, and one-time",
  /pipeline_renewal_preview_tokens/.test(migration)
  && /v_as_of \+ interval '15 minutes'/i.test(migration)
  && /actor_auth_user_id is distinct from p_actor_auth_user_id/i.test(migration)
  && /v_token\.consumed_at is not null/.test(migration)
  && /grant execute on function public\.consume_renewal_pipeline_cohort[\s\S]*to service_role/i.test(migration));

const failures = checks.filter((check) => !check.passed);
for (const check of checks) console.log(`${check.passed ? "PASS" : "FAIL"} ${check.label}`);
console.log(`\n${checks.length - failures.length}/${checks.length} bounded-cohort Edge checks passed.`);
if (failures.length) process.exitCode = 1;
