import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseEnv, loadDotEnv } from "./shared-env.mjs";

const COMPANY_LEGACY_ID = "ret_369acea9c33549fe";
const SOURCE_SHA256 = "6b6cc58a9fe622a1d72ecc4735d1e083a33c0daf43c66052f903a05b79a9aa43";
const EXPECTED_ROW_COUNT = 120;
const IMPORT_VERSION = "sales-kick-historical-v1";

function parseArgs(argv) {
  const args = new Map();
  for (const raw of argv) {
    const [key, value = "true"] = raw.split("=", 2);
    if (key.startsWith("--")) args.set(key.slice(2), value);
  }
  return args;
}

function iso(value) {
  return value ? `${value}T00:00:00.000Z` : null;
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

function featureValues(row, field) {
  const options = Array.isArray(field.options) ? field.options : [];
  const byLabel = new Map(options.map((option) => [String(option.label).toLowerCase(), option.value]));
  const values = [];
  for (const feature of row.featuresPurchased ?? []) {
    const option = byLabel.get(String(feature).toLowerCase());
    if (!option) throw new Error(`Unknown Features Purchased option "${feature}" for ${row.clientName}.`);
    values.push(option);
  }
  return values;
}

function requireField(fields, label) {
  const field = fields.find((item) => item.label === label && item.status === "active");
  if (!field) throw new Error(`Required Sales Kick custom field is missing: ${label}.`);
  return field;
}

const args = parseArgs(process.argv.slice(2));
const previewPath = args.get("preview");
const shouldApply = args.get("apply") === "true";
if (!previewPath) {
  console.error("Usage: node scripts/import-sales-kick-historical-clients.mjs --preview=/path/to/preview.json [--apply --allow-production --confirm-source-sha256=<hash> --confirm-row-count=120]");
  process.exit(1);
}

const preview = JSON.parse(await fs.readFile(path.resolve(previewPath), "utf8"));
if (preview.summary?.sourceSha256 !== SOURCE_SHA256) {
  throw new Error("Preview source hash does not match the approved Sales Kick export.");
}
if (preview.summary?.totalRows !== EXPECTED_ROW_COUNT || preview.rows?.length !== EXPECTED_ROW_COUNT) {
  throw new Error("Preview does not contain the approved 120 Sales Kick rows.");
}
if (shouldApply) {
  if (args.get("allow-production") !== "true") throw new Error("Refusing production import without --allow-production.");
  if (args.get("confirm-source-sha256") !== SOURCE_SHA256) throw new Error("Source hash confirmation is required.");
  if (args.get("confirm-row-count") !== String(EXPECTED_ROW_COUNT)) throw new Error("Row-count confirmation is required.");
}

loadDotEnv();
const { url, serviceRoleKey } = getSupabaseEnv();
const projectRef = new URL(url).hostname.split(".")[0];
if (projectRef !== "zjauqflzxzsbpnivzsct") throw new Error("Unexpected Supabase project.");
const supabase = createClient(url, serviceRoleKey, { auth: { persistSession: false } });

const { data: company, error: companyError } = await supabase
  .from("companies")
  .select("id, legacy_glide_row_id, name, migration_status")
  .eq("legacy_glide_row_id", COMPANY_LEGACY_ID)
  .eq("migration_status", "migrated")
  .single();
if (companyError) throw companyError;
if (company.name !== "Sales Kick") throw new Error("Company identity guard failed.");

const [{ count: existingClientCount, error: clientCountError }, { data: members, error: membersError }, { data: offers, error: offersError }, { data: fields, error: fieldsError }] = await Promise.all([
  supabase.from("clients").select("id", { count: "exact", head: true }).eq("company_id", company.id),
  supabase.from("company_members").select("id, legacy_glide_row_id, name, status, hide_from_csm_list").eq("company_id", company.id),
  supabase.from("company_offers").select("glide_row_id, name, status").eq("company_id", company.id).eq("status", "active"),
  supabase.from("company_custom_fields").select("id, key, label, options, status").eq("company_id", company.id),
]);
if (clientCountError) throw clientCountError;
if (membersError) throw membersError;
if (offersError) throw offersError;
if (fieldsError) throw fieldsError;
if ((existingClientCount ?? 0) !== 0) throw new Error("Sales Kick already has client records; refusing a first-import script.");

const memberByLegacyId = new Map((members ?? []).map((member) => [member.legacy_glide_row_id, member]));
for (const row of preview.rows) {
  const member = memberByLegacyId.get(row.assignedMemberId);
  if (!member || !["active", "pending"].includes(member.status) || member.hide_from_csm_list) {
    throw new Error(`Assignment guard failed for ${row.clientName}.`);
  }
}

const pathway = (offers ?? []).find((offer) => offer.name === "Sales Kick Software");
if (!pathway) throw new Error("Sales Kick Software pathway is missing.");
const { data: milestones, error: milestonesError } = await supabase
  .from("company_offer_milestones")
  .select("glide_row_id, name, target_days_to_complete, status")
  .eq("company_id", company.id)
  .eq("offer_id", pathway.glide_row_id)
  .eq("status", "active");
if (milestonesError) throw milestonesError;
const milestoneByName = new Map((milestones ?? []).map((milestone) => [milestone.name, milestone]));
for (const row of preview.rows.filter((row) => row.currentMilestone)) {
  if (!milestoneByName.has(row.currentMilestone)) {
    throw new Error(`Configured milestone is missing: ${row.currentMilestone}.`);
  }
}

const fieldConfig = {
  features: requireField(fields ?? [], "Features Purchased"),
  slack: requireField(fields ?? [], "Slack Channel Name"),
  onboardingForm: requireField(fields ?? [], "Onboarding Form Complete"),
  onboardingCall: requireField(fields ?? [], "Onboarding Call Complete"),
  grading: requireField(fields ?? [], "Grading Setup Complete"),
  calendar: requireField(fields ?? [], "Calendar Management Setup Complete"),
  financialData: requireField(fields ?? [], "Financial Data Setup Complete"),
  lns: requireField(fields ?? [], "LNS Setup Complete"),
};

const batchId = `${IMPORT_VERSION}:${SOURCE_SHA256.slice(0, 16)}`;
const manualContractReview = new Set(["Cole Gordon", "Justin Nelson", "Matt", "Brian Waldron"]);
const generatedClientId = (row) => `hist_sk_${SOURCE_SHA256.slice(0, 12)}_${row.rowNumber}`;
const importRows = preview.rows.map((row) => ({ ...row, clientId: generatedClientId(row) }));
const summary = {
  batchId,
  mode: shouldApply ? "apply" : "dry-run",
  clientCount: importRows.length,
  contractCount: importRows.filter((row) => row.contractStartDate && row.contractEndDate && !manualContractReview.has(row.clientName)).length,
  manualContractReview: [...manualContractReview],
  milestoneCount: importRows.filter((row) => row.currentMilestone).length,
  customValueCount: importRows.reduce((count, row) => count + [
    row.featuresPurchased?.length ? true : false,
    Boolean(row.slackChannelName),
    ...Object.values(row.setup ?? {}).map((value) => value !== null),
  ].filter(Boolean).length, 0),
  taskTemplatesSuppressed: true,
};

if (!shouldApply) {
  console.log(JSON.stringify(summary, null, 2));
  process.exit(0);
}

const clientPayload = importRows.map((row) => ({
  company_id: company.id,
  company_glide_row_id: COMPANY_LEGACY_ID,
  glide_row_id: row.clientId,
  client_name: row.clientName,
  client_business: row.companyName || null,
  client_email: row.primaryEmail,
  client_email_secondary: row.secondaryEmail,
  csm_team_member_id: row.assignedMemberId,
  client_age_date_onboarded: iso(row.closeDate),
  program_status_value: "front-end",
  offer_milestones_current_offer_id: pathway.glide_row_id,
  offer_milestones_current_milestone_id: row.currentMilestone ? milestoneByName.get(row.currentMilestone).glide_row_id : null,
  offer_milestones_current_milestone_change_date: iso(row.milestoneDate),
  current_contract_start_date: manualContractReview.has(row.clientName) ? null : iso(row.contractStartDate),
  current_contract_end_date: manualContractReview.has(row.clientName) ? null : iso(row.contractEndDate),
  current_contract_end_date_for_filtering: manualContractReview.has(row.clientName) ? null : iso(row.contractEndDate),
  current_contract_of_days: manualContractReview.has(row.clientName) ? null : (row.contractStartDate && row.contractEndDate ? Math.round((new Date(iso(row.contractEndDate)) - new Date(iso(row.contractStartDate))) / 86400000) : null),
  current_contract_monthly_value: manualContractReview.has(row.clientName) ? null : row.monthlyValue,
  csm_date_of_last_contact: iso(row.lastContactDate),
  source_snapshot: { source: "Sales Kick active-client CSV", source_sha256: SOURCE_SHA256, source_row: row.rowNumber },
  metadata: { historical_import: { batch_id: batchId, version: IMPORT_VERSION, task_templates_suppressed: true } },
  created_at: iso(row.closeDate),
}));

const contractPayload = importRows
  .filter((row) => row.contractStartDate && row.contractEndDate && !manualContractReview.has(row.clientName))
  .map((row) => ({
    company_id: company.id,
    company_glide_row_id: COMPANY_LEGACY_ID,
    glide_row_id: `hist_contract_${SOURCE_SHA256.slice(0, 12)}_${row.rowNumber}`,
    client_id: row.clientId,
    start_date: iso(row.contractStartDate),
    end_date: iso(row.contractEndDate),
    contract_days: Math.round((new Date(iso(row.contractEndDate)) - new Date(iso(row.contractStartDate))) / 86400000),
    monthly_value: row.monthlyValue,
    total_contract_value: row.contractValue,
    auto_renew: false,
    status: "active",
    source_snapshot: { source: "Sales Kick active-client CSV", source_sha256: SOURCE_SHA256, source_row: row.rowNumber },
    metadata: { historical_import: { batch_id: batchId, version: IMPORT_VERSION, template_suppressed: true } },
  }));

const milestonePayload = importRows
  .filter((row) => row.currentMilestone)
  .map((row) => ({
    company_id: company.id,
    company_glide_row_id: COMPANY_LEGACY_ID,
    glide_row_id: `hist_milestone_${SOURCE_SHA256.slice(0, 12)}_${row.rowNumber}`,
    client_id: row.clientId,
    offer_id: pathway.glide_row_id,
    milestone_id: milestoneByName.get(row.currentMilestone).glide_row_id,
    start_date: iso(row.milestoneDate),
    initiated_by_name: "Sales Kick historical CSV import",
    source_snapshot: { source: "Sales Kick active-client CSV", source_sha256: SOURCE_SHA256, source_row: row.rowNumber },
    metadata: { historical_import: { batch_id: batchId, version: IMPORT_VERSION, inferred_from_close_date: true } },
  }));

const customValues = [];
for (const row of importRows) {
  const add = (field, valueText, valueJson) => {
    if (valueText === null && valueJson === null) return;
    customValues.push({
      company_id: company.id,
      client_id: row.clientId,
      custom_field_id: field.id,
      field_key: field.key,
      value_text: valueText,
      value_json: valueJson,
      source_table: "sales_kick_active_client_csv",
      source_key: field.label,
      metadata: { historical_import: { batch_id: batchId, version: IMPORT_VERSION } },
    });
  };
  const featureValue = row.featuresPurchased?.length ? featureValues(row, fieldConfig.features) : null;
  add(fieldConfig.features, featureValue?.join(", ") ?? null, featureValue);
  add(fieldConfig.slack, row.slackChannelName ?? null, null);
  add(fieldConfig.onboardingForm, row.setup.onboardingFormComplete === null ? null : String(row.setup.onboardingFormComplete), row.setup.onboardingFormComplete);
  add(fieldConfig.onboardingCall, row.setup.onboardingCallComplete === null ? null : String(row.setup.onboardingCallComplete), row.setup.onboardingCallComplete);
  add(fieldConfig.grading, row.setup.gradingSetupComplete === null ? null : String(row.setup.gradingSetupComplete), row.setup.gradingSetupComplete);
  add(fieldConfig.calendar, row.setup.calendarManagementSetupComplete === null ? null : String(row.setup.calendarManagementSetupComplete), row.setup.calendarManagementSetupComplete);
  add(fieldConfig.financialData, row.setup.financialDataSetupComplete === null ? null : String(row.setup.financialDataSetupComplete), row.setup.financialDataSetupComplete);
  add(fieldConfig.lns, row.setup.lnsSetupComplete === null ? null : String(row.setup.lnsSetupComplete), row.setup.lnsSetupComplete);
}

const historyPayload = importRows.map((row) => ({
  company_id: company.id,
  legacy_client_glide_row_id: row.clientId,
  event_type: "client_created",
  source: "historical_csv_import",
  title: `Historical client import: ${row.clientName}`,
  summary: "Imported from the approved Sales Kick active-client CSV; automatic task templates were suppressed.",
  payload: { historical_import: { batch_id: batchId, version: IMPORT_VERSION, source_row: row.rowNumber } },
}));

const auditPayload = importRows.map((row) => ({
  company_id: company.id,
  event_type: "client_created",
  source: "historical_csv_import",
  entity_table: "clients",
  legacy_glide_row_id: row.clientId,
  title: "Historical client imported",
  summary: `${row.clientName} imported from Sales Kick's approved active-client CSV.`,
  metadata: { historical_import: { batch_id: batchId, version: IMPORT_VERSION, source_row: row.rowNumber, task_templates_suppressed: true } },
}));

const cleanup = async () => {
  const clientIds = importRows.map((row) => row.clientId);
  await supabase.from("client_custom_field_values").delete().eq("company_id", company.id).in("client_id", clientIds);
  await supabase.from("client_milestones").delete().eq("company_id", company.id).in("client_id", clientIds);
  await supabase.from("client_contracts").delete().eq("company_id", company.id).in("client_id", clientIds);
  await supabase.from("client_history_events").delete().eq("company_id", company.id).in("legacy_client_glide_row_id", clientIds);
  await supabase.from("app_audit_events").delete().eq("company_id", company.id).in("legacy_glide_row_id", clientIds).eq("source", "historical_csv_import");
  await supabase.from("clients").delete().eq("company_id", company.id).in("glide_row_id", clientIds);
};

try {
  for (const [table, payload] of [
    ["clients", clientPayload],
    ["client_contracts", contractPayload],
    ["client_milestones", milestonePayload],
    ["client_custom_field_values", customValues],
    ["client_history_events", historyPayload],
    ["app_audit_events", auditPayload],
  ]) {
    const { error } = await supabase.from(table).insert(payload);
    if (error) throw new Error(`${table}: ${error.message}`);
  }
} catch (error) {
  await cleanup();
  throw new Error(`Import failed and created rows were removed: ${errorMessage(error)}`);
}

console.log(JSON.stringify({ ...summary, imported: true, sourceSha256: createHash("sha256").update(JSON.stringify(preview)).digest("hex") }, null, 2));
