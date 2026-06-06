import { createClient } from "@supabase/supabase-js";
import { getSupabaseEnv, loadDotEnv } from "./shared-env.mjs";

loadDotEnv();

const { url, serviceRoleKey } = getSupabaseEnv();
const supabase = createClient(url, serviceRoleKey, {
  auth: { persistSession: false },
});
const companyArgument =
  process.argv.find((argument) => argument.startsWith("--company="))?.slice(10) ??
  "Ethical Scaling";

function fail(message, details = undefined) {
  console.error(JSON.stringify({ ok: false, message, details }, null, 2));
  process.exit(1);
}

function normalized(value) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "string") return value.trim() || null;
  return value;
}

function countBy(rows, key) {
  return rows.reduce((counts, row) => {
    const value = normalized(row[key]) ?? "not_set";
    counts[value] = (counts[value] ?? 0) + 1;
    return counts;
  }, {});
}

async function main() {
  const { data: company, error: companyError } = await supabase
    .from("companies")
    .select("id, legacy_glide_row_id, name, migration_status")
    .eq("name", companyArgument)
    .single();
  if (companyError) throw companyError;

  const clientFields = [
    "glide_row_id",
    "client_name",
    "program_status_value",
    "csm_team_member_id",
    "csm_secondary_assignee_id",
    "offer_milestones_current_offer_id",
    "offer_milestones_current_milestone_id",
    "current_contract_end_date",
    "outcomes_success_value",
    "outcomes_progress_value",
    "outcomes_buy_in_value",
  ];
  const clientSelect = clientFields.join(",");

  const [
    sourceClientsResult,
    appClientsResult,
    membersResult,
    contractsResult,
    milestonesResult,
    historyResult,
    auditResult,
  ] = await Promise.all([
    supabase
      .from("backup_company_clients")
      .select(clientSelect)
      .eq("company_id", company.legacy_glide_row_id),
    supabase.from("clients").select(clientSelect).eq("company_id", company.id),
    supabase
      .from("company_members")
      .select(
        "id, legacy_glide_row_id, name, email, role, status, hide_from_csm_list",
      )
      .eq("company_id", company.id)
      .order("name"),
    supabase
      .from("client_contracts")
      .select("id, client_id", { count: "exact" })
      .eq("company_id", company.id),
    supabase
      .from("client_milestones")
      .select("id, client_id", { count: "exact" })
      .eq("company_id", company.id),
    supabase
      .from("client_history_events")
      .select("id", { count: "exact", head: true })
      .eq("company_id", company.id),
    supabase
      .from("app_audit_events")
      .select("id", { count: "exact", head: true })
      .eq("company_id", company.id),
  ]);

  for (const result of [
    sourceClientsResult,
    appClientsResult,
    membersResult,
    contractsResult,
    milestonesResult,
    historyResult,
    auditResult,
  ]) {
    if (result.error) throw result.error;
  }

  const sourceClients = sourceClientsResult.data ?? [];
  const appClients = appClientsResult.data ?? [];
  const members = membersResult.data ?? [];
  const sourceById = new Map(sourceClients.map((client) => [client.glide_row_id, client]));
  const appById = new Map(appClients.map((client) => [client.glide_row_id, client]));
  const missingAppClients = sourceClients
    .filter((client) => !appById.has(client.glide_row_id))
    .map((client) => ({ id: client.glide_row_id, name: client.client_name }));
  const appOnlyClients = appClients
    .filter((client) => !sourceById.has(client.glide_row_id))
    .map((client) => ({ id: client.glide_row_id, name: client.client_name }));

  const comparedFields = clientFields.filter((field) => field !== "glide_row_id");
  const differencesByField = Object.fromEntries(
    comparedFields.map((field) => [field, 0]),
  );
  for (const appClient of appClients) {
    const sourceClient = sourceById.get(appClient.glide_row_id);
    if (!sourceClient) continue;
    for (const field of comparedFields) {
      if (normalized(appClient[field]) !== normalized(sourceClient[field])) {
        differencesByField[field] += 1;
      }
    }
  }

  const activeAssignmentIds = new Set(
    members
      .filter((member) => member.status === "active" && !member.hide_from_csm_list)
      .flatMap((member) => [member.id, member.legacy_glide_row_id])
      .filter(Boolean),
  );
  const invalidAssignments = appClients
    .filter(
      (client) =>
        client.csm_team_member_id &&
        !activeAssignmentIds.has(client.csm_team_member_id),
    )
    .map((client) => ({
      id: client.glide_row_id,
      name: client.client_name,
      programStatus: client.program_status_value,
      csmTeamMemberId: client.csm_team_member_id,
    }));

  console.log(
    JSON.stringify(
      {
        ok: true,
        generatedAt: new Date().toISOString(),
        company,
        clients: {
          mirroredCount: sourceClients.length,
          appOwnedCount: appClients.length,
          missingAppClients,
          appOnlyClients,
          mirroredByStatus: countBy(sourceClients, "program_status_value"),
          appOwnedByStatus: countBy(appClients, "program_status_value"),
          differencesByField,
          invalidAssignments,
        },
        appOwnedActivity: {
          contractCount: contractsResult.count ?? contractsResult.data?.length ?? 0,
          milestoneCount:
            milestonesResult.count ?? milestonesResult.data?.length ?? 0,
          historyEventCount: historyResult.count ?? 0,
          auditEventCount: auditResult.count ?? 0,
        },
        team: members.map((member) => ({
          name: member.name,
          email: member.email,
          role: member.role,
          status: member.status,
          managesClients: !member.hide_from_csm_list,
          assignmentId: member.legacy_glide_row_id ?? member.id,
        })),
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  fail(error.message ?? "Reconciliation failed.", error);
});
