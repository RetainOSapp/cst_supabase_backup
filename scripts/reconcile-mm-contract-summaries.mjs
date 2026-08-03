import { createClient } from "@supabase/supabase-js";
import { getSupabaseEnv, loadDotEnv } from "./shared-env.mjs";

loadDotEnv();

const { url, serviceRoleKey } = getSupabaseEnv();
const supabase = createClient(url, serviceRoleKey, {
  auth: { persistSession: false },
});

const apply = process.argv.includes("--apply");
const summaryOnly = process.argv.includes("--summary");
const asOfArgument = process.argv.find((argument) =>
  argument.startsWith("--as-of="),
);
const asOf = new Date(asOfArgument?.split("=")[1] ?? new Date().toISOString());
if (Number.isNaN(asOf.getTime())) {
  throw new Error("--as-of must be a valid ISO date or timestamp.");
}

const companyId = "21586391-9a84-4072-9ae6-20436b27bea9";
const companyLegacyId = "wd7vy0vaQK2hgB3IRqy17w";
const repairKind = "mm_contract_summary_reconciliation_v1";
const pendingManualClientIds = new Set([
  // Adam is confirming whether Lisa's end date is Aug 29, Sep 1, or Sep 3.
  "lfl3JCLnTsiN5QpK9APKGg",
]);

function present(value) {
  return value !== null && value !== undefined && String(value).trim() !== "";
}

function dateKey(value) {
  if (!present(value)) return null;
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}

function calculatedEnd(contract) {
  if (present(contract.end_date)) return contract.end_date;
  if (!present(contract.start_date) || !Number.isFinite(Number(contract.contract_days))) {
    return null;
  }
  const date = new Date(String(contract.start_date));
  if (Number.isNaN(date.getTime())) return null;
  date.setUTCDate(date.getUTCDate() + Math.round(Number(contract.contract_days)));
  return date.toISOString();
}

function contractType(contract) {
  return String(
    contract.contract_type ?? contract.metadata?.contract_type ?? "standard",
  )
    .trim()
    .toLowerCase();
}

function eligibleContract(contract) {
  if (contract.archived_at) return false;
  if (!["active", "current_summary"].includes(
    String(contract.status ?? "active").toLowerCase(),
  )) {
    return false;
  }
  if (contractType(contract) === "add_on") return false;
  const start = present(contract.start_date)
    ? new Date(String(contract.start_date))
    : null;
  const endValue = calculatedEnd(contract);
  const end = endValue ? new Date(String(endValue)) : null;
  return (
    (!start || start <= asOf) &&
    (!end || end >= new Date(`${asOf.toISOString().slice(0, 10)}T00:00:00Z`))
  );
}

function summarySnapshot(client) {
  return {
    current_contract_start_date: client.current_contract_start_date,
    current_contract_of_days: client.current_contract_of_days,
    current_contract_end_date: client.current_contract_end_date,
    current_contract_end_date_for_filtering:
      client.current_contract_end_date_for_filtering,
    current_contract_monthly_value: client.current_contract_monthly_value,
    current_contract_reference_link: client.current_contract_reference_link,
    current_contract_notes: client.current_contract_notes,
    current_contract_auto_renew: client.current_contract_auto_renew,
  };
}

function coreSummaryBlank(client) {
  return (
    !present(client.current_contract_start_date) &&
    !present(client.current_contract_of_days) &&
    !present(client.current_contract_end_date) &&
    !present(client.current_contract_end_date_for_filtering)
  );
}

function summaryMatches(client, contract) {
  const end = calculatedEnd(contract);
  return (
    dateKey(client.current_contract_start_date) === dateKey(contract.start_date) &&
    dateKey(
      client.current_contract_end_date_for_filtering ??
        client.current_contract_end_date,
    ) === dateKey(end) &&
    Number(client.current_contract_of_days ?? 0) ===
      Number(contract.contract_days ?? 0)
  );
}

function appEditedContract(contract) {
  return (
    contract.status === "active" ||
    contract.metadata?.updated_in === "retainos_contract_write_pilot" ||
    present(contract.metadata?.updated_by_role)
  );
}

async function queryAll(table, columns, configure) {
  const rows = [];
  for (let from = 0; ; from += 1000) {
    let query = supabase.from(table).select(columns);
    query = configure(query);
    const { data, error } = await query.range(from, from + 999);
    if (error) throw error;
    rows.push(...(data ?? []));
    if (!data || data.length < 1000) return rows;
  }
}

async function runWithConcurrency(items, worker, concurrency = 10) {
  let cursor = 0;
  async function next() {
    while (cursor < items.length) {
      const item = items[cursor++];
      await worker(item);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, next),
  );
}

function compact(item) {
  return {
    client_id: item.client.glide_row_id,
    client_name: item.client.client_name,
    status: item.client.program_status_value,
    client_summary: summarySnapshot(item.client),
    candidate_contracts: item.contracts.map((contract) => ({
      id: contract.id,
      glide_row_id: contract.glide_row_id,
      status: contract.status,
      start_date: contract.start_date,
      end_date: calculatedEnd(contract),
      contract_days: contract.contract_days,
      updated_at: contract.updated_at,
      app_edited: appEditedContract(contract),
    })),
  };
}

