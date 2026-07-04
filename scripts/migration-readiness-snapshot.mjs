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

const companyName = readArg("company") ?? "Moves Method";
const legacyCompanyId = readArg("legacy-company-id");

function fail(message, details = undefined) {
  console.error(JSON.stringify({ ok: false, message, details }, null, 2));
  process.exit(1);
}

function cleanText(value) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text === "" ? null : text;
}

function normalized(value) {
  return cleanText(value) ?? "not_set";
}

function countBy(rows, key) {
  return rows.reduce((counts, row) => {
    const value = normalized(row[key]);
    counts[value] = (counts[value] ?? 0) + 1;
    return counts;
  }, {});
}

function sample(rows, limit = 10) {
  return rows.slice(0, limit);
}

function summarize(rows, limit = 10) {
  return {
    count: rows.length,
    sample: sample(rows, limit),
  };
}

function uniqueValues(rows, key) {
  return [...new Set(rows.map((row) => cleanText(row[key])).filter(Boolean))];
}

function isActiveClient(client) {
  return ["front-end", "back-end"].includes(client.program_status_value ?? "");
}

function isVisibleManager(member) {
  return member.is_archived !== true &&
    member.role_hide_from_csm_list !== true &&
    member.role_read_only_user !== true;
}

function normalizeDate(value) {
  const text = cleanText(value);
  if (!text) return null;
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return text;
  return date.toISOString().slice(0, 10);
}

function calculatedContractEndDate(client) {
  const startText = cleanText(client.current_contract_start_date);
  const days = Number(client.current_contract_of_days);
  if (!startText || !Number.isFinite(days)) return null;
  const start = new Date(startText);
  if (Number.isNaN(start.getTime())) return null;
  start.setUTCDate(start.getUTCDate() + days);
  return start.toISOString().slice(0, 10);
}

function renewalConfidence(client) {
  const filteringDate = normalizeDate(client.current_contract_end_date_for_filtering);
  if (filteringDate) return { date: filteringDate, source: "filtering_date", confidence: "high" };

  const explicitDate = normalizeDate(client.current_contract_end_date);
  if (explicitDate) return { date: explicitDate, source: "end_date", confidence: "high" };

  const calculatedDate = calculatedContractEndDate(client);
  if (calculatedDate) {
    return {
      date: calculatedDate,
      source: "calculated_from_start_and_days",
      confidence: "medium",
    };
  }

  return { date: null, source: "missing", confidence: "missing" };
}

async function query(label, queryBuilder) {
  const result = await queryBuilder();
  if (result.error) {
    fail(`Failed to load ${label}.`, {
      message: result.error.message,
      code: result.error.code,
    });
  }
  return result.data ?? [];
}

async function queryAll(label, queryBuilder, pageSize = 1000) {
  const rows = [];
  for (let from = 0; ; from += pageSize) {
    const to = from + pageSize - 1;
    const result = await query(`${label} rows ${from}-${to}`, () =>
      queryBuilder().range(from, to),
    );
    rows.push(...result);
    if (result.length < pageSize) break;
  }
  return rows;
}

async function queryInChunks(label, values, chunkSize, queryBuilder) {
  const rows = [];
  for (let index = 0; index < values.length; index += chunkSize) {
    const chunk = values.slice(index, index + chunkSize);
    const result = await queryAll(
      `${label} chunk ${Math.floor(index / chunkSize) + 1}`,
      () => queryBuilder(chunk),
    );
    rows.push(...result);
  }
  return rows;
}

async function resolveMirrorCompany() {
  let queryBuilder = supabase
    .from("backup_companies")
    .select("glide_row_id,name,archived")
    .limit(10);

  if (legacyCompanyId) {
    queryBuilder = queryBuilder.eq("glide_row_id", legacyCompanyId);
  } else {
    queryBuilder = queryBuilder.ilike("name", companyName);
  }

  const { data, error } = await queryBuilder;
  if (error) throw error;
  if (!data?.length) {
    fail("No mirrored company matched the requested selector.", {
      company: companyName,
      legacyCompanyId,
    });
  }
  if (data.length > 1) {
    fail("Multiple mirrored companies matched. Re-run with --legacy-company-id.", {
      matches: data,
    });
  }
  return data[0];
}

