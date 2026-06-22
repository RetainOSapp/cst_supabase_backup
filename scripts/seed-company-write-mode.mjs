import { createClient } from "@supabase/supabase-js";
import { getSupabaseEnv, loadDotEnv } from "./shared-env.mjs";

loadDotEnv();

const apply = process.argv.includes("--apply");
const missingOnly = process.argv.includes("--missing-only");
const includeArchived = process.argv.includes("--include-archived");
const { url, serviceRoleKey } = getSupabaseEnv();
const supabase = createClient(url, serviceRoleKey, {
  auth: { persistSession: false },
});

function readArg(name) {
  return process.argv.find((argument) => argument.startsWith(`--${name}=`))
    ?.slice(name.length + 3);
}

const companyArgument = readArg("company");
const legacyCompanyIdArgument = readArg("legacy-company-id");
const migrationStatusArgument = readArg("migration-status") ?? "pilot";

function fail(message, details = undefined) {
  console.error(JSON.stringify({ ok: false, message, details }, null, 2));
  process.exit(1);
}

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

function normalizeEmail(email) {
  return cleanText(email)?.toLowerCase() ?? null;
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
  { type: "review", prefix: "advocacy_review", legacy: "review" },
  { type: "testimonial", prefix: "advocacy_testimonial", legacy: "testimonial" },
  { type: "referral", prefix: "advocacy_referral", legacy: "referral" },
  { type: "renewal_upsell", prefix: "advocacy_renewal_upsell", legacy: "renewal" },
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

function advocacyEventPayloads(sourceClients, company, appClientByLegacyId) {
  return sourceClients.flatMap((source) => {
    const appClient = appClientByLegacyId.get(source.glide_row_id);
    if (!appClient) return [];
    return advocacyLegacyFields.flatMap((config) => {
      const askedAt = cleanDate(source[`outcomes_${config.legacy}_ask_date`]);
      const receivedAt = cleanDate(source[`outcomes_${config.legacy}_yes_date`]);
      const received =
        source[`outcomes_${config.legacy}_set`] === true || Boolean(receivedAt);
      const common = {
        company_id: company.id,
        client_id: appClient.id,
        client_legacy_id: source.glide_row_id,
        company_legacy_id: company.legacy_glide_row_id,
        advocacy_type: config.type,
        csm_team_member_id: cleanText(source.csm_team_member_id),
        source: "glide_migration",
        metadata: {
          migration_source: "backup_company_clients",
          seeded_by: "seed-company-write-mode",
        },
      };
      return [
        askedAt
          ? {
              ...common,
              action: "asked",
              occurred_at: askedAt,
            }
          : null,
        received
          ? {
              ...common,
              action: "received",
              occurred_at: receivedAt,
            }
          : null,
      ].filter(Boolean);
    });
  });
}

function roleFromBackup(member) {
  if (member.role_read_only_user === true) return "viewer";
  if (member.role_id === 1 || member.role_is_saa_s_admin === true) return "director";
  if (member.role_id === 2) return "support";
  if (member.role_id === 3) return "csm";
  if (member.role_hide_from_csm_list === true) return "support";
  return "csm";
}

function activeStatus(isArchived) {
  return isArchived === true ? "archived" : "active";
}

function countBy(rows, key) {
  return rows.reduce((counts, row) => {
    const value = cleanText(row[key]) ?? "not_set";
    counts[value] = (counts[value] ?? 0) + 1;
    return counts;
  }, {});
}

function sample(rows, limit = 10) {
  return rows.slice(0, limit);
}

async function queryAll(label, queryBuilder, pageSize = 1000) {
  const rows = [];
  for (let from = 0; ; from += pageSize) {
    const to = from + pageSize - 1;
    const { data, error } = await queryBuilder().range(from, to);
    if (error) {
      fail(`Failed to load ${label}.`, {
        message: error.message,
        code: error.code,
      });
    }
    rows.push(...(data ?? []));
    if ((data ?? []).length < pageSize) break;
  }
  return rows;
}

async function upsertInChunks(table, payloads, options) {
  const chunkSize = 100;
  for (let index = 0; index < payloads.length; index += chunkSize) {
    const chunk = payloads.slice(index, index + chunkSize);
    const { error } = await supabase.from(table).upsert(chunk, options);
    if (error) throw error;
  }
}

async function resolveMirrorCompany() {
  if (!companyArgument && !legacyCompanyIdArgument) {
    fail("Company selector is required.", {
      usage:
        "node scripts/seed-company-write-mode.mjs --company=\"Company Name\" [--apply]",
      selectors: ["--company", "--legacy-company-id"],
    });
  }

  let query = supabase.from("backup_companies").select("*").limit(10);
  if (legacyCompanyIdArgument) {
    query = query.eq("glide_row_id", legacyCompanyIdArgument);
  } else {
    query = query.ilike("name", companyArgument);
  }

  const { data, error } = await query;
  if (error) throw error;
  if (!data?.length) {
    fail("No mirrored company matched the requested selector.", {
      company: companyArgument,
      legacyCompanyId: legacyCompanyIdArgument,
    });
  }
  if (data.length > 1) {
    fail("Multiple mirrored companies matched. Re-run with --legacy-company-id.", {
      matches: data.map((company) => ({
        glide_row_id: company.glide_row_id,
        name: company.name,
      })),
    });
  }
  return data[0];
}

function companyPayload(sourceCompany) {
  if (!["pilot", "migrated"].includes(migrationStatusArgument)) {
    fail("Invalid migration status.", {
      migrationStatus: migrationStatusArgument,
      allowed: ["pilot", "migrated"],
    });
  }

  return {
    legacy_glide_row_id: sourceCompany.glide_row_id,
    name: cleanText(sourceCompany.name) ?? "Unnamed company",
    status: sourceCompany.archived === true ? "archived" : "active",
    migration_status: migrationStatusArgument,
    enable_secondary_assignee: cleanBoolean(sourceCompany.enable_secondary_assignee) ?? false,
    enable_call_ai_for_csms: cleanBoolean(sourceCompany.enable_call_ai_for_csms) ?? false,
    view_override: cleanText(sourceCompany.view_override),
    metadata: {
      migration_seed: true,
      source_table: "backup_companies",
      seeded_by: "seed-company-write-mode",
    },
  };
}

function memberPayload(member, company) {
  return {
    company_id: company.id,
    legacy_glide_row_id: member.glide_row_id,
    email: normalizeEmail(member.email),
    name: cleanText(member.name),
    photo_url: cleanText(member.photo),
    role: roleFromBackup(member),
    is_read_only: member.role_read_only_user === true,
    hide_from_csm_list: member.role_hide_from_csm_list === true,
    capacity_number: cleanNumber(member.capacity_number),
    status: activeStatus(member.is_archived),
    archived_at: member.is_archived === true ? new Date().toISOString() : null,
    metadata: {
      migration_seed: true,
      source_table: "backup_company_team",
      source_company_id: member.company_id,
      seeded_by: "seed-company-write-mode",
    },
  };
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
      migration_seed: true,
      source_table: "backup_company_clients",
      source_synced_at: source.synced_at ?? null,
      seeded_by: "seed-company-write-mode",
    },
  };
}

