#!/usr/bin/env node

import { createClient } from "@supabase/supabase-js";
import { getSupabaseEnv, loadDotEnv } from "./shared-env.mjs";

loadDotEnv();

const expectedOrigin = "https://zjauqflzxzsbpnivzsct.supabase.co";
const expectedGates = {
  "Ethical Scaling": { enabled: true, viewer: false },
  "Moves Method": { enabled: true, viewer: false },
  "Sales Kick": { enabled: false, viewer: false },
};

const { url, serviceRoleKey } = getSupabaseEnv();
if (new URL(url).origin !== expectedOrigin) {
  throw new Error(`Refusing unexpected Supabase origin ${new URL(url).origin}`);
}

const service = createClient(url, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function rows(query, label) {
  const result = await query;
  if (result.error) throw new Error(`${label}: ${result.error.message}`);
  return result.data ?? [];
}

async function exactCount(table, apply = (query) => query) {
  const result = await apply(service.from(table).select("*", { count: "exact", head: true }));
  if (result.error || !Number.isInteger(result.count)) {
    throw new Error(`${table}: ${result.error?.message ?? "count unavailable"}`);
  }
  return result.count;
}

const companies = await rows(
  service.from("companies").select("id,name,migration_status").in("name", Object.keys(expectedGates)),
  "companies",
);
const companyByName = new Map(companies.map((company) => [company.name, company]));
const companyIds = companies.map((company) => company.id);
const settings = await rows(
  service.from("company_settings").select("company_id,enable_pipeline,enable_pipeline_viewer_access").in("company_id", companyIds),
  "company settings",
);
const settingsByCompany = new Map(settings.map((row) => [row.company_id, row]));
const pipelines = await rows(
  service.from("company_pipelines").select("id,company_id,name,pipeline_type,is_enabled,auto_create_renewal_items,automation_settings,archived_at").in("company_id", companyIds).is("archived_at", null),
  "company pipelines",
);
const unsafePipelines = pipelines.filter((pipeline) => {
  const automation = pipeline.automation_settings ?? {};
  return pipeline.auto_create_renewal_items === true
    || automation.automation_paused !== true
    || automation.renewal_generation_enabled === true
    || automation.offboard_sync_enabled === true
    || automation.stage_task_creation_enabled === true;
});

const pendingScheduledActivations = await exactCount(
  "scheduled_contract_activations",
  (query) => query.eq("status", "pending"),
);
const gateESchedules = await rows(
  service.from("scheduled_contract_activations").select("status,blocked_reason").order("created_at"),
  "scheduled activation evidence",
);
const scheduleOutcomes = gateESchedules.reduce((counts, row) => {
  const key = row.status === "blocked" ? `${row.status}:${row.blocked_reason}` : row.status;
  counts[key] = (counts[key] ?? 0) + 1;
  return counts;
}, {});

const members = await rows(
  service.from("company_members").select("company_id,role,status,is_read_only,auth_user_id").in("company_id", companyIds),
  "company members",
);
const authUsers = await service.auth.admin.listUsers({ page: 1, perPage: 1000 });
if (authUsers.error) throw new Error(`auth users: ${authUsers.error.message}`);
const temporaryPipelineUsers = authUsers.data.users
  .filter((user) => user.email?.startsWith("pipeline-gate-c1-"))
  .map((user) => user.id);
const roleReadiness = {};
for (const company of companies) {
  roleReadiness[company.name] = members
    .filter((member) => member.company_id === company.id)
    .reduce((counts, member) => {
      const key = [member.status, member.role, member.is_read_only ? "read_only" : "write", member.auth_user_id ? "auth" : "no_auth"].join(":");
      counts[key] = (counts[key] ?? 0) + 1;
      return counts;
    }, {});
}

const anonymousStatuses = {};
for (const functionName of ["manage-company-pipeline", "manage-pipeline-workspace", "manage-pipeline-automation"]) {
  const response = await fetch(`${url}/functions/v1/${functionName}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "access" }),
  });
  anonymousStatuses[functionName] = response.status;
}

const failures = [];
for (const [name, expected] of Object.entries(expectedGates)) {
  const company = companyByName.get(name);
  if (!company) {
    failures.push(`${name}: company missing`);
    continue;
  }
  const actual = settingsByCompany.get(company.id);
  if (!actual || actual.enable_pipeline !== expected.enabled || actual.enable_pipeline_viewer_access !== expected.viewer) {
    failures.push(`${name}: expected Pipeline=${expected.enabled}, Viewer=${expected.viewer}`);
  }
}
if (unsafePipelines.length) failures.push(`${unsafePipelines.length} Pipeline configuration(s) are not safely paused`);
if (pendingScheduledActivations !== 0) failures.push(`${pendingScheduledActivations} scheduled activation(s) remain pending`);
if (temporaryPipelineUsers.length) failures.push(`${temporaryPipelineUsers.length} temporary Pipeline auth identity/identities remain`);
for (const [name, status] of Object.entries(anonymousStatuses)) {
  if (status !== 401) failures.push(`${name}: anonymous request expected 401, received ${status}`);
}

console.log(JSON.stringify({
  gate: "Pipeline Gate F frontend release preflight",
  mode: "read-only",
  checkedAt: new Date().toISOString(),
  projectRef: new URL(url).hostname.split(".")[0],
  companies: companies.map((company) => ({
    name: company.name,
    migrationStatus: company.migration_status,
    gates: settingsByCompany.get(company.id) ?? null,
    activePipelines: pipelines.filter((pipeline) => pipeline.company_id === company.id).map((pipeline) => ({
      name: pipeline.name,
      type: pipeline.pipeline_type,
      enabled: pipeline.is_enabled,
    })),
  })),
  pausedPipelineAutomations: unsafePipelines.length === 0,
  pendingScheduledActivations,
  scheduleOutcomes,
  anonymousStatuses,
  roleReadiness,
  temporaryPipelineUsers: temporaryPipelineUsers.length,
  failures,
}, null, 2));

if (failures.length) process.exit(1);
