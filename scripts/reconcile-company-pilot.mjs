import { createClient } from "@supabase/supabase-js";
import { getSupabaseEnv, loadDotEnv } from "./shared-env.mjs";

loadDotEnv();

const { url, serviceRoleKey } = getSupabaseEnv();
const supabase = createClient(url, serviceRoleKey, {
  auth: { persistSession: false },
});

function readArg(name) {
  return process.argv.find((argument) => argument.startsWith(`--${name}=`))
    ?.slice(name.length + 3);
}

const companyArgument = readArg("company") ?? "Ethical Scaling";
const companyIdArgument = readArg("company-id");
const legacyCompanyIdArgument = readArg("legacy-company-id");

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

function compareById(sourceRows, appRows, idKey = "glide_row_id") {
  const sourceById = new Map(sourceRows.map((row) => [row[idKey], row]));
  const appById = new Map(appRows.map((row) => [row[idKey], row]));

  return {
    sourceById,
    appById,
    missingAppRows: sourceRows
      .filter((row) => row[idKey] && !appById.has(row[idKey]))
      .map((row) => ({ id: row[idKey], name: row.name ?? row.client_name ?? null })),
    appOnlyRows: appRows
      .filter((row) => row[idKey] && !sourceById.has(row[idKey]))
      .map((row) => ({ id: row[idKey], name: row.name ?? row.client_name ?? null })),
  };
}

function compareFields(sourceRows, appRows, fields, idKey = "glide_row_id") {
  const { sourceById } = compareById(sourceRows, appRows, idKey);
  const differencesByField = Object.fromEntries(fields.map((field) => [field, 0]));

  for (const appRow of appRows) {
    const sourceRow = sourceById.get(appRow[idKey]);
    if (!sourceRow) continue;
    for (const field of fields) {
      if (normalized(appRow[field]) !== normalized(sourceRow[field])) {
        differencesByField[field] += 1;
      }
    }
  }

  return differencesByField;
}

function sampleRows(rows, limit = 10) {
  return rows.slice(0, limit);
}

function summarizeRows(rows, limit = 10) {
  return {
    count: rows.length,
    sample: sampleRows(rows, limit),
  };
}

function isTransientSupabaseError(error) {
  return error?.code === "PGRST002" ||
    /schema cache|retrying|timeout|network/i.test(error?.message ?? "");
}

async function runQuery(label, queryFactory, attempts = 4) {
  let lastResult = null;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const result = await queryFactory();
    if (!result.error) return result;

    lastResult = result;
    if (!isTransientSupabaseError(result.error) || attempt === attempts) {
      return result;
    }

    const delayMs = 800 * attempt;
    console.error(
      `[reconcile] ${label} transient error (${result.error.code ?? "unknown"}), retrying in ${delayMs}ms...`,
    );
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }

  return lastResult;
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

  const { data, error } = await runQuery("company", () => query);
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

