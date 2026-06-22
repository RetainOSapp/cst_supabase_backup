import { createClient } from "@supabase/supabase-js";
import { getSupabaseEnv, loadDotEnv } from "./shared-env.mjs";

loadDotEnv();

const apply = process.argv.includes("--apply");
const missingOnly = process.argv.includes("--missing-only");
const { url, serviceRoleKey } = getSupabaseEnv();
const supabase = createClient(url, serviceRoleKey, {
  auth: { persistSession: false },
});

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

function normalizeOutcome(value) {
  const text = cleanText(value);
  if (!text || text.toLowerCase() === "x") return null;
  return text;
}

function normalizeArchetype(value) {
  const text = cleanText(value)?.toLowerCase();
  if (!text) return null;
  if (text === "doer") return "Doer";
  if (text === "controller") return "Controller";
  if (text === "worrier") return "Worrier";
  if (text === "follower") return "Follower";
  return null;
}

const advocacyLegacyFields = [
  { prefix: "advocacy_review", legacy: "review" },
  { prefix: "advocacy_testimonial", legacy: "testimonial" },
  { prefix: "advocacy_referral", legacy: "referral" },
  { prefix: "advocacy_renewal_upsell", legacy: "renewal" },
];

function advocacySummaryFields(source) {
  return advocacyLegacyFields.reduce((payload, config) => {
    const askedAt = cleanDate(source[`outcomes_${config.legacy}_ask_date`]);
    const receivedAt = cleanDate(source[`outcomes_${config.legacy}_yes_date`]);
    const received =
      source[`outcomes_${config.legacy}_set`] === true || Boolean(receivedAt);
    const asked = Boolean(askedAt);
    payload[`${config.prefix}_asked_count`] = asked ? 1 : 0;
    payload[`${config.prefix}_received_count`] = received ? 1 : 0;
    payload[`${config.prefix}_status`] = received
      ? "received"
      : asked
        ? "asked"
        : "not_asked";
    payload[`${config.prefix}_last_asked_at`] = askedAt;
    payload[`${config.prefix}_last_received_at`] = receivedAt;
    payload[`${config.prefix}_last_note`] = null;
    return payload;
  }, {});
}

function clientPayload(source, company) {
  return {
    company_id: company.id,
    glide_row_id: source.glide_row_id,
    company_glide_row_id: source.company_id,
    client_name: cleanText(source.client_name) ?? "Unnamed client",
    client_business: cleanText(source.client_business),
    client_email: cleanText(source.client_email),
    client_image: cleanText(source.client_image),
    client_archetype_value: normalizeArchetype(source.client_archetype_value),
    north_star_value: cleanText(source.north_star_value),
    next_steps_value: cleanText(source.next_steps_value),
    client_general_info: cleanText(source.client_general_info),
    client_director_notes: cleanText(source.client_director_notes),
    csm_team_member_id: cleanText(source.csm_team_member_id),
    csm_secondary_assignee_id: cleanText(source.csm_secondary_assignee_id),
    csm_date_of_last_contact: cleanDate(source.csm_date_of_last_contact),
    csm_date_of_next_contact: cleanDate(source.csm_date_of_next_contact),
    client_age_date_onboarded: cleanDate(source.client_age_date_onboarded),
    client_age_date_offboarded: cleanDate(source.client_age_date_offboarded),
    client_age_date_offboarded_for_filtering: cleanDate(
      source.client_age_date_offboarded_for_filtering,
    ),
    current_contract_start_date: cleanDate(source.current_contract_start_date),
    current_contract_of_days: cleanNumber(source.current_contract_of_days),
    current_contract_end_date: cleanDate(source.current_contract_end_date),
    current_contract_end_date_for_filtering: cleanDate(
      source.current_contract_end_date_for_filtering,
    ),
    current_contract_monthly_value: cleanNumber(
      source.current_contract_monthly_value,
    ),
    current_contract_reference_link: cleanText(
      source.current_contract_reference_link,
    ),
    current_contract_notes: cleanText(source.current_contract_notes),
    current_contract_auto_renew: cleanBoolean(source.current_contract_auto_renew),
    program_status_value: cleanText(source.program_status_value),
    program_latest_back_end_start_date: cleanDate(
      source.program_latest_back_end_start_date,
    ),
    program_latest_paused_date: cleanDate(source.program_latest_paused_date),
    milestone_current_value: cleanText(source.milestone_current_value),
    offer_current_value: cleanText(source.offer_current_value),
    offer_milestones_current_offer_id: cleanText(
      source.offer_milestones_current_offer_id,
    ),
    offer_milestones_current_milestone_id: cleanText(
      source.offer_milestones_current_milestone_id,
    ),
    offer_milestones_current_milestone_change_date: cleanDate(
      source.offer_milestones_current_milestone_change_date,
    ),
    outcomes_success_value: normalizeOutcome(source.outcomes_success_value),
    outcomes_success_value_for_filtering: normalizeOutcome(
      source.outcomes_success_value_for_filtering,
    ),
    outcomes_success_date: cleanDate(source.outcomes_success_date),
    outcomes_progress_value: normalizeOutcome(source.outcomes_progress_value),
    outcomes_progress_for_filtering: normalizeOutcome(
      source.outcomes_progress_for_filtering,
    ),
    outcomes_progress_date: cleanDate(source.outcomes_progress_date),
    outcomes_buy_in_value: normalizeOutcome(source.outcomes_buy_in_value),
    outcomes_buy_in_for_filtering: normalizeOutcome(
      source.outcomes_buy_in_for_filtering,
    ),
    outcomes_buy_in_date: cleanDate(source.outcomes_buy_in_date),
    outcomes_suitable_value: cleanText(source.outcomes_suitable_value),
    outcomes_suitable_date: cleanDate(source.outcomes_suitable_date),
    ...advocacySummaryFields(source),
    churn_reason_value: cleanText(source.churn_reason_value),
    churn_comments: cleanText(source.churn_comments),
    source_snapshot: source,
    metadata: {
      pilot_backfill: true,
      source_table: "backup_company_clients",
      source_synced_at: source.synced_at ?? null,
    },
  };
}

