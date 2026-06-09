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
const renewalStartArgument = readArg("renewal-start") ?? readArg("date-range-start");
const renewalEndArgument = readArg("renewal-end") ?? readArg("date-range-end");

function fail(message, details = undefined) {
  console.error(JSON.stringify({ ok: false, message, details }, null, 2));
  process.exit(1);
}

function normalized(value) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "string") return value.trim() || null;
  return value;
}

function cleanText(value) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text === "" ? null : text;
}

function normalizeDate(value) {
  const text = cleanText(value);
  if (!text) return null;
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return text;
  return date.toISOString().slice(0, 10);
}

function normalizeNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function normalizeBoolean(value) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  const text = String(value).trim().toLowerCase();
  if (["true", "yes", "y", "1"].includes(text)) return true;
  if (["false", "no", "n", "0"].includes(text)) return false;
  return value;
}

function normalizeContractField(field, value) {
  if (["start_date", "end_date"].includes(field)) return normalizeDate(value);
  if (["monthly_value", "total_contract_value"].includes(field)) {
    return normalizeNumber(value);
  }
  if (field === "auto_renew") return normalizeBoolean(value);
  return cleanText(value);
}

function addDays(date, days) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function parseDateArg(value, label) {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) {
    fail(`Invalid ${label}. Use YYYY-MM-DD.`, { value });
  }
  return date;
}

function isoDateOnly(date) {
  return date.toISOString().slice(0, 10);
}

function resolveRenewalRange() {
  const today = new Date();
  const defaultStart = new Date(Date.UTC(
    today.getUTCFullYear(),
    today.getUTCMonth(),
    today.getUTCDate(),
  ));
  const start = parseDateArg(renewalStartArgument, "--renewal-start") ?? defaultStart;
  const end = parseDateArg(renewalEndArgument, "--renewal-end") ?? addDays(start, 30);
  if (end < start) {
    fail("--renewal-end must be on or after --renewal-start.", {
      renewalStart: isoDateOnly(start),
      renewalEnd: isoDateOnly(end),
    });
  }
  return {
    startDate: isoDateOnly(start),
    endDate: isoDateOnly(end),
    startInclusive: start,
    endExclusive: addDays(end, 1),
    usedDefaultRange: !renewalStartArgument && !renewalEndArgument,
  };
}

function dateInRange(value, range) {
  const text = cleanText(value);
  if (!text) return false;
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return false;
  return date >= range.startInclusive && date < range.endExclusive;
}