async function main() {
  const [companyResult, clients, contracts] = await Promise.all([
    supabase
      .from("companies")
      .select("id, name, legacy_glide_row_id, migration_status")
      .eq("id", companyId)
      .single(),
    queryAll(
      "clients",
      [
        "id",
        "glide_row_id",
        "client_name",
        "program_status_value",
        "archived_at",
        "current_contract_start_date",
        "current_contract_of_days",
        "current_contract_end_date",
        "current_contract_end_date_for_filtering",
        "current_contract_monthly_value",
        "current_contract_reference_link",
        "current_contract_notes",
        "current_contract_auto_renew",
      ].join(", "),
      (query) => query.eq("company_id", companyId).is("archived_at", null),
    ),
    queryAll(
      "client_contracts",
      [
        "id",
        "glide_row_id",
        "client_id",
        "status",
        "contract_type",
        "start_date",
        "end_date",
        "contract_days",
        "monthly_value",
        "reference_link",
        "notes",
        "auto_renew",
        "archived_at",
        "metadata",
        "updated_at",
      ].join(", "),
      (query) =>
        query.eq("company_id", companyId).is("archived_at", null),
    ),
  ]);
  if (companyResult.error) throw companyResult.error;
  const company = companyResult.data;
  if (
    company.name !== "Moves Method" ||
    company.legacy_glide_row_id !== companyLegacyId ||
    company.migration_status !== "migrated"
  ) {
    throw new Error("This reconciliation is restricted to migrated Moves Method.");
  }

  const contractsByClient = new Map();
  contracts.filter(eligibleContract).forEach((contract) => {
    const existing = contractsByClient.get(contract.client_id) ?? [];
    existing.push(contract);
    contractsByClient.set(contract.client_id, existing);
  });

  const activeClients = clients.filter((client) =>
    ["front-end", "back-end"].includes(client.program_status_value),
  );
  const classified = activeClients.map((client) => {
    const candidates = contractsByClient.get(client.glide_row_id) ?? [];
    return { client, contracts: candidates };
  });
  const ambiguous = classified.filter((item) => item.contracts.length > 1);
  const noEffectiveContract = classified.filter(
    (item) => item.contracts.length === 0,
  );
  const single = classified.filter((item) => item.contracts.length === 1);
  const mismatches = single.filter(
    (item) => !summaryMatches(item.client, item.contracts[0]),
  );
  const fullyBlank = mismatches.filter((item) => coreSummaryBlank(item.client));
  const partial = mismatches.filter((item) => !coreSummaryBlank(item.client));
  const pendingManual = fullyBlank.filter((item) =>
    pendingManualClientIds.has(item.client.glide_row_id),
  );
  const safeRepairs = fullyBlank.filter(
    (item) =>
      !pendingManualClientIds.has(item.client.glide_row_id) &&
      appEditedContract(item.contracts[0]),
  );
  const unsupportedBlank = fullyBlank.filter(
    (item) =>
      !pendingManualClientIds.has(item.client.glide_row_id) &&
      !appEditedContract(item.contracts[0]),
  );

  const namedIds = new Set([
    "7BSzJrQvTTmA06FCntXEYw",
    "C694O4lZTRKNr3bUvkR7YQ",
    "lfl3JCLnTsiN5QpK9APKGg",
  ]);
  const report = {
    ok: true,
    mode: apply ? "apply" : "dry-run",
    as_of: asOf.toISOString(),
    company: {
      id: company.id,
      name: company.name,
      legacy_glide_row_id: company.legacy_glide_row_id,
    },
    rules: {
      active_client_statuses: ["front-end", "back-end"],
      effective_contract_statuses: ["active", "current_summary"],
      add_on_contracts: "excluded",
      automatic_repair:
        "exactly one effective standard contract, fully blank core summary, and RetainOS edit evidence; Lisa remains pending manual date confirmation",
      partial_mismatches: "report only",
      ambiguous_contracts: "report only",
    },
    counts: {
      active_clients: activeClients.length,
      active_clients_without_effective_contract: noEffectiveContract.length,
      active_clients_with_ambiguous_contracts: ambiguous.length,
      single_contract_summary_mismatches: mismatches.length,
      fully_blank_core_summaries: fullyBlank.length,
      safe_repairs: safeRepairs.length,
      pending_manual_confirmation: pendingManual.length,
      unsupported_blank_summaries: unsupportedBlank.length,
      partial_mismatches_report_only: partial.length,
    },
    named_clients: classified
      .filter((item) => namedIds.has(item.client.glide_row_id))
      .map(compact),
    safe_repair_sample: safeRepairs.slice(0, 20).map(compact),
    pending_manual: pendingManual.map(compact),
    ambiguous_sample: ambiguous.slice(0, 20).map(compact),
    partial_mismatch_sample: partial.slice(0, 20).map(compact),
  };

  console.log(
    JSON.stringify(
      summaryOnly
        ? {
            ok: report.ok,
            mode: report.mode,
            as_of: report.as_of,
            company: report.company,
            counts: report.counts,
            named_clients: report.named_clients,
            pending_manual: report.pending_manual,
          }
        : report,
      null,
      2,
    ),
  );
  if (!apply) return;

  const applied = [];
  await runWithConcurrency(safeRepairs, async (item) => {
    const { data, error } = await supabase.rpc(
      "reconcile_client_contract_summary",
      {
        p_company_id: company.id,
        p_client_id: item.client.id,
        p_source_contract_id: item.contracts[0].id,
        p_repair_kind: repairKind,
        p_as_of: asOf.toISOString(),
      },
    );
    if (error) throw error;
    const refreshed = Array.isArray(data) ? data[0] : data;
    const contract = item.contracts[0];
    if (!refreshed || !summaryMatches(refreshed, contract)) {
      throw new Error(
        `Summary refresh did not match contract for ${item.client.client_name}.`,
      );
    }
    applied.push(item.client.glide_row_id);
  });

  console.log(
    JSON.stringify(
      {
        applied: true,
        repair_kind: repairKind,
        repaired_clients: applied.length,
        pending_manual_client_ids: [...pendingManualClientIds],
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error.message ?? "MM contract-summary reconciliation failed.");
  process.exit(1);
});
