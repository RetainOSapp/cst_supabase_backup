import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseEnv, loadDotEnv } from "./shared-env.mjs";

loadDotEnv();

const { url, serviceRoleKey } = getSupabaseEnv();
const supabase = createClient(url, serviceRoleKey, {
  auth: { persistSession: false },
});

const companyLegacyId = "wd7vy0vaQK2hgB3IRqy17w";
const adamLegacyId = "1AQ8IUNmRO2jIuHWL.Ql7Q";
const repairKind = "mm_contract_summary_reconciliation_v1";
const clientIds = {
  daniel: "7BSzJrQvTTmA06FCntXEYw",
  richardson: "C694O4lZTRKNr3bUvkR7YQ",
  lisa: "lfl3JCLnTsiN5QpK9APKGg",
};

function dateKey(value) {
  return value ? String(value).slice(0, 10) : null;
}

async function cohort(start, end) {
  const { data, error } = await supabase.rpc(
    "dashboard_renewal_cohort_counts_fast",
    {
      p_company_id: companyLegacyId,
      p_csm_id: null,
      p_secondary_assignee_id: null,
      p_program_values: null,
      p_offer_id: null,
      p_client_start_date_from: null,
      p_client_start_date_to: null,
      p_date_range_start: start,
      p_date_range_end: end,
      p_assigned_team_member_id: adamLegacyId,
    },
  );
  if (error) throw error;
  return data?.[0] ?? {};
}

const [july, august, september, clientsResult, lisaContractsResult, auditResult] =
  await Promise.all([
    cohort("2026-07-01", "2026-07-31"),
    cohort("2026-08-01", "2026-08-31"),
    cohort("2026-09-01", "2026-09-30"),
    supabase
      .from("clients")
      .select(
        [
          "glide_row_id",
          "client_name",
          "program_status_value",
          "current_contract_start_date",
          "current_contract_of_days",
          "current_contract_end_date",
          "current_contract_end_date_for_filtering",
        ].join(", "),
      )
      .in("glide_row_id", Object.values(clientIds)),
    supabase
      .from("client_contracts")
      .select("id, status, start_date, end_date, contract_days, updated_at")
      .eq("client_id", clientIds.lisa)
      .is("archived_at", null),
    supabase
      .from("app_audit_events")
      .select("id", { count: "exact", head: true })
      .eq("event_type", "contract_summary_reconciled")
      .eq("metadata->>repair_kind", repairKind),
  ]);

if (clientsResult.error) throw clientsResult.error;
if (lisaContractsResult.error) throw lisaContractsResult.error;
if (auditResult.error) throw auditResult.error;

const clientById = new Map(
  (clientsResult.data ?? []).map((client) => [client.glide_row_id, client]),
);
const julyIds = new Set(july.renewal_cohort_client_ids ?? []);
const augustIds = new Set(august.renewal_cohort_client_ids ?? []);
const septemberIds = new Set(september.renewal_cohort_client_ids ?? []);
const septemberRetainedIds = new Set(september.retained_client_ids ?? []);
const septemberUnresolvedIds = [...septemberIds].filter(
  (id) => !septemberRetainedIds.has(id),
);
const { data: septemberClients, error: septemberClientsError } =
  septemberUnresolvedIds.length > 0
    ? await supabase
        .from("clients")
        .select("glide_row_id, program_status_value")
        .in("glide_row_id", septemberUnresolvedIds)
    : { data: [], error: null };
if (septemberClientsError) throw septemberClientsError;
const septemberActiveIds = new Set(
  (septemberClients ?? [])
    .filter((client) =>
      ["front-end", "back-end"].includes(client.program_status_value),
    )
    .map((client) => client.glide_row_id),
);

const daniel = clientById.get(clientIds.daniel);
const richardson = clientById.get(clientIds.richardson);
const lisa = clientById.get(clientIds.lisa);
const lisaContract = (lisaContractsResult.data ?? []).find(
  (contract) => contract.status === "current_summary",
);

assert(daniel, "Daniel Michaud is missing.");
assert(richardson, "Richardson Jules is missing.");
assert(lisa, "Lisa Fuller is missing.");
assert(julyIds.has(clientIds.daniel), "Daniel is missing from Adam's July cohort.");
assert(
  julyIds.has(clientIds.richardson),
  "Richardson is missing from Adam's July cohort.",
);
assert(
  !augustIds.has(clientIds.lisa),
  "Lisa must not appear in Adam's August cohort.",
);
assert(
  septemberIds.has(clientIds.lisa),
  "Lisa is missing from Adam's September cohort.",
);
assert(
  septemberActiveIds.has(clientIds.lisa),
  "Lisa is missing from Adam's active September work queue.",
);
assert.equal(
  dateKey(daniel.current_contract_end_date_for_filtering),
  "2026-07-14",
);
assert.equal(
  dateKey(richardson.current_contract_end_date_for_filtering),
  "2026-07-14",
);
assert(
  [
    lisa.current_contract_start_date,
    lisa.current_contract_of_days,
    lisa.current_contract_end_date,
    lisa.current_contract_end_date_for_filtering,
  ].every((value) => value === null),
  "Lisa's pending summary must remain untouched.",
);
assert(lisaContract, "Lisa's migrated current-summary contract is missing.");
assert.equal(dateKey(lisaContract.start_date), "2026-03-03");
assert.equal(dateKey(lisaContract.end_date), "2026-09-03");
assert.equal(auditResult.count, 103);

console.log(
  JSON.stringify(
    {
      ok: true,
      adam_cohorts: {
        july: {
          eligible: Number(july.renewal_cohort_clients ?? 0),
          retained: Number(july.retained_clients ?? 0),
          includes_daniel: true,
          includes_richardson: true,
        },
        august: {
          eligible: Number(august.renewal_cohort_clients ?? 0),
          retained: Number(august.retained_clients ?? 0),
          includes_lisa: false,
        },
        september: {
          eligible: Number(september.renewal_cohort_clients ?? 0),
          retained: Number(september.retained_clients ?? 0),
          active_unresolved: septemberActiveIds.size,
          includes_lisa: true,
        },
      },
      named_clients: {
        daniel_contract_end: dateKey(
          daniel.current_contract_end_date_for_filtering,
        ),
        richardson_contract_end: dateKey(
          richardson.current_contract_end_date_for_filtering,
        ),
        lisa_contract: {
          start_date: dateKey(lisaContract.start_date),
          end_date: dateKey(lisaContract.end_date),
          summary_held_pending_confirmation: true,
        },
      },
      audited_summary_repairs: auditResult.count,
    },
    null,
    2,
  ),
);