function calculatedContractEndDate(client) {
  if (client.current_contract_end_date) return client.current_contract_end_date;
  if (!client.current_contract_start_date || client.current_contract_of_days == null) {
    return null;
  }
  const start = new Date(client.current_contract_start_date);
  const days = Number(client.current_contract_of_days);
  if (Number.isNaN(start.getTime()) || !Number.isFinite(days)) return null;
  return addDays(start, days).toISOString();
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

function summarizeIds(ids, limit = 20) {
  const sortedIds = [...ids].filter(Boolean).sort();
  return {
    count: sortedIds.length,
    sample: sortedIds.slice(0, limit),
  };
}

function summarizeSetDifference(leftSet, rightSet) {
  return summarizeIds([...leftSet].filter((id) => !rightSet.has(id)));
}

function retainedStatusTransition(event) {
  if (event.event_type === "client_retention_recorded") return true;
  if (event.event_type !== "client_status_changed") return false;
  const fromStatus = cleanText(event.payload?.from_status);
  const toStatus = cleanText(event.payload?.to_status);
  return ["front-end", "back-end"].includes(fromStatus ?? "") &&
    ["front-end", "back-end"].includes(toStatus ?? "");
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
  const renewalRange = resolveRenewalRange();

  const clientFields = [
    "glide_row_id",
    "client_name",
    "program_status_value",
    "client_age_date_offboarded",
    "client_age_date_offboarded_for_filtering",
    "csm_team_member_id",
    "csm_secondary_assignee_id",
    "offer_milestones_current_offer_id",
    "offer_milestones_current_milestone_id",
    "current_contract_start_date",
    "current_contract_of_days",
    "current_contract_end_date",
    "current_contract_end_date_for_filtering",
    "current_contract_monthly_value",
    "current_contract_reference_link",
    "current_contract_auto_renew",
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
        .select(
          "glide_row_id, client_id, start_date, end_date, monthly_value, total_contract_value, auto_renew, reference_link, status, archived_at, created_at",
          { count: "exact" },
        )
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
        .select("id, legacy_client_glide_row_id, event_type, payload, created_at", {
          count: "exact",
        })
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
    legacyStatusHistoryResult,
  ] = sourceClientIds.length > 0
    ? await Promise.all([
        runQuery("backup client contracts", () =>
          supabase
            .from("backup_company_clients_contracts")
            .select(
              "glide_row_id, client_id, start_date, end_date, monthly_value, auto_renew, reference_link",
            )
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
        runQuery("backup client status history", () =>
          supabase
            .from("backup_company_clients_history")
            .select("client_id, modified_date, value, original_value")
            .in("client_id", sourceClientIds)
            .eq("change_type_code", "program-status")
            .in("value", ["front-end", "back-end"])
            .in("original_value", ["front-end", "back-end"])
            .gte("modified_date", `${renewalRange.startDate}T00:00:00.000Z`)
            .lt("modified_date", renewalRange.endExclusive.toISOString()),
        ),
      ])
    : [
        { data: [], error: null },
        { data: [], error: null },
        { data: [], error: null },
      ];

  if (sourceContractsResult.error) throw sourceContractsResult.error;
  if (sourceClientMilestonesResult.error) throw sourceClientMilestonesResult.error;
  if (legacyStatusHistoryResult.error) throw legacyStatusHistoryResult.error;

  const sourceContracts = sourceContractsResult.data ?? [];
  const sourceClientMilestones = sourceClientMilestonesResult.data ?? [];
  const legacyStatusHistory = legacyStatusHistoryResult.data ?? [];

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
  const appClientsById = new Map(
    appClients.map((client) => [client.glide_row_id, client]),
  );
  const sourceContractsById = new Map(
    sourceContracts.map((contract) => [contract.glide_row_id, contract]),
  );
  const appUnarchivedContracts = appContracts.filter(
    (contract) => !contract.archived_at,
  );
  const archivedAppContracts = appContracts.filter((contract) => contract.archived_at);
  const contractDiffFields = [
    "client_id",
    "start_date",
    "end_date",
    "monthly_value",
    "auto_renew",
    "reference_link",
  ];
  const contractDifferencesByField = Object.fromEntries(
    contractDiffFields.map((field) => [field, 0]),
  );
  const contractFieldDiffs = appContracts
    .map((appContract) => {
      const sourceContract = sourceContractsById.get(appContract.glide_row_id);
      if (!sourceContract) return null;
      const diffs = contractDiffFields
        .map((field) => {
          const mirrored = normalizeContractField(field, sourceContract[field]);
          const app = normalizeContractField(field, appContract[field]);
          if (mirrored === app) return null;
          contractDifferencesByField[field] += 1;
          return { field, mirrored, app };
        })
        .filter(Boolean);
      if (diffs.length === 0) return null;
      return {
        glideRowId: appContract.glide_row_id,
        clientId: appContract.client_id,
        diffs,
      };
    })
    .filter(Boolean);

  const latestAppContractByClientId = new Map();
  for (const contract of appUnarchivedContracts) {
    const previous = latestAppContractByClientId.get(contract.client_id);
    const contractEnd = contract.end_date ? new Date(contract.end_date).getTime() : -Infinity;
    const previousEnd = previous?.end_date ? new Date(previous.end_date).getTime() : -Infinity;
    const contractCreated = contract.created_at
      ? new Date(contract.created_at).getTime()
      : -Infinity;
    const previousCreated = previous?.created_at
      ? new Date(previous.created_at).getTime()
      : -Infinity;
    if (
      !previous ||
      contractEnd > previousEnd ||
      (contractEnd === previousEnd && contractCreated > previousCreated)
    ) {
      latestAppContractByClientId.set(contract.client_id, contract);
    }
  }

  const latestContractSummaryMismatches = appClients
    .map((client) => {
      const contract = latestAppContractByClientId.get(client.glide_row_id);
      if (!contract) return null;
      const checks = [
        {
          field: "current_contract_start_date",
          clientSummary: normalizeDate(client.current_contract_start_date),
          latestContract: normalizeDate(contract.start_date),
        },
        {
          field: "current_contract_end_date",
          clientSummary: normalizeDate(client.current_contract_end_date),
          latestContract: normalizeDate(contract.end_date),
        },
        {
          field: "current_contract_end_date_for_filtering",
          clientSummary: normalizeDate(client.current_contract_end_date_for_filtering),
          latestContract: normalizeDate(contract.end_date),
        },
        {
          field: "current_contract_monthly_value",
          clientSummary: normalizeNumber(client.current_contract_monthly_value),
          latestContract: normalizeNumber(contract.monthly_value),
        },
        {
          field: "current_contract_reference_link",
          clientSummary: cleanText(client.current_contract_reference_link),
          latestContract: cleanText(contract.reference_link),
        },
        {
          field: "current_contract_auto_renew",
          clientSummary: normalizeBoolean(client.current_contract_auto_renew),
          latestContract: normalizeBoolean(contract.auto_renew),
        },
      ];
      const diffs = checks.filter(
        (check) => check.clientSummary !== check.latestContract,
      );
      if (diffs.length === 0) return null;
      return {
        clientId: client.glide_row_id,
        clientName: client.client_name,
        programStatus: client.program_status_value,
        latestContractId: contract.glide_row_id,
        latestContractEndDate: normalizeDate(contract.end_date),
        diffs,
      };
    })
    .filter(Boolean);

  const renewingFromCurrentSummary = new Set();
  const renewingFromAppContractHistory = new Set();
  const renewingFromLegacyContractHistory = new Set();
  const retainedFromAppRetentionEvents = new Set();
  const retainedFromAppStatusChanges = new Set();
  const retainedFromLegacyStatusHistory = new Set(
    legacyStatusHistory.map((event) => event.client_id).filter(Boolean),
  );

  for (const client of appClients) {
    if (dateInRange(calculatedContractEndDate(client), renewalRange)) {
      renewingFromCurrentSummary.add(client.glide_row_id);
    }
  }
  for (const contract of appUnarchivedContracts) {
    if (contract.client_id && dateInRange(contract.end_date, renewalRange)) {
      renewingFromAppContractHistory.add(contract.client_id);
    }
  }
  for (const contract of sourceContracts) {
    if (contract.client_id && dateInRange(contract.end_date, renewalRange)) {
      renewingFromLegacyContractHistory.add(contract.client_id);
    }
  }
  for (const event of historyResult.data ?? []) {
    if (!dateInRange(event.created_at, renewalRange)) continue;
    const clientId = event.legacy_client_glide_row_id;
    if (!clientId) continue;
    if (event.event_type === "client_retention_recorded") {
      retainedFromAppRetentionEvents.add(clientId);
    }
    if (retainedStatusTransition(event) && event.event_type === "client_status_changed") {
      retainedFromAppStatusChanges.add(clientId);
    }
  }

  const retainedIds = new Set([
    ...retainedFromAppRetentionEvents,
    ...retainedFromAppStatusChanges,
    ...retainedFromLegacyStatusHistory,
  ]);
  const renewingIds = new Set([
    ...renewingFromCurrentSummary,
    ...renewingFromAppContractHistory,
    ...renewingFromLegacyContractHistory,
  ]);
  const retentionSourceCountsByClient = {};
  for (const id of retainedFromAppRetentionEvents) {
    retentionSourceCountsByClient[id] = (retentionSourceCountsByClient[id] ?? 0) + 1;
  }
  for (const id of retainedFromAppStatusChanges) {
    retentionSourceCountsByClient[id] = (retentionSourceCountsByClient[id] ?? 0) + 1;
  }
  for (const id of retainedFromLegacyStatusHistory) {
    retentionSourceCountsByClient[id] = (retentionSourceCountsByClient[id] ?? 0) + 1;
  }
  const duplicateRetainedIds = Object.entries(retentionSourceCountsByClient)
    .filter(([, count]) => count > 1)
    .map(([id]) => id);
  const offboardedRenewingIds = [...renewingIds].filter(
    (id) => appClientsById.get(id)?.program_status_value === "off-boarded",
  );
  const excludedRenewingIds = [...renewingIds].filter((id) =>
    ["paused", "suspended", "off-boarded"].includes(
      appClientsById.get(id)?.program_status_value ?? "",
    ),
  );
  const activeUpForRenewalIds = [...renewingIds].filter((id) => {
    const client = appClientsById.get(id);
    return client &&
      ["front-end", "back-end"].includes(client.program_status_value ?? "") &&
      !retainedIds.has(id);
  });
  const renewalWarnings = offboardedRenewingIds.map((id) => {
    const client = appClientsById.get(id);
    return {
      clientId: id,
      clientName: client?.client_name ?? null,
      programStatus: client?.program_status_value ?? null,
      message: "Offboarded client enters the broader renewal denominator.",
    };
  });

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
          renewalStart: renewalRange.startDate,
          renewalEnd: renewalRange.endDate,
          renewalRangeDefaulted: renewalRange.usedDefaultRange,
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
        contractConfidence: {
          scope: {
            mirroredClientCount: sourceClients.length,
            appClientCount: appClients.length,
          },
          counts: {
            mirroredContracts: sourceContracts.length,
            appContracts: contractsResult.count ?? appContracts.length,
            appUnarchivedContracts: appUnarchivedContracts.length,
            appArchivedContracts: archivedAppContracts.length,
            matchingContracts: appContracts.filter((contract) =>
              sourceContractsById.has(contract.glide_row_id),
            ).length,
          },
          missingAppContractIdsByGlideRowId: summarizeIds(
            contractComparison.missingAppRows.map((contract) => contract.id),
          ),
          appOnlyContractIdsByGlideRowId: summarizeIds(
            contractComparison.appOnlyRows.map((contract) => contract.id),
          ),
          fieldDiffs: {
            count: contractFieldDiffs.length,
            byField: contractDifferencesByField,
            sample: sampleRows(contractFieldDiffs, 10),
          },
          latestUnarchivedAppContractVsClientSummaryMismatches: summarizeRows(
            latestContractSummaryMismatches,
          ),
          archivedAppContractCount: archivedAppContracts.length,
        },
        renewalConfidence: {
          range: {
            start: renewalRange.startDate,
            end: renewalRange.endDate,
            inclusiveStartExclusiveDayAfterEnd: true,
            defaultedToNext30Days: renewalRange.usedDefaultRange,
          },
          renewingIdsFromClientCurrentSummary: summarizeIds(
            renewingFromCurrentSummary,
          ),
          renewingIdsFromAppContractHistory: summarizeIds(
            renewingFromAppContractHistory,
          ),
          renewingIdsFromLegacyContractHistory: summarizeIds(
            renewingFromLegacyContractHistory,
          ),
          renewingIdsUnion: summarizeIds(renewingIds),
          currentSummaryOnlyRenewingIds: summarizeSetDifference(
            renewingFromCurrentSummary,
            new Set([
              ...renewingFromAppContractHistory,
              ...renewingFromLegacyContractHistory,
            ]),
          ),
          historyOnlyRenewingIds: summarizeSetDifference(
            new Set([
              ...renewingFromAppContractHistory,
              ...renewingFromLegacyContractHistory,
            ]),
            renewingFromCurrentSummary,
          ),
          retainedIds: {
            appRetentionEvents: summarizeIds(retainedFromAppRetentionEvents),
            appActiveToActiveStatusChanges: summarizeIds(
              retainedFromAppStatusChanges,
            ),
            legacyActiveToActiveStatusHistory: summarizeIds(
              retainedFromLegacyStatusHistory,
            ),
            union: summarizeIds(retainedIds),
            duplicateSourceIds: summarizeIds(duplicateRetainedIds),
          },
          activeUpForRenewalIdsExcludingRetainedPausedSuspendedOffboarded:
            summarizeIds(activeUpForRenewalIds),
          excludedPausedSuspendedOffboardedRenewingIds:
            summarizeIds(excludedRenewingIds),
          warnings: summarizeRows(renewalWarnings),
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