function offerPayload(offer, company) {
  return {
    company_id: company.id,
    company_glide_row_id: company.legacy_glide_row_id,
    glide_row_id: offer.glide_row_id,
    legacy_glide_row_id: offer.glide_row_id,
    name: cleanText(offer.name) ?? "Unnamed offer",
    metadata: {
      migration_seed: true,
      seeded_from: "backup_company_offers",
      seeded_by: "seed-company-write-mode",
    },
  };
}

function milestonePayload(milestone, company) {
  return {
    company_id: company.id,
    company_glide_row_id: company.legacy_glide_row_id,
    offer_id: milestone.offer_id,
    glide_row_id: milestone.glide_row_id,
    legacy_glide_row_id: milestone.glide_row_id,
    name: cleanText(milestone.name) ?? "Unnamed milestone",
    position: cleanNumber(milestone.order) ?? 0,
    target_days_to_complete: cleanNumber(
      milestone.target_days_to_complete_from_onboarding_date,
    ),
    is_ttv_milestone: cleanBoolean(milestone.ttv_milestone) ?? false,
    is_final_milestone: cleanBoolean(milestone.final_milestone) ?? false,
    metadata: {
      migration_seed: true,
      seeded_from: "backup_company_offer_milestones",
      seeded_by: "seed-company-write-mode",
    },
  };
}

