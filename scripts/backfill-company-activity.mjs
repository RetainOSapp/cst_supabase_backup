import { createClient } from "@supabase/supabase-js";
import { getSupabaseEnv, loadDotEnv } from "./shared-env.mjs";

loadDotEnv();

const { url, serviceRoleKey } = getSupabaseEnv();
const supabase = createClient(url, serviceRoleKey, {
  auth: { persistSession: false },
});

const apply = process.argv.includes("--apply");
const includeArchived = process.argv.includes("--include-archived");

function readArg(name) {
  return process.argv.find((argument) => argument.startsWith(`--${name}=`))
    ?.slice(name.length + 3);
}

const companyArgument = readArg("company") ?? "Ethical Scaling";
const companyIdArgument = readArg("company-id");
const legacyCompanyIdArgument = readArg("legacy-company-id");

function cleanText(value) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text === "" ? null : text;
}

function cleanNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function cleanBoolean(value) {
  return typeof value === "boolean" ? value : null;
}

function cleanDate(value) {
  const text = cleanText(value);
  if (!text) return null;
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function daysBetween(startIso, endIso) {
  if (!startIso || !endIso) return null;
  const start = new Date(startIso);
  const end = new Date(endIso);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
  return Math.max(
    0,
    Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)),
  );
}

function sample(rows, limit = 10) {
  return rows.slice(0, limit);
}

function fail(message, details = undefined) {
  console.error(JSON.stringify({ ok: false, message, details }, null, 2));
  process.exit(1);
}

async function resolveCompany() {
  let query = supabase
    .from("companies")
    .select("id, legacy_glide_row_id, name, migration_status");

  if (companyIdArgument) {
    query = query.eq("id", companyIdArgument);
  } else if (legacyCompanyIdArgument) {
    query = query.eq("legacy_glide_row_id", legacyCompanyIdArgument);
  } else {
    query = query.ilike("name", companyArgument);
  }

  const { data, error } = await query;
  if (error) throw error;
  if (!data?.length) {
    fail("No app-owned company matched the requested selector.", {
      company: companyArgument,
      companyId: companyIdArgument,
      legacyCompanyId: legacyCompanyIdArgument,
    });
  }
  if (data.length > 1) {
    fail("Multiple companies matched. Re-run with --company-id or --legacy-company-id.", {
      matches: data.map((company) => ({
        id: company.id,
        name: company.name,
        legacy_glide_row_id: company.legacy_glide_row_id,
      })),
    });
  }
  return data[0];
}

function contractPayload(source, company) {
  const startDate = cleanDate(source.start_date);
  const endDate = cleanDate(source.end_date);
  return {
    company_id: company.id,
    company_glide_row_id: company.legacy_glide_row_id,
    glide_row_id: source.glide_row_id,
    client_id: source.client_id,
    start_date: startDate,
    end_date: endDate,
    contract_days: cleanNumber(source.contract_days) ?? daysBetween(startDate, endDate),
    monthly_value: cleanNumber(source.monthly_value),
    total_contract_value: cleanNumber(source.total_contract_value),
    reference_link: cleanText(source.reference_link),
    notes: cleanText(source.notes),
    auto_renew: cleanBoolean(source.auto_renew) ?? false,
    status: cleanText(source.status) ?? "historical",
    source_snapshot: source,
    metadata: {
      backfilled_from: "backup_company_clients_contracts",
      backfilled_by: "backfill-company-activity",
    },
  };
}

function milestonePayload(source, company, resolvedOfferId) {
  const startDate = cleanDate(source.start_date);
  const completionDate = cleanDate(source.completion_date);
  return {
    company_id: company.id,
    company_glide_row_id: company.legacy_glide_row_id,
    glide_row_id: source.glide_row_id,
    client_id: source.client_id,
    offer_id: resolvedOfferId,
    milestone_id: source.milestone_id,
    start_date: startDate,
    completion_date: completionDate,
    duration_days: cleanNumber(source.duration_days) ?? daysBetween(startDate, completionDate),
    time_to_hit_days: cleanNumber(source.time_to_hit_days),
    source_snapshot: source,
    metadata: {
      backfilled_from: "backup_company_clients_milestones",
      backfilled_by: "backfill-company-activity",
    },
  };
}