async function main() {
  const company = await resolveCompany();

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
    sourceOffersResult,
    appOffersResult,
    appOfferMilestonesResult,
    historyResult,
    auditResult,
  ] = await Promise.all([
    runQuery("backup clients", () =>
      supabase
        .from("backup_company_clients")
        .select(clientSelect)
        .eq("company_id", company.legacy_glide_row_id),
    ),
    runQuery("app clients", () =>
      supabase.from("clients").select(clientSelect).eq("company_id", company.id),
    ),
    runQuery("company members", () =>
      supabase
        .from("company_members")
        .select(
          "id, legacy_glide_row_id, name, email, role, status, hide_from_csm_list",
        )
        .eq("company_id", company.id)
        .order("name"),
    ),
    runQuery("app contracts", () =>
      supabase
        .from("client_contracts")
        .select("glide_row_id, client_id, start_date, end_date, archived_at", {
          count: "exact",
        })
        .eq("company_id", company.id),
    ),
    runQuery("app client milestones", () =>
      supabase
        .from("client_milestones")
        .select(
          "glide_row_id, client_id, offer_id, milestone_id, start_date, completion_date, archived_at",
          { count: "exact" },
        )
        .eq("company_id", company.id),
    ),
    runQuery("backup offers", () =>
      supabase
        .from("backup_company_offers")
        .select("glide_row_id, name")
        .eq("company_id", company.legacy_glide_row_id),
    ),
    runQuery("app offers", () =>
      supabase
        .from("company_offers")
        .select("glide_row_id, legacy_glide_row_id, name, status, archived_at")
        .eq("company_id", company.id),
    ),
    runQuery("app offer milestones", () =>
      supabase
        .from("company_offer_milestones")
        .select(
          "glide_row_id, legacy_glide_row_id, offer_id, name, position, target_days_to_complete, is_ttv_milestone, is_final_milestone, status, archived_at",
        )
        .eq("company_id", company.id),
    ),
    runQuery("history events", () =>
      supabase
        .from("client_history_events")
        .select("id", { count: "exact", head: true })
        .eq("company_id", company.id),
    ),
    runQuery("audit events", () =>
      supabase
        .from("app_audit_events")
        .select("id", { count: "exact", head: true })
        .eq("company_id", company.id),
    ),
  ]);

  for (const result of [
    sourceClientsResult,
    appClientsResult,
    membersResult,
    contractsResult,
    milestonesResult,
    sourceOffersResult,
    appOffersResult,
    appOfferMilestonesResult,
    historyResult,
    auditResult,
  ]) {
    if (result.error) throw result.error;
  }

  const sourceClients = sourceClientsResult.data ?? [];
  const appClients = appClientsResult.data ?? [];
  const members = membersResult.data ?? [];
  const appContracts = contractsResult.data ?? [];
  const appClientMilestones = milestonesResult.data ?? [];
  const sourceOffers = sourceOffersResult.data ?? [];
  const appOffers = appOffersResult.data ?? [];
  const appOfferMilestones = appOfferMilestonesResult.data ?? [];
  const sourceOfferIds = sourceOffers
    .map((offer) => offer.glide_row_id)
    .filter(Boolean);
  const sourceOfferMilestonesResult = sourceOfferIds.length > 0
    ? await runQuery("backup offer milestones", () =>
        supabase
          .from("backup_company_offer_milestones")
          .select(
            "glide_row_id, offer_id, name, order, target_days_to_complete_from_onboarding_date, ttv_milestone, final_milestone",
          )
          .in("offer_id", sourceOfferIds),
      )
    : { data: [], error: null };

  if (sourceOfferMilestonesResult.error) {
    throw sourceOfferMilestonesResult.error;
  }

  const sourceOfferMilestones = sourceOfferMilestonesResult.data ?? [];
  const sourceClientIds = sourceClients
    .map((client) => client.glide_row_id)
    .filter(Boolean);
  const [
    sourceContractsResult,
    sourceClientMilestonesResult,
  ] = sourceClientIds.length > 0
    ? await Promise.all([
        runQuery("backup client contracts", () =>
          supabase
            .from("backup_company_clients_contracts")
            .select("glide_row_id, client_id, start_date, end_date")
            .in("client_id", sourceClientIds),
        ),
        runQuery("backup client milestones", () =>
          supabase
            .from("backup_company_clients_milestones")
            .select(
              "glide_row_id, client_id, offer_id, milestone_id, start_date, completion_date",
            )
            .in("client_id", sourceClientIds),
        ),
      ])
    : [
        { data: [], error: null },
        { data: [], error: null },
      ];

  if (sourceContractsResult.error) throw sourceContractsResult.error;
  if (sourceClientMilestonesResult.error) throw sourceClientMilestonesResult.error;

  const sourceContracts = sourceContractsResult.data ?? [];
  const sourceClientMilestones = sourceClientMilestonesResult.data ?? [];

  const clientComparison = compareById(sourceClients, appClients);
  const comparedFields = clientFields.filter((field) => field !== "glide_row_id");
  const differencesByField = compareFields(sourceClients, appClients, comparedFields);

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
  const invalidActiveAssignments = invalidAssignments.filter((client) =>
    ["front-end", "back-end", "paused", "suspended"].includes(
      client.programStatus ?? "",
    ),
  );

  const offerComparison = compareById(sourceOffers, appOffers);
  const offerDifferencesByField = compareFields(sourceOffers, appOffers, ["name"]);
  const activeAppOfferIds = new Set(
    appOffers
      .filter((offer) => offer.status === "active" && !offer.archived_at)
      .map((offer) => offer.glide_row_id),
  );
  const appOfferMilestoneIds = new Set(
    appOfferMilestones
      .filter((milestone) => milestone.status === "active" && !milestone.archived_at)
      .map((milestone) => milestone.glide_row_id),
  );
  const activeClients = appClients.filter((client) =>
    ["front-end", "back-end"].includes(client.program_status_value ?? ""),
  );
  const activeClientsWithMissingOffer = activeClients
    .filter(
      (client) =>
        client.offer_milestones_current_offer_id &&
        !activeAppOfferIds.has(client.offer_milestones_current_offer_id),
    )
    .map((client) => ({
      id: client.glide_row_id,
      name: client.client_name,
      offerId: client.offer_milestones_current_offer_id,
    }));
  const activeClientsWithMissingMilestone = activeClients
    .filter(
      (client) =>
        client.offer_milestones_current_milestone_id &&
        !appOfferMilestoneIds.has(client.offer_milestones_current_milestone_id),
    )
    .map((client) => ({
      id: client.glide_row_id,
      name: client.client_name,
      milestoneId: client.offer_milestones_current_milestone_id,
    }));

  const sourceMilestoneComparable = sourceOfferMilestones.map((milestone) => ({
    glide_row_id: milestone.glide_row_id,
    offer_id: milestone.offer_id,
    name: milestone.name,
    position: milestone.order,
    target_days_to_complete:
      milestone.target_days_to_complete_from_onboarding_date,
    is_ttv_milestone: milestone.ttv_milestone,
    is_final_milestone: milestone.final_milestone,
  }));
  const offerMilestoneComparison = compareById(
    sourceMilestoneComparable,
    appOfferMilestones,
  );
  const offerMilestoneDifferencesByField = compareFields(
    sourceMilestoneComparable,
    appOfferMilestones,
    [
      "offer_id",
      "name",
      "position",
      "target_days_to_complete",
      "is_ttv_milestone",
      "is_final_milestone",
    ],
  );

  const contractComparison = compareById(sourceContracts, appContracts);
  const clientMilestoneComparison = compareById(
    sourceClientMilestones,
    appClientMilestones,
  );

  const blockers = [];
  const notes = [];
  if (clientComparison.missingAppRows.length > 0) {
    blockers.push(`${clientComparison.missingAppRows.length} mirrored clients are missing app-owned rows.`);
  }
  if (clientComparison.appOnlyRows.length > 0) {
    notes.push(`${clientComparison.appOnlyRows.length} app-owned clients do not exist in the mirror.`);
  }
  if (invalidActiveAssignments.length > 0) {
    blockers.push(`${invalidActiveAssignments.length} active/pilot clients point to inactive/non-client-managing CSM assignments.`);
  } else if (invalidAssignments.length > 0) {
    notes.push(`${invalidAssignments.length} invalid CSM assignments exist only on non-active clients.`);
  }
  if (offerComparison.missingAppRows.length > 0) {
    blockers.push(`${offerComparison.missingAppRows.length} mirrored offers are missing app-owned offer rows.`);
  }
  if (offerComparison.appOnlyRows.length > 0) {
    notes.push(`${offerComparison.appOnlyRows.length} app-owned offers do not exist in the mirror, likely pilot-created/archived rows.`);
  }
  if (offerMilestoneComparison.missingAppRows.length > 0) {
    blockers.push(`${offerMilestoneComparison.missingAppRows.length} mirrored offer milestones are missing app-owned milestone rows.`);
  }
  if (offerMilestoneComparison.appOnlyRows.length > 0) {
    notes.push(`${offerMilestoneComparison.appOnlyRows.length} app-owned offer milestones do not exist in the mirror, likely pilot-created/archived rows.`);
  }
  if (activeClientsWithMissingOffer.length > 0) {
    blockers.push(`${activeClientsWithMissingOffer.length} active clients reference an offer missing from active app-owned config.`);
  }
  if (activeClientsWithMissingMilestone.length > 0) {
    blockers.push(`${activeClientsWithMissingMilestone.length} active clients reference a milestone missing from active app-owned config.`);
  }
  if (sourceContracts.length > appContracts.length) {
    notes.push("Mirrored historical contracts are not fully backfilled app-side yet; pilot writes are app-owned from this point forward.");
  }
  if (sourceClientMilestones.length > appClientMilestones.length) {
    notes.push("Mirrored historical client milestone records are not fully backfilled app-side yet; pilot progress writes are app-owned from this point forward.");
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        generatedAt: new Date().toISOString(),
        selector: {
          company: companyArgument,
          companyId: companyIdArgument ?? null,
          legacyCompanyId: legacyCompanyIdArgument ?? null,
        },
        company,
        clients: {
          mirroredCount: sourceClients.length,
          appOwnedCount: appClients.length,
          missingAppClients: summarizeRows(clientComparison.missingAppRows),
          appOnlyClients: summarizeRows(clientComparison.appOnlyRows),
          mirroredByStatus: countBy(sourceClients, "program_status_value"),
          appOwnedByStatus: countBy(appClients, "program_status_value"),
          differencesByField,
          invalidAssignments: summarizeRows(invalidAssignments),
          invalidActiveAssignments: summarizeRows(invalidActiveAssignments),
        },
        journeyConfiguration: {
          offers: {
            mirroredCount: sourceOffers.length,
            appOwnedCount: appOffers.length,
            missingAppOffers: summarizeRows(offerComparison.missingAppRows),
            appOnlyOffers: summarizeRows(offerComparison.appOnlyRows),
            differencesByField: offerDifferencesByField,
            appOwnedByStatus: countBy(appOffers, "status"),
          },
          offerMilestones: {
            mirroredCount: sourceOfferMilestones.length,
            appOwnedCount: appOfferMilestones.length,
            missingAppMilestones: summarizeRows(
              offerMilestoneComparison.missingAppRows,
            ),
            appOnlyMilestones: summarizeRows(
              offerMilestoneComparison.appOnlyRows,
            ),
            differencesByField: offerMilestoneDifferencesByField,
            appOwnedByStatus: countBy(appOfferMilestones, "status"),
          },
          activeClientsWithMissingOffer: summarizeRows(activeClientsWithMissingOffer),
          activeClientsWithMissingMilestone: summarizeRows(
            activeClientsWithMissingMilestone,
          ),
        },
        appOwnedActivity: {
          mirroredContractCount: sourceContracts.length,
          appOwnedContractCount:
            contractsResult.count ?? contractsResult.data?.length ?? 0,
          missingAppContracts: summarizeRows(contractComparison.missingAppRows),
          appOnlyContracts: summarizeRows(contractComparison.appOnlyRows),
          mirroredClientMilestoneCount: sourceClientMilestones.length,
          appOwnedClientMilestoneCount:
            milestonesResult.count ?? milestonesResult.data?.length ?? 0,
          missingAppClientMilestones: summarizeRows(
            clientMilestoneComparison.missingAppRows,
          ),
          appOnlyClientMilestones: summarizeRows(
            clientMilestoneComparison.appOnlyRows,
          ),
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
        rolloutGate: {
          readyForPilot: blockers.length === 0,
          blockers,
          notes,
        },
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  fail(error.message ?? "Reconciliation failed.", error);
});
