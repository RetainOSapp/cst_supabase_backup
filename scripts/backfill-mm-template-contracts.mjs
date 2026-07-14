import { createClient } from "@supabase/supabase-js";
import { getSupabaseEnv, loadDotEnv } from "./shared-env.mjs";

loadDotEnv();

const { url, serviceRoleKey } = getSupabaseEnv();
const supabase = createClient(url, serviceRoleKey, {
  auth: { persistSession: false },
});

const apply = process.argv.includes("--apply");
const companyId = "21586391-9a84-4072-9ae6-20436b27bea9";
const backfillKind = "mm_pathway_template_zapier_intake_v1";

function addDays(startIso, days) {
  const start = new Date(startIso);
  if (Number.isNaN(start.getTime()) || !Number.isFinite(Number(days))) {
    throw new Error(`Cannot calculate contract end date from ${startIso}.`);
  }
  start.setUTCDate(start.getUTCDate() + Number(days));
  return start.toISOString();
}

function isCurrentContract(contract) {
  if (contract.archived_at || String(contract.status ?? "").toLowerCase() === "archived") {
    return false;
  }
  if (!contract.end_date) return true;
  return contract.end_date.slice(0, 10) >= new Date().toISOString().slice(0, 10);
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

async function insertInChunks(table, payloads) {
  for (let index = 0; index < payloads.length; index += 100) {
    const { error } = await supabase.from(table).insert(payloads.slice(index, index + 100));
    if (error) throw error;
  }
}

async function updateClientSummaries(payloads) {
  for (const payload of payloads) {
    const { error } = await supabase
      .from("clients")
      .update(payload.summary)
      .eq("id", payload.clientId);
    if (error) throw error;
  }
}

async function main() {
  const [companyResult, clients, contracts, templates] = await Promise.all([
    supabase
      .from("companies")
      .select("id, name, legacy_glide_row_id, migration_status")
      .eq("id", companyId)
      .single(),
    queryAll(
      "clients",
      "id, glide_row_id, client_name, company_glide_row_id, created_at, offer_milestones_current_offer_id, metadata, archived_at",
    ),
    queryAll(
      "client_contracts",
      "id, glide_row_id, client_id, status, end_date, archived_at, metadata",
    ),
    queryAll(
      "company_contract_templates",
      "id, name, applies_to_offer_id, contract_days, monthly_value, reference_link, notes, auto_renew, is_enabled, archived_at, position",
    ),
  ]);
  if (companyResult.error) throw companyResult.error;
  const company = companyResult.data;
  if (company.name !== "Moves Method" || company.migration_status !== "migrated") {
    throw new Error("This backfill is restricted to the migrated Moves Method company.");
  }

  const currentContractClientIds = new Set(
    contracts.filter(isCurrentContract).map((contract) => contract.client_id),
  );
  const templatesByOffer = new Map(
    templates
      .filter((template) => template.is_enabled && !template.archived_at)
      .sort((left, right) => (left.position ?? 0) - (right.position ?? 0))
      .map((template) => [template.applies_to_offer_id, template]),
  );
  const candidates = clients.filter(
    (client) =>
      !client.archived_at &&
      client.metadata?.created_in === "zapier_create_client" &&
      !currentContractClientIds.has(client.glide_row_id),
  );
  const unmatched = candidates.filter(
    (client) => !templatesByOffer.has(client.offer_milestones_current_offer_id),
  );
  const payloads = candidates
    .filter((client) => templatesByOffer.has(client.offer_milestones_current_offer_id))
    .map((client) => {
      const template = templatesByOffer.get(client.offer_milestones_current_offer_id);
      const startDate = client.created_at;
      const contractDays = Math.max(1, Math.round(Number(template.contract_days)));
      const endDate = addDays(startDate, contractDays);
      const glideRowId = `template_backfill_${client.glide_row_id}`;
      const contract = {
        company_id: company.id,
        company_glide_row_id: client.company_glide_row_id,
        glide_row_id: glideRowId,
        client_id: client.glide_row_id,
        start_date: startDate,
        end_date: endDate,
        contract_days: contractDays,
        monthly_value: template.monthly_value,
        total_contract_value: null,
        reference_link: template.reference_link,
        notes:
          template.notes ?? `Backfilled from contract template: ${template.name}.`,
        auto_renew: template.auto_renew === true,
        status: "active",
        source_snapshot: {
          client_created_at: client.created_at,
          template_id: template.id,
          template_name: template.name,
        },
        metadata: {
          backfilled_by: "backfill-mm-template-contracts",
          backfill_kind: backfillKind,
          template_id: template.id,
          template_name: template.name,
          start_date_rule: "client_created_at",
        },
      };
      return {
        clientId: client.id,
        clientLegacyId: client.glide_row_id,
        clientName: client.client_name,
        contract,
        summary: {
          current_contract_start_date: startDate,
          current_contract_of_days: contractDays,
          current_contract_end_date: endDate,
          current_contract_end_date_for_filtering: endDate,
          current_contract_monthly_value: template.monthly_value,
          current_contract_reference_link: template.reference_link,
          current_contract_notes: contract.notes,
          current_contract_auto_renew: template.auto_renew === true,
        },
      };
    });

  const report = {
    ok: true,
    mode: apply ? "apply" : "dry-run",
    company: { id: company.id, name: company.name },
    rules: {
      intake_source: "zapier_create_client",
      missing_contract: "no unarchived contract current today",
      start_date: "RetainOS/Zapier client created_at",
    },
    counts: {
      matching_templates: templatesByOffer.size,
      eligible_clients: candidates.length,
      exact_template_matches_to_backfill: payloads.length,
      unmatched_clients_left_for_manual_work: unmatched.length,
    },
    template_breakdown: Object.fromEntries(
      Object.entries(
        payloads.reduce((counts, payload) => {
          const key = payload.contract.metadata.template_name;
          counts[key] = (counts[key] ?? 0) + 1;
          return counts;
        }, {}),
      ).sort(([left], [right]) => left.localeCompare(right)),
    ),
    unmatched_clients: unmatched.map((client) => client.client_name),
  };
  console.log(JSON.stringify(report, null, 2));
  if (!apply) return;

  await insertInChunks("client_contracts", payloads.map((payload) => payload.contract));
  await updateClientSummaries(payloads);
  const { error: auditError } = await supabase.from("app_audit_events").insert({
    company_id: company.id,
    event_type: "contract_template_backfill",
    source: "script",
    entity_table: "client_contracts",
    entity_id: null,
    legacy_glide_row_id: company.legacy_glide_row_id,
    title: "MM pathway contract templates backfilled",
    summary: `Backfilled ${payloads.length} current contracts from MM pathway templates; ${unmatched.length} clients remain for manual review.`,
    after_data: report,
    metadata: { backfill_kind: backfillKind },
  });
  if (auditError) throw auditError;

  console.log(JSON.stringify({ applied: true, ...report.counts }, null, 2));
}

main().catch((error) => {
  console.error(error.message ?? "MM contract-template backfill failed.");
  process.exit(1);
});
