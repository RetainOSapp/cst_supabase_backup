import { createClient } from "@supabase/supabase-js";
import { getSupabaseEnv, loadDotEnv } from "./shared-env.mjs";

loadDotEnv();

const { url, serviceRoleKey } = getSupabaseEnv();
const supabase = createClient(url, serviceRoleKey, {
  auth: { persistSession: false },
});

const apply = process.argv.includes("--apply");
const includeArchived = process.argv.includes("--include-archived");
const includePausedSuspended = process.argv.includes("--include-paused-suspended");
const includeSummaryContracts = !process.argv.includes("--no-summary-contracts");
const includeCurrentSummaryForExistingContracts = process.argv.includes(
  "--include-current-summary-for-existing-contracts",
);

function readArg(name) {
  return process.argv.find((argument) => argument.startsWith(`--${name}=`))
    ?.slice(name.length + 3);
}

const companyArgument = readArg("company");
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
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  const text = cleanText(value)?.toLowerCase();
  if (!text) return null;
  if (["true", "yes", "y", "1"].includes(text)) return true;
  if (["false", "no", "n", "0"].includes(text)) return false;
  return null;
}

function cleanDate(value) {
  const text = cleanText(value);
  if (!text) return null;
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function addDays(dateIso, days) {
  const date = new Date(dateIso);
  if (Number.isNaN(date.getTime()) || !Number.isFinite(Number(days))) return null;
  date.setUTCDate(date.getUTCDate() + Number(days));
  return date.toISOString();
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
  if (!companyArgument && !companyIdArgument && !legacyCompanyIdArgument) {
    fail("Company selector is required for this generic backfill script.", {
      usage:
        "npm run pilot:backfill:company-contracts -- --company=\"Company Name\" [--apply]",
      selectors: ["--company", "--company-id", "--legacy-company-id"],
    });
  }

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

function contractPayloadFromMirror(source, company) {
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
      backfilled_by: "backfill-company-contracts",
      backfill_kind: "mirror_contract",
    },
  };
}

function currentSummaryEndDate(client) {
  return cleanDate(client.current_contract_end_date_for_filtering) ??
    cleanDate(client.current_contract_end_date) ??
    addDays(
      cleanDate(client.current_contract_start_date) ?? cleanDate(client.client_age_date_onboarded),
      cleanNumber(client.current_contract_of_days),
    );
}

function summaryContractPayload(client, company) {
  const startDate = cleanDate(client.current_contract_start_date) ??
    cleanDate(client.client_age_date_onboarded);
  const endDate = currentSummaryEndDate(client);
  if (!startDate && !endDate) return null;

  const contractDays = cleanNumber(client.current_contract_of_days) ??
    daysBetween(startDate, endDate);
  const monthlyValue = cleanNumber(client.current_contract_monthly_value);

  return {
    company_id: company.id,
    company_glide_row_id: company.legacy_glide_row_id,
    glide_row_id: `summary_${client.glide_row_id}`,
    client_id: client.glide_row_id,
    start_date: startDate,
    end_date: endDate,
    contract_days: contractDays,
    monthly_value: monthlyValue,
    total_contract_value: null,
    reference_link: cleanText(client.current_contract_reference_link),
    notes: cleanText(client.current_contract_notes),
    auto_renew: cleanBoolean(client.current_contract_auto_renew) ?? false,
    status: "current_summary",
    source_snapshot: {
      client_glide_row_id: client.glide_row_id,
      client_name: client.client_name,
      current_contract_start_date: client.current_contract_start_date,
      current_contract_of_days: client.current_contract_of_days,
      current_contract_end_date: client.current_contract_end_date,
      current_contract_end_date_for_filtering:
        client.current_contract_end_date_for_filtering,
      current_contract_monthly_value: client.current_contract_monthly_value,
      current_contract_reference_link: client.current_contract_reference_link,
      current_contract_notes: client.current_contract_notes,
      current_contract_auto_renew: client.current_contract_auto_renew,
    },
    metadata: {
      backfilled_from: "clients_current_contract_summary",
      backfilled_by: "backfill-company-contracts",
      backfill_kind: "current_summary_contract",
    },
  };
}

async function insertInChunks(table, payloads) {
  const chunkSize = 100;
  for (let index = 0; index < payloads.length; index += chunkSize) {
    const chunk = payloads.slice(index, index + chunkSize);
    const { error } = await supabase.from(table).insert(chunk);
    if (error) throw error;
  }
}

async function queryAll(label, queryBuilder, pageSize = 1000) {
  const rows = [];
  for (let from = 0; ; from += pageSize) {
    const to = from + pageSize - 1;
    const { data, error } = await queryBuilder().range(from, to);
    if (error) throw new Error(`${label}: ${error.message}`);
    rows.push(...(data ?? []));
    if (!data || data.length < pageSize) break;
  }
  return rows;
}

async function fetchContractsForClientIds(clientIds) {
  const rows = [];
  const chunkSize = 100;
  for (let index = 0; index < clientIds.length; index += chunkSize) {
    const chunk = clientIds.slice(index, index + chunkSize);
    const chunkRows = await queryAll("backup client contracts", () =>
      supabase
        .from("backup_company_clients_contracts")
        .select("*")
        .in("client_id", chunk),
    );
    rows.push(...chunkRows);
  }
  return rows;
}