function settingPayload(company, sourceCompany) {
  return {
    company_id: company.id,
    enable_secondary_assignee:
      cleanBoolean(sourceCompany.enable_secondary_assignee) ?? company.enable_secondary_assignee ?? false,
    enable_call_ai_for_csms:
      cleanBoolean(sourceCompany.enable_call_ai_for_csms) ?? company.enable_call_ai_for_csms ?? false,
    metadata: {
      migration_seed: true,
      seeded_from: "companies_and_backup_companies",
      seeded_by: "seed-company-write-mode",
    },
  };
}

function customFieldPayloads(company, sourceCompany) {
  return Array.from({ length: 7 }, (_, index) => {
    const key = `customfield${index + 1}`;
    const label = cleanText(sourceCompany[key]);
    if (!label) return null;
    return {
      company_id: company.id,
      key,
      label,
      field_type: "text",
      position: (index + 1) * 10,
      source_table: "backup_companies",
      source_key: key,
      metadata: {
        migration_seed: true,
        seeded_from: "glide_company_customfield_slots",
        source_key: key,
        seeded_by: "seed-company-write-mode",
      },
    };
  }).filter(Boolean);
}

function defaultOutcomePayloads(company) {
  const defaults = [
    ["success", "yes", "Yes", 10, 2],
    ["success", "no", "No", 20, 1],
    ["progress", "green", "Green", 10, 3],
    ["progress", "yellow", "Yellow", 20, 2],
    ["progress", "red", "Red", 30, 1],
    ["buy_in", "green", "Green", 10, 3],
    ["buy_in", "yellow", "Yellow", 20, 2],
    ["buy_in", "red", "Red", 30, 1],
  ];
  return defaults.map(([outcome_type, value, label, position, positive_rank]) => ({
    company_id: company.id,
    outcome_type,
    value,
    label,
    position,
    positive_rank,
    is_default: true,
    metadata: {
      migration_seed: true,
      seeded_from: "safe_defaults",
      seeded_by: "seed-company-write-mode",
    },
  }));
}

function defaultChurnReasonPayloads(company) {
  const defaults = [
    ["financial", "Financial", "commercial", 10, false],
    ["overwhelm", "Overwhelm", "capacity", 20, false],
    ["paused", "Paused", "paused", 30, false],
    ["spousal", "Spousal", "family", 40, false],
    ["uncertainty", "Uncertainty", "uncertainty", 50, false],
    ["other", "Other", "other", 60, true],
  ];
  return defaults.map(([value, label, category, position, requires_notes]) => ({
    company_id: company.id,
    value,
    label,
    category,
    position,
    requires_notes,
    metadata: {
      migration_seed: true,
      seeded_from: "safe_defaults",
      seeded_by: "seed-company-write-mode",
    },
  }));
}

function diagnosticNotificationPayloads(company) {
  return [
    {
      company_id: company.id,
      notification_type: "diagnostic_due",
      in_app_enabled: true,
      email_enabled: false,
      lead_days: 56,
    },
    {
      company_id: company.id,
      notification_type: "strategic_review_due",
      in_app_enabled: true,
      email_enabled: false,
      lead_days: 35,
    },
  ];
}

async function insertMissingNotificationPreferences(company, payloads) {
  if (!payloads.length) return;
  const { data, error } = await supabase
    .from("notification_preferences")
    .select("notification_type")
    .eq("company_id", company.id)
    .is("member_id", null)
    .is("role", null)
    .in("notification_type", payloads.map((payload) => payload.notification_type));
  if (error) throw error;

  const existingTypes = new Set(
    (data ?? []).map((preference) => preference.notification_type),
  );
  const missing = payloads.filter(
    (payload) => !existingTypes.has(payload.notification_type),
  );
  if (!missing.length) return;

  const { error: insertError } = await supabase
    .from("notification_preferences")
    .insert(missing);
  if (insertError) throw insertError;
}