async function main() {
  const company = await resolveCompany();

  const { data: appClients, error: appClientsError } = await supabase
    .from("clients")
    .select("glide_row_id, client_name, program_status_value")
    .eq("company_id", company.id);
  if (appClientsError) throw appClientsError;

  const clientIds = (appClients ?? []).map((client) => client.glide_row_id).filter(Boolean);
  const activeClientIds = new Set(
    (appClients ?? [])
      .filter((client) =>
        includeArchived ||
        ["front-end", "back-end", "paused", "suspended"].includes(
          client.program_status_value ?? "",
        )
      )
      .map((client) => client.glide_row_id),
  );

  const [
    sourceContractsResult,
    existingContractsResult,
    sourceMilestonesResult,
    existingMilestonesResult,
    appOfferMilestonesResult,
  ] = clientIds.length > 0
    ? await Promise.all([
        supabase
          .from("backup_company_clients_contracts")
          .select("*")
          .in("client_id", clientIds),
        supabase
          .from("client_contracts")
          .select("glide_row_id")
          .eq("company_id", company.id),
        supabase
          .from("backup_company_clients_milestones")
          .select("*")
          .in("client_id", clientIds),
        supabase
          .from("client_milestones")
          .select("glide_row_id, client_id, milestone_id, archived_at")
          .eq("company_id", company.id),
        supabase
          .from("company_offer_milestones")
          .select("glide_row_id, offer_id")
          .eq("company_id", company.id),
      ])
    : [
        { data: [], error: null },
        { data: [], error: null },
        { data: [], error: null },
        { data: [], error: null },
        { data: [], error: null },
      ];

  for (const result of [
    sourceContractsResult,
    existingContractsResult,
    sourceMilestonesResult,
    existingMilestonesResult,
    appOfferMilestonesResult,
  ]) {
    if (result.error) throw result.error;
  }

  const existingContractIds = new Set(
    (existingContractsResult.data ?? []).map((contract) => contract.glide_row_id),
  );
  const existingMilestoneIds = new Set(
    (existingMilestonesResult.data ?? []).map((milestone) => milestone.glide_row_id),
  );
  const existingActiveMilestoneKeys = new Set(
    (existingMilestonesResult.data ?? [])
      .filter((milestone) => !milestone.archived_at)
      .filter((milestone) => milestone.client_id && milestone.milestone_id)
      .map((milestone) => `${milestone.client_id}::${milestone.milestone_id}`),
  );
  const offerIdByMilestoneId = new Map(
    (appOfferMilestonesResult.data ?? []).map((milestone) => [
      milestone.glide_row_id,
      milestone.offer_id,
    ]),
  );

  const contractPayloads = (sourceContractsResult.data ?? [])
    .filter((contract) => contract.glide_row_id && activeClientIds.has(contract.client_id))
    .filter((contract) => !existingContractIds.has(contract.glide_row_id))
    .map((contract) => contractPayload(contract, company));

  const plannedActiveMilestoneKeys = new Set();
  const activeMilestoneConflictSkips = [];
  const duplicateActiveMilestoneSkips = [];
  const milestoneCandidates = [];

  for (const milestone of sourceMilestonesResult.data ?? []) {
    if (!milestone.glide_row_id || !activeClientIds.has(milestone.client_id)) continue;
    if (existingMilestoneIds.has(milestone.glide_row_id)) continue;

    const activeKey = milestone.client_id && milestone.milestone_id
      ? `${milestone.client_id}::${milestone.milestone_id}`
      : null;
    const skipDetails = {
      glide_row_id: milestone.glide_row_id,
      client_id: milestone.client_id,
      milestone_id: milestone.milestone_id,
    };

    if (activeKey && existingActiveMilestoneKeys.has(activeKey)) {
      activeMilestoneConflictSkips.push(skipDetails);
      continue;
    }

    if (activeKey && plannedActiveMilestoneKeys.has(activeKey)) {
      duplicateActiveMilestoneSkips.push(skipDetails);
      continue;
    }

    if (activeKey) plannedActiveMilestoneKeys.add(activeKey);

    milestoneCandidates.push({
      source: milestone,
      resolvedOfferId: cleanText(milestone.offer_id) ??
        offerIdByMilestoneId.get(milestone.milestone_id) ??
        null,
    });
  }
  const unresolvedMilestones = milestoneCandidates
    .filter((milestone) => !milestone.resolvedOfferId)
    .map((milestone) => ({
      glide_row_id: milestone.source.glide_row_id,
      client_id: milestone.source.client_id,
      milestone_id: milestone.source.milestone_id,
    }));
  const milestonePayloads = milestoneCandidates
    .filter((milestone) => milestone.resolvedOfferId)
    .map((milestone) =>
      milestonePayload(milestone.source, company, milestone.resolvedOfferId),
    );

  const report = {
    ok: true,
    mode: apply ? "apply" : "dry-run",
    generatedAt: new Date().toISOString(),
    company,
    scope: includeArchived ? "all app-owned clients" : "active/pilot-relevant clients only",
    candidates: {
      contractsToBackfill: contractPayloads.length,
      clientMilestonesToBackfill: milestonePayloads.length,
      unresolvedClientMilestonesSkipped: unresolvedMilestones.length,
      activeClientMilestoneConflictsSkipped: activeMilestoneConflictSkips.length,
      duplicateActiveClientMilestonesSkipped: duplicateActiveMilestoneSkips.length,
      contractSample: sample(
        contractPayloads.map((contract) => ({
          glide_row_id: contract.glide_row_id,
          client_id: contract.client_id,
          start_date: contract.start_date,
          end_date: contract.end_date,
        })),
      ),
      milestoneSample: sample(
        milestonePayloads.map((milestone) => ({
          glide_row_id: milestone.glide_row_id,
          client_id: milestone.client_id,
          offer_id: milestone.offer_id,
          milestone_id: milestone.milestone_id,
          start_date: milestone.start_date,
          completion_date: milestone.completion_date,
        })),
      ),
      unresolvedMilestoneSample: sample(unresolvedMilestones),
      activeMilestoneConflictSample: sample(activeMilestoneConflictSkips),
      duplicateActiveMilestoneSample: sample(duplicateActiveMilestoneSkips),
    },
  };

  console.log(JSON.stringify(report, null, 2));

  if (!apply) {
    console.log("Dry run only. Re-run with --apply after reviewing the candidates.");
    return;
  }

  for (const [table, payloads] of [
    ["client_contracts", contractPayloads],
    ["client_milestones", milestonePayloads],
  ]) {
    const chunkSize = 100;
    for (let index = 0; index < payloads.length; index += chunkSize) {
      const chunk = payloads.slice(index, index + chunkSize);
      const { error } = await supabase.from(table).insert(chunk);
      if (error) throw error;
    }
  }

  const { error: auditError } = await supabase.from("app_audit_events").insert({
    company_id: company.id,
    event_type: "historical_activity_backfill",
    source: "script",
    entity_table: "companies",
    entity_id: null,
    legacy_glide_row_id: company.legacy_glide_row_id,
    title: "Historical client activity backfilled",
    summary: `Backfilled ${contractPayloads.length} contracts and ${milestonePayloads.length} client milestone rows.`,
    after_data: {
      contracts: contractPayloads.length,
      client_milestones: milestonePayloads.length,
      unresolved_client_milestones_skipped: unresolvedMilestones.length,
      active_client_milestone_conflicts_skipped: activeMilestoneConflictSkips.length,
      duplicate_active_client_milestones_skipped: duplicateActiveMilestoneSkips.length,
      include_archived: includeArchived,
    },
  });
  if (auditError) throw auditError;

  console.log(JSON.stringify({ applied: true, ...report.candidates }, null, 2));
}

main().catch((error) => {
  fail(error.message ?? "Backfill failed.", error);
});