async function main() {
  const company = await resolveCompany();

  const appClients = await queryAll("app clients", () =>
    supabase
      .from("clients")
      .select(`
        glide_row_id,
        client_name,
        program_status_value,
        client_age_date_onboarded,
        current_contract_start_date,
        current_contract_of_days,
        current_contract_end_date,
        current_contract_end_date_for_filtering,
        current_contract_monthly_value,
        current_contract_reference_link,
        current_contract_notes,
        current_contract_auto_renew
      `)
      .eq("company_id", company.id),
  );

  const clientIds = (appClients ?? []).map((client) => client.glide_row_id).filter(Boolean);
  const scopedClientIds = new Set(
    (appClients ?? [])
      .filter((client) =>
        includeArchived ||
        [
          "front-end",
          "back-end",
          ...(includePausedSuspended ? ["paused", "suspended"] : []),
        ].includes(
          client.program_status_value ?? "",
        )
      )
      .map((client) => client.glide_row_id),
  );

  const [
    sourceContracts,
    existingContractsResult,
  ] = clientIds.length > 0
    ? await Promise.all([
        fetchContractsForClientIds(clientIds),
        queryAll("existing app contracts", () =>
          supabase
            .from("client_contracts")
            .select("glide_row_id, client_id, archived_at")
            .eq("company_id", company.id),
        ),
      ])
    : [
        [],
        [],
      ];

  const existingContracts = existingContractsResult ?? [];
  const existingContractIds = new Set(
    existingContracts.map((contract) => contract.glide_row_id).filter(Boolean),
  );
  const clientIdsWithExistingAppContract = new Set(
    existingContracts
      .filter((contract) => !contract.archived_at)
      .map((contract) => contract.client_id)
      .filter(Boolean),
  );

  const mirrorPayloads = sourceContracts
    .filter((contract) => contract.glide_row_id && scopedClientIds.has(contract.client_id))
    .filter((contract) => !existingContractIds.has(contract.glide_row_id))
    .map((contract) => contractPayloadFromMirror(contract, company));

  for (const payload of mirrorPayloads) {
    clientIdsWithExistingAppContract.add(payload.client_id);
  }

  const summaryPayloads = includeSummaryContracts
    ? (appClients ?? [])
        .filter((client) => scopedClientIds.has(client.glide_row_id))
        .filter(
          (client) =>
            includeCurrentSummaryForExistingContracts ||
            !clientIdsWithExistingAppContract.has(client.glide_row_id),
        )
        .map((client) => summaryContractPayload(client, company))
        .filter(Boolean)
        .filter((contract) => !existingContractIds.has(contract.glide_row_id))
    : [];

  const allPayloads = [...mirrorPayloads, ...summaryPayloads];
  const report = {
    ok: true,
    mode: apply ? "apply" : "dry-run",
    generatedAt: new Date().toISOString(),
    company,
    scope: includeArchived
      ? "all app-owned clients"
      : includePausedSuspended
        ? "active and paused/suspended app-owned clients"
        : "active app-owned clients only",
    options: {
      includePausedSuspended,
      includeSummaryContracts,
      includeCurrentSummaryForExistingContracts,
    },
    counts: {
      appClients: appClients.length,
      scopedClients: scopedClientIds.size,
      mirroredContractsInCompany: sourceContracts.length,
      existingAppContracts: existingContracts.length,
      mirrorContractsToBackfill: mirrorPayloads.length,
      currentSummaryContractsToBackfill: summaryPayloads.length,
      totalContractsToBackfill: allPayloads.length,
    },
    samples: {
      mirrorContracts: sample(
        mirrorPayloads.map((contract) => ({
          glide_row_id: contract.glide_row_id,
          client_id: contract.client_id,
          start_date: contract.start_date,
          end_date: contract.end_date,
        })),
      ),
      currentSummaryContracts: sample(
        summaryPayloads.map((contract) => ({
          glide_row_id: contract.glide_row_id,
          client_id: contract.client_id,
          start_date: contract.start_date,
          end_date: contract.end_date,
          monthly_value: contract.monthly_value,
        })),
      ),
    },
  };

  console.log(JSON.stringify(report, null, 2));

  if (!apply) {
    console.log("Dry run only. Re-run with --apply after reviewing the candidates.");
    return;
  }

  await insertInChunks("client_contracts", allPayloads);

  const { error: auditError } = await supabase.from("app_audit_events").insert({
    company_id: company.id,
    event_type: "historical_contract_backfill",
    source: "script",
    entity_table: "client_contracts",
    entity_id: null,
    legacy_glide_row_id: company.legacy_glide_row_id,
    title: "Historical client contracts backfilled",
    summary: `Backfilled ${allPayloads.length} contracts (${mirrorPayloads.length} mirror, ${summaryPayloads.length} current summary).`,
    after_data: {
      mirror_contracts: mirrorPayloads.length,
      current_summary_contracts: summaryPayloads.length,
      include_archived: includeArchived,
      include_summary_contracts: includeSummaryContracts,
      include_current_summary_for_existing_contracts:
        includeCurrentSummaryForExistingContracts,
    },
  });
  if (auditError) throw auditError;

  console.log(JSON.stringify({ applied: true, ...report.counts }, null, 2));
}

main().catch((error) => {
  fail(error.message ?? "Contract backfill failed.", error);
});
