import { createClient } from "@supabase/supabase-js";
import { getSupabaseEnv, loadDotEnv } from "./shared-env.mjs";

loadDotEnv();

const { url, serviceRoleKey } = getSupabaseEnv();
const supabase = createClient(url, serviceRoleKey, {
  auth: { persistSession: false },
});

const apply = process.argv.includes("--apply");
const companyId = "21586391-9a84-4072-9ae6-20436b27bea9";
const placeholderDate = "2075-01-01";
const repairKind = "mm_legacy_2075_contract_placeholder_v1";

function isPlaceholder(value) {
  return typeof value === "string" && value.slice(0, 10) === placeholderDate;
}

function calculatedEndDate(startValue, durationValue) {
  const start = new Date(String(startValue));
  const days = Number(durationValue);
  if (Number.isNaN(start.getTime()) || !Number.isFinite(days) || days <= 0) return null;
  start.setUTCDate(start.getUTCDate() + Math.round(days));
  return start.toISOString();
}

async function queryAll(table, columns) {
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from(table)
      .select(columns)
      .eq("company_id", companyId)
      .range(from, from + 999);
    if (error) throw error;
    rows.push(...(data ?? []));
    if (!data || data.length < 1000) return rows;
  }
}

async function runWithConcurrency(items, worker, concurrency = 20) {
  let cursor = 0;
  async function next() {
    while (cursor < items.length) {
      const item = items[cursor++];
      await worker(item);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, next));
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
      "id, glide_row_id, client_name, client_age_date_onboarded, current_contract_start_date, current_contract_of_days, current_contract_end_date, current_contract_end_date_for_filtering",
    ),
    queryAll(
      "client_contracts",
      "id, client_id, glide_row_id, status, start_date, end_date, contract_days, archived_at, metadata",
    ),
  ]);
  if (companyResult.error) throw companyResult.error;
  const company = companyResult.data;
  if (company.name !== "Moves Method" || company.migration_status !== "migrated") {
    throw new Error("This repair is restricted to the migrated Moves Method company.");
  }

  const clientRepairs = clients
    .filter(
      (client) =>
        isPlaceholder(client.current_contract_end_date) ||
        isPlaceholder(client.current_contract_end_date_for_filtering),
    )
    .map((client) => {
      const start = client.current_contract_start_date ?? client.client_age_date_onboarded;
      const endDate = start ? calculatedEndDate(start, client.current_contract_of_days) : null;
      return endDate ? { client, start, endDate } : null;
    })
    .filter(Boolean);
  const repairedClientIds = new Set(
    clientRepairs.map(({ client }) => client.glide_row_id),
  );
  const contractRepairs = contracts
    .filter(
      (contract) =>
        !contract.archived_at &&
        contract.status === "current_summary" &&
        isPlaceholder(contract.end_date) &&
        contract.metadata?.backfill_kind === "current_summary_contract" &&
        repairedClientIds.has(contract.client_id),
    )
    .map((contract) => {
      const endDate = calculatedEndDate(contract.start_date, contract.contract_days);
      return endDate ? { contract, endDate } : null;
    })
    .filter(Boolean);
  const openEndedContractRows = contracts.filter(
    (contract) =>
      !contract.archived_at &&
      contract.status === "current_summary" &&
      isPlaceholder(contract.end_date) &&
      contract.metadata?.backfill_kind === "current_summary_contract" &&
      !repairedClientIds.has(contract.client_id),
  );
  const staleRepairMetadata = openEndedContractRows.filter(
    (contract) => contract.metadata?.repair_kind === repairKind,
  );

  const report = {
    ok: true,
    mode: apply ? "apply" : "dry-run",
    company: { id: company.id, name: company.name },
    rules: {
      placeholder: placeholderDate,
      end_date: "start date plus positive contract duration",
      client_start_date: "current contract start, otherwise onboarding date",
      contract_scope: "unarchived current-summary rows created by the migration backfill",
    },
    counts: {
      clients_with_placeholder: clients.filter(
        (client) =>
          isPlaceholder(client.current_contract_end_date) ||
          isPlaceholder(client.current_contract_end_date_for_filtering),
      ).length,
      client_records_to_repair: clientRepairs.length,
      client_records_left_unchanged_without_duration: clients.filter(
        (client) =>
          (isPlaceholder(client.current_contract_end_date) ||
            isPlaceholder(client.current_contract_end_date_for_filtering)) &&
          !calculatedEndDate(
            client.current_contract_start_date ?? client.client_age_date_onboarded,
            client.current_contract_of_days,
          ),
      ).length,
      contract_history_rows_to_repair: contractRepairs.length,
      open_ended_contract_history_rows_left_unchanged: openEndedContractRows.length,
      open_ended_contract_metadata_to_clean_up: staleRepairMetadata.length,
    },
    carol_weyrauch: clientRepairs
      .filter(({ client }) => client.client_name === "Carol Weyrauch")
      .map(({ start, endDate }) => ({ start_date: start, end_date: endDate })),
  };
  console.log(JSON.stringify(report, null, 2));
  if (!apply) return;

  await runWithConcurrency(clientRepairs, async ({ client, start, endDate }) => {
    const { error } = await supabase
      .from("clients")
      .update({
        current_contract_start_date: start,
        current_contract_end_date: endDate,
        current_contract_end_date_for_filtering: endDate,
      })
      .eq("id", client.id)
      .eq("company_id", company.id);
    if (error) throw error;
  });
  await runWithConcurrency(contractRepairs, async ({ contract, endDate }) => {
    const { error } = await supabase
      .from("client_contracts")
      .update({
        end_date: endDate,
        metadata: {
          ...contract.metadata,
          repaired_by: "repair-mm-legacy-contract-placeholders",
          repair_kind: repairKind,
        },
      })
      .eq("id", contract.id)
      .eq("company_id", company.id);
    if (error) throw error;
  });
  await runWithConcurrency(staleRepairMetadata, async (contract) => {
    const metadata = { ...contract.metadata };
    delete metadata.repaired_by;
    delete metadata.repair_kind;
    const { error } = await supabase
      .from("client_contracts")
      .update({ metadata })
      .eq("id", contract.id)
      .eq("company_id", company.id);
    if (error) throw error;
  });
  const { error: auditError } = await supabase.from("app_audit_events").insert({
    company_id: company.id,
    event_type: "legacy_contract_placeholder_repaired",
    source: "script",
    entity_table: "clients",
    entity_id: null,
    legacy_glide_row_id: company.legacy_glide_row_id,
    title: "MM legacy contract placeholders repaired",
    summary: `Repaired ${clientRepairs.length} client renewal summaries and ${contractRepairs.length} matching current-summary contract rows derived from positive durations; left ${report.counts.client_records_left_unchanged_without_duration} client records and ${openEndedContractRows.length} open-ended contract summaries unchanged.`,
    after_data: report,
    metadata: { repair_kind: repairKind },
  });
  if (auditError) throw auditError;

  console.log(JSON.stringify({ applied: true, ...report.counts }, null, 2));
}

main().catch((error) => {
  console.error(error.message ?? "MM legacy contract-placeholder repair failed.");
  process.exit(1);
});