async function main() {
  const { data: company, error: companyError } = await supabase
    .from("companies")
    .select("id, legacy_glide_row_id, name, migration_status")
    .eq("name", "Ethical Scaling")
    .eq("migration_status", "pilot")
    .single();

  if (companyError) throw companyError;

  const { data: sourceClients, error: sourceError } = await supabase
    .from("backup_company_clients")
    .select("*")
    .eq("company_id", company.legacy_glide_row_id);

  if (sourceError) throw sourceError;

  const sourcePayloads = (sourceClients ?? []).map((client) =>
    clientPayload(client, company),
  );

  let payloads = sourcePayloads;
  if (missingOnly) {
    const { data: existingClients, error: existingError } = await supabase
      .from("clients")
      .select("glide_row_id")
      .eq("company_id", company.id);

    if (existingError) throw existingError;

    const existingIds = new Set(
      (existingClients ?? []).map((client) => client.glide_row_id),
    );
    payloads = sourcePayloads.filter(
      (client) => !existingIds.has(client.glide_row_id),
    );
  }

  const byStatus = payloads.reduce((acc, client) => {
    const status = client.program_status_value ?? "not_set";
    acc[status] = (acc[status] ?? 0) + 1;
    return acc;
  }, {});

  console.log(
    JSON.stringify(
      {
        mode: apply ? "apply" : "dry-run",
        scope: missingOnly ? "missing-only" : "all-clients",
        company,
        clientCount: payloads.length,
        byStatus,
        clients: payloads.map((client) => ({
          glide_row_id: client.glide_row_id,
          client_name: client.client_name,
          program_status_value: client.program_status_value,
          csm_team_member_id: client.csm_team_member_id,
        })),
      },
      null,
      2,
    ),
  );

  if (!apply) {
    console.log(
      "Dry run only. Re-run with --apply to write pilot clients. Use --missing-only to preserve existing app-owned rows.",
    );
    return;
  }

  const chunkSize = 100;
  for (let index = 0; index < payloads.length; index += chunkSize) {
    const chunk = payloads.slice(index, index + chunkSize);
    const { error } = await supabase
      .from("clients")
      .upsert(chunk, { onConflict: "glide_row_id" });
    if (error) throw error;
  }

  const { error: auditError } = await supabase.from("app_audit_events").insert({
    company_id: company.id,
    event_type: "pilot_clients_backfill",
    source: "script",
    entity_table: "clients",
    title: "Ethical Scaling clients pilot backfill",
    summary:
      "Backfilled Ethical Scaling clients from Glide mirror into app-owned clients.",
    after_data: {
      client_count: payloads.length,
      by_status: byStatus,
      scope: missingOnly ? "missing-only" : "all-clients",
    },
  });

  if (auditError) throw auditError;

  console.log(
    JSON.stringify(
      {
        applied: true,
        companyId: company.id,
        clientCount: payloads.length,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error.message ?? error);
  process.exit(1);
});