async function main() {
  const sourceCompany = await resolveMirrorCompany();
  const legacyId = sourceCompany.glide_row_id;

  const [sourceMembers, sourceClients, sourceOffers] = await Promise.all([
    queryAll("mirrored team", () =>
      supabase
        .from("backup_company_team")
        .select("*")
        .eq("company_id", legacyId),
    ),
    queryAll("mirrored clients", () =>
      supabase
        .from("backup_company_clients")
        .select("*")
        .eq("company_id", legacyId),
    ),
    queryAll("mirrored offers", () =>
      supabase
        .from("backup_company_offers")
        .select("*")
        .eq("company_id", legacyId),
    ),
  ]);

  const offerIds = sourceOffers.map((offer) => offer.glide_row_id).filter(Boolean);
  const sourceMilestones = offerIds.length
    ? await queryAll("mirrored offer milestones", () =>
        supabase
          .from("backup_company_offer_milestones")
          .select("*")
          .in("offer_id", offerIds),
      )
    : [];

  const existingCompanyResult = await supabase
    .from("companies")
    .select("id, legacy_glide_row_id, name, migration_status, enable_secondary_assignee, enable_call_ai_for_csms")
    .eq("legacy_glide_row_id", legacyId)
    .maybeSingle();
  if (existingCompanyResult.error) throw existingCompanyResult.error;

  const sourceMemberPayloads = sourceMembers
    .map((member) => memberPayload(member, existingCompanyResult.data ?? { id: "dry-run", legacy_glide_row_id: legacyId }))
    .filter((member) => member.email);

  const activeEmails = sourceMemberPayloads
    .filter((member) => member.status === "active")
    .map((member) => member.email);
  const duplicateSourceActiveEmails = activeEmails.filter(
    (email, index) => activeEmails.indexOf(email) !== index,
  );

  let existingActiveEmailConflicts = [];
  if (activeEmails.length) {
    const { data, error } = await supabase
      .from("company_members")
      .select("email, company_id, companies(name, legacy_glide_row_id)")
      .in("email", activeEmails)
      .eq("status", "active");
    if (error) throw error;
    existingActiveEmailConflicts = (data ?? [])
      .filter((member) => member.companies?.legacy_glide_row_id !== legacyId)
      .map((member) => ({
        email: member.email,
        existingCompany: member.companies?.name ?? null,
        existingCompanyLegacyId: member.companies?.legacy_glide_row_id ?? null,
      }));
  }

  const report = {
    ok: true,
    mode: apply ? "apply" : "dry-run",
    generatedAt: new Date().toISOString(),
    selector: {
      company: companyArgument ?? null,
      legacyCompanyId: legacyCompanyIdArgument ?? null,
    },
    options: {
      migrationStatus: migrationStatusArgument,
      missingOnly,
      includeArchived,
    },
    company: {
      mirror: {
        glide_row_id: sourceCompany.glide_row_id,
        name: sourceCompany.name,
        archived: sourceCompany.archived,
      },
      existingAppOwned: existingCompanyResult.data ?? null,
    },
    sourceCounts: {
      members: sourceMembers.length,
      memberPayloadsWithEmail: sourceMemberPayloads.length,
      clients: sourceClients.length,
      activeClients: sourceClients.filter((client) =>
        ["front-end", "back-end"].includes(client.program_status_value ?? ""),
      ).length,
      offers: sourceOffers.length,
      milestones: sourceMilestones.length,
    },
    memberSafety: {
      duplicateSourceActiveEmails: [...new Set(duplicateSourceActiveEmails)],
      existingActiveEmailConflicts,
    },
    samples: {
      clients: sample(sourceClients.map((client) => ({
        glide_row_id: client.glide_row_id,
        client_name: client.client_name,
        status: client.program_status_value,
        csm: client.csm_team_member_id,
      }))),
      offers: sample(sourceOffers.map((offer) => ({
        glide_row_id: offer.glide_row_id,
        name: offer.name,
      }))),
    },
  };

  console.log(JSON.stringify(report, null, 2));

  if (!apply) {
    console.log("Dry run only. Re-run with --apply after reviewing this report.");
    return;
  }

  if (duplicateSourceActiveEmails.length || existingActiveEmailConflicts.length) {
    fail("Active member email conflicts must be resolved before apply.", {
      duplicateSourceActiveEmails: [...new Set(duplicateSourceActiveEmails)],
      existingActiveEmailConflicts,
    });
  }

  const { data: upsertedCompany, error: companyError } = await supabase
    .from("companies")
    .upsert(companyPayload(sourceCompany), { onConflict: "legacy_glide_row_id" })
    .select("id, legacy_glide_row_id, name, migration_status, enable_secondary_assignee, enable_call_ai_for_csms")
    .single();
  if (companyError) throw companyError;

  const existingClientRows = missingOnly
    ? await supabase
        .from("clients")
        .select("glide_row_id")
        .eq("company_id", upsertedCompany.id)
    : { data: [], error: null };
  if (existingClientRows.error) throw existingClientRows.error;
  const existingClientIds = new Set(
    (existingClientRows.data ?? []).map((client) => client.glide_row_id),
  );

  const members = sourceMembers
    .map((member) => memberPayload(member, upsertedCompany))
    .filter((member) => member.email);
  const clients = sourceClients
    .filter((client) => includeArchived || client.is_archived !== true)
    .map((client) => clientPayload(client, upsertedCompany))
    .filter((client) => !missingOnly || !existingClientIds.has(client.glide_row_id));
  const offers = sourceOffers
    .filter((offer) => offer.glide_row_id && offer.name)
    .map((offer) => offerPayload(offer, upsertedCompany));
  const milestones = sourceMilestones
    .filter((milestone) => milestone.glide_row_id && milestone.name)
    .map((milestone) => milestonePayload(milestone, upsertedCompany));

  await upsertInChunks("company_members", members, {
    onConflict: "legacy_glide_row_id",
  });
  await upsertInChunks("clients", clients, { onConflict: "glide_row_id" });

  const { data: appClientRows, error: appClientRowsError } = await supabase
    .from("clients")
    .select("id, glide_row_id")
    .eq("company_id", upsertedCompany.id);
  if (appClientRowsError) throw appClientRowsError;
  const appClientByLegacyId = new Map(
    (appClientRows ?? []).map((client) => [client.glide_row_id, client]),
  );
  const advocacyEvents = advocacyEventPayloads(
    sourceClients.filter((client) => includeArchived || client.is_archived !== true),
    upsertedCompany,
    appClientByLegacyId,
  );
  await supabase
    .from("client_advocacy_events")
    .delete()
    .eq("company_id", upsertedCompany.id)
    .eq("source", "glide_migration");
  if (advocacyEvents.length > 0) {
    await upsertInChunks("client_advocacy_events", advocacyEvents, {});
  }

  await upsertInChunks("company_offers", offers, { onConflict: "glide_row_id" });
  await upsertInChunks("company_offer_milestones", milestones, {
    onConflict: "glide_row_id",
  });

  await supabase
    .from("company_settings")
    .upsert(settingPayload(upsertedCompany, sourceCompany), {
      onConflict: "company_id",
    });
  await upsertInChunks("company_custom_fields", customFieldPayloads(upsertedCompany, sourceCompany), {
    onConflict: "company_id,key",
  });
  await upsertInChunks("company_outcome_definitions", defaultOutcomePayloads(upsertedCompany), {
    onConflict: "company_id,outcome_type,value",
  });
  await upsertInChunks("company_churn_reasons", defaultChurnReasonPayloads(upsertedCompany), {
    onConflict: "company_id,value",
  });
  await insertMissingNotificationPreferences(
    upsertedCompany,
    diagnosticNotificationPayloads(upsertedCompany),
  );
  const { error: notificationSeedError } = await supabase.rpc(
    "seed_default_notification_preferences",
    { p_company_id: upsertedCompany.id },
  );
  if (notificationSeedError) throw notificationSeedError;

  const { error: auditError } = await supabase.from("app_audit_events").insert({
    company_id: upsertedCompany.id,
    event_type: "company_write_mode_seed",
    source: "script",
    entity_table: "companies",
    entity_id: upsertedCompany.id,
    legacy_glide_row_id: upsertedCompany.legacy_glide_row_id,
    title: "Company write-mode seed",
    summary: `Seeded ${upsertedCompany.name} into app-owned write-mode tables.`,
    after_data: {
      migration_status: upsertedCompany.migration_status,
      members: members.length,
      clients: clients.length,
      offers: offers.length,
      milestones: milestones.length,
      missing_only: missingOnly,
    },
  });
  if (auditError) throw auditError;

  console.log(
    JSON.stringify(
      {
        applied: true,
        company: upsertedCompany,
        counts: {
          members: members.length,
          clients: clients.length,
          offers: offers.length,
          milestones: milestones.length,
          customFields: customFieldPayloads(upsertedCompany, sourceCompany).length,
        },
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  fail(error.message ?? "Company write-mode seed failed.", {
    stack: error.stack,
  });
});