async function main() {
  const mirrorCompany = await resolveMirrorCompany();
  const legacyId = mirrorCompany.glide_row_id;

  const [appCompanyRows, clients, team, offers, resources] = await Promise.all([
    query("app-owned company", () =>
      supabase
        .from("companies")
        .select("id,name,legacy_glide_row_id,migration_status")
        .eq("legacy_glide_row_id", legacyId),
    ),
    queryAll("mirrored clients", () =>
      supabase
        .from("backup_company_clients")
        .select(
          "glide_row_id,client_name,client_email,program_status_value,csm_team_member_id,csm_secondary_assignee_id,offer_milestones_current_offer_id,offer_milestones_current_milestone_id,current_contract_start_date,current_contract_of_days,current_contract_end_date,current_contract_end_date_for_filtering,outcomes_progress_value,outcomes_buy_in_value",
        )
        .eq("company_id", legacyId),
    ),
    queryAll("mirrored team", () =>
      supabase
        .from("backup_company_team")
        .select(
          "glide_row_id,name,email,role_id,role_is_saa_s_admin,role_hide_from_csm_list,role_read_only_user,is_archived",
        )
        .eq("company_id", legacyId),
    ),
    queryAll("mirrored offers", () =>
      supabase
        .from("backup_company_offers")
        .select("glide_row_id,name")
        .eq("company_id", legacyId),
    ),
    queryAll("company resources", () =>
      supabase
        .from("resources")
        .select("id,title,status,scope,company_legacy_id,type")
        .eq("scope", "company")
        .eq("company_legacy_id", legacyId),
    ),
  ]);

  const offerIds = uniqueValues(offers, "glide_row_id");
  const [offerMilestones, contracts, appClients] = await Promise.all([
    offerIds.length
      ? queryAll("mirrored offer milestones", () =>
          supabase
            .from("backup_company_offer_milestones")
            .select("glide_row_id,offer_id,name,order")
            .in("offer_id", offerIds),
        )
      : [],
    clients.length
      ? queryInChunks(
          "mirrored contracts",
          uniqueValues(clients, "glide_row_id"),
          100,
          (clientIds) =>
          supabase
            .from("backup_company_clients_contracts")
            .select("glide_row_id,client_id,start_date,end_date,monthly_value")
            .in("client_id", clientIds),
        )
      : [],
    appCompanyRows[0]?.id
      ? queryAll("app-owned clients", () =>
          supabase
            .from("clients")
            .select("glide_row_id,client_name,program_status_value")
            .eq("company_id", appCompanyRows[0].id),
        )
      : [],
  ]);

  const managerIds = new Set(
    team
      .filter(isVisibleManager)
      .flatMap((member) => [member.glide_row_id, member.email])
      .filter(Boolean),
  );
  const activeClients = clients.filter(isActiveClient);
  const invalidAssignments = clients
    .filter(
      (client) =>
        client.csm_team_member_id &&
        !managerIds.has(client.csm_team_member_id),
    )
    .map((client) => ({
      id: client.glide_row_id,
      name: client.client_name,
      status: client.program_status_value,
      csm: client.csm_team_member_id,
    }));
  const invalidActiveAssignments = invalidAssignments.filter((client) =>
    ["front-end", "back-end"].includes(client.status ?? ""),
  );
  const unassignedActiveClients = activeClients
    .filter((client) => !client.csm_team_member_id)
    .map((client) => ({
      id: client.glide_row_id,
      name: client.client_name,
      status: client.program_status_value,
    }));

  const offerIdSet = new Set(offerIds);
  const milestoneIdSet = new Set(uniqueValues(offerMilestones, "glide_row_id"));
  const activeClientsMissingOfferConfig = activeClients
    .filter(
      (client) =>
        client.offer_milestones_current_offer_id &&
        !offerIdSet.has(client.offer_milestones_current_offer_id),
    )
    .map((client) => ({
      id: client.glide_row_id,
      name: client.client_name,
      offerId: client.offer_milestones_current_offer_id,
    }));
  const activeClientsMissingMilestoneConfig = activeClients
    .filter(
      (client) =>
        client.offer_milestones_current_milestone_id &&
        !milestoneIdSet.has(client.offer_milestones_current_milestone_id),
    )
    .map((client) => ({
      id: client.glide_row_id,
      name: client.client_name,
      milestoneId: client.offer_milestones_current_milestone_id,
    }));

  const contractCountsByClientId = new Map();
  for (const contract of contracts) {
    if (!contract.client_id) continue;
    contractCountsByClientId.set(
      contract.client_id,
      (contractCountsByClientId.get(contract.client_id) ?? 0) + 1,
    );
  }
  const activeContractCoverage = activeClients.map((client) => {
    const renewal = renewalConfidence(client);
    return {
      id: client.glide_row_id,
      name: client.client_name,
      status: client.program_status_value,
      renewalDate: renewal.date,
      renewalDateSource: renewal.source,
      renewalDateConfidence: renewal.confidence,
      contractHistoryCount: contractCountsByClientId.get(client.glide_row_id) ?? 0,
    };
  });

  const blockers = [];
  const warnings = [
    "This snapshot reads the current Supabase CST mirror only. It does not trigger a CST sync.",
    "Final migration confidence requires a fresh paid CST sync on cutover day.",
  ];
  if (appCompanyRows.length === 0) {
    warnings.push("No app-owned company row exists yet. This is expected before write-mode migration.");
  }
  if (invalidActiveAssignments.length > 0) {
    blockers.push(`${invalidActiveAssignments.length} active clients have invalid CSM assignments.`);
  }
  if (activeClientsMissingOfferConfig.length > 0) {
    blockers.push(`${activeClientsMissingOfferConfig.length} active clients reference offers missing from mirrored offer config.`);
  }
  if (activeClientsMissingMilestoneConfig.length > 0) {
    blockers.push(`${activeClientsMissingMilestoneConfig.length} active clients reference milestones missing from mirrored milestone config.`);
  }

  const readyForReadOnlyWalkthrough = blockers.length === 0;
  const readyForWriteMigration = false;

  console.log(
    JSON.stringify(
      {
        ok: true,
        generatedAt: new Date().toISOString(),
        selector: { company: companyName, legacyCompanyId: legacyCompanyId ?? null },
        company: {
          mirror: mirrorCompany,
          appOwned: appCompanyRows[0] ?? null,
        },
        clients: {
          mirroredCount: clients.length,
          appOwnedCount: appClients.length,
          byStatus: countBy(clients, "program_status_value"),
          activeClientCount: activeClients.length,
          unassignedActiveClients: summarize(unassignedActiveClients),
          invalidAssignments: summarize(invalidAssignments),
          invalidActiveAssignments: summarize(invalidActiveAssignments),
        },
        team: {
          mirroredCount: team.length,
          visibleClientManagerCount: team.filter(isVisibleManager).length,
          byRole: countBy(team, "role_id"),
          archivedCount: team.filter((member) => member.is_archived === true).length,
          hiddenFromCsmListCount: team.filter(
            (member) => member.role_hide_from_csm_list === true,
          ).length,
        },
        journey: {
          offerCount: offers.length,
          offerMilestoneCount: offerMilestones.length,
          activeClientsMissingOfferConfig: summarize(
            activeClientsMissingOfferConfig,
          ),
          activeClientsMissingMilestoneConfig: summarize(
            activeClientsMissingMilestoneConfig,
          ),
        },
        contracts: {
          mirroredContractCount: contracts.length,
          activeCoverage: {
            activeClientCount: activeContractCoverage.length,
            renewalDateSources: countBy(activeContractCoverage, "renewalDateSource"),
            missingRenewalDate: summarize(
              activeContractCoverage.filter((client) => !client.renewalDate),
            ),
            missingContractHistory: summarize(
              activeContractCoverage.filter(
                (client) => client.contractHistoryCount === 0,
              ),
            ),
          },
        },
        resources: {
          companyResourceCount: resources.length,
          activeCompanyResourceCount: resources.filter(
            (resource) => resource.status !== "archived",
          ).length,
          byType: countBy(resources, "type"),
        },
        rolloutGate: {
          readyForReadOnlyWalkthrough,
          readyForWriteMigration,
          blockers,
          warnings,
          notes: [
            "Write migration remains intentionally blocked until Jay triggers the final CST sync and approves app-owned backfill/cutover.",
          ],
        },
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  fail(error.message, {
    stack: error.stack,
  });
});
