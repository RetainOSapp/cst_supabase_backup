import { createClient } from "@supabase/supabase-js";
import { getSupabaseEnv, loadDotEnv } from "./shared-env.mjs";

loadDotEnv();

const { url, serviceRoleKey } = getSupabaseEnv();
const supabase = createClient(url, serviceRoleKey, {
  auth: { persistSession: false },
});

const apply = process.argv.includes("--apply");

function readArg(name) {
  return process.argv.find((argument) => argument.startsWith(`--${name}=`))
    ?.slice(name.length + 3);
}

const companyArgument = readArg("company");
const companyIdArgument = readArg("company-id");
const legacyCompanyIdArgument = readArg("legacy-company-id");

function fail(message, details = undefined) {
  console.error(JSON.stringify({ ok: false, message, details }, null, 2));
  process.exit(1);
}

function cleanText(value) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text === "" ? null : text;
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

function countBy(rows, keyOrGetter) {
  const getter =
    typeof keyOrGetter === "function"
      ? keyOrGetter
      : (row) => row[keyOrGetter];
  return rows.reduce((counts, row) => {
    const key = cleanText(getter(row)) ?? "(blank)";
    counts[key] = (counts[key] ?? 0) + 1;
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
    if (error) throw new Error(`${label}: ${error.message}`);
    rows.push(...(data ?? []));
    if (!data || data.length < pageSize) break;
  }
  return rows;
}

async function insertInChunks(table, payloads, chunkSize = 100) {
  for (let index = 0; index < payloads.length; index += chunkSize) {
    const chunk = payloads.slice(index, index + chunkSize);
    const { error } = await supabase.from(table).insert(chunk);
    if (error) throw error;
  }
}

async function resolveCompany() {
  if (!companyArgument && !companyIdArgument && !legacyCompanyIdArgument) {
    fail("Company selector is required for this task backfill script.", {
      usage:
        "node scripts/backfill-company-tasks.mjs --company=\"Company Name\" [--apply]",
      selectors: ["--company", "--company-id", "--legacy-company-id"],
    });
  }

  let query = supabase
    .from("companies")
    .select("id, legacy_glide_row_id, name, migration_status, status");

  if (companyIdArgument) {
    query = query.eq("id", companyIdArgument);
  } else if (legacyCompanyIdArgument) {
    query = query.eq("legacy_glide_row_id", legacyCompanyIdArgument);
  } else {
    query = query.ilike("name", companyArgument);
  }

  const { data, error } = await query;
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

function normalizeTaskStatus(source) {
  const raw = cleanText(source.status_value)?.toLowerCase() ?? "";
  if (source.is_manually_archived === true || raw === "archived") return "archived";
  if (source.task_dismissed === true || raw === "dismissed") return "dismissed";
  if (
    cleanDate(source.completion_date) ||
    ["done", "complete", "completed"].includes(raw)
  ) {
    return "done";
  }
  if (["started", "in progress", "in-progress", "in_progress"].includes(raw)) {
    return "in-progress";
  }
  if (["onhold", "on hold", "waiting"].includes(raw)) return "waiting";
  return "todo";
}

function taskPayload(source, company, validClientIds) {
  const status = normalizeTaskStatus(source);
  const unresolvedLegacyClientLink =
    Boolean(source.client_id) && !validClientIds.has(source.client_id);
  const archivedAt =
    status === "archived"
      ? cleanDate(source.task_last_updated_date) ??
        cleanDate(source.completion_date) ??
        new Date().toISOString()
      : null;

  return {
    company_id: company.id,
    company_glide_row_id: company.legacy_glide_row_id,
    glide_row_id: source.glide_row_id,
    client_id: cleanText(source.client_id),
    task_name: cleanText(source.task_name) ?? "Migrated task",
    task_description: cleanText(source.task_description),
    task_due_date: cleanDate(source.task_due_date),
    task_last_updated_date:
      cleanDate(source.task_last_updated_date) ??
      cleanDate(source.synced_at) ??
      new Date().toISOString(),
    start_date: cleanDate(source.start_date),
    completion_date: cleanDate(source.completion_date),
    recurring_is_recurring: cleanBoolean(source.recurring_is_recurring) ?? false,
    is_manually_archived: status === "archived" || source.is_manually_archived === true,
    created_by_id: cleanText(source.created_by_id),
    assigned_to_id: cleanText(source.assigned_to_id),
    priority: cleanText(source.priority),
    status_value: status,
    external_link: cleanText(source.external_link),
    source_snapshot: source,
    metadata: {
      backfilled_from: "backup_company_clients_tasks",
      backfilled_by: "backfill-company-tasks",
      migration_seed: true,
      unresolved_legacy_client_link: unresolvedLegacyClientLink,
      source_synced_at: cleanDate(source.synced_at),
      raw_status_value: cleanText(source.status_value),
      task_dismissed: cleanBoolean(source.task_dismissed),
      kanban_order: source.kanban_order ?? null,
      recurring_weekday: cleanText(source.recurring_weekday),
      task_read: cleanBoolean(source.task_read),
    },
    archived_at: archivedAt,
  };
}

async function main() {
  const company = await resolveCompany();
  if (!company.legacy_glide_row_id) {
    fail("Company is missing legacy_glide_row_id; cannot read CST task source.");
  }

  const [sourceTasks, appClients, existingTasks] = await Promise.all([
    queryAll("backup company client tasks", () =>
      supabase
        .from("backup_company_clients_tasks")
        .select("*")
        .eq("company_id", company.legacy_glide_row_id),
    ),
    queryAll("app-owned clients", () =>
      supabase
        .from("clients")
        .select("glide_row_id, client_name, program_status_value")
        .eq("company_id", company.id),
    ),
    queryAll("existing app-owned tasks", () =>
      supabase
        .from("client_tasks")
        .select("glide_row_id, client_id, status_value, metadata")
        .eq("company_id", company.id),
    ),
  ]);

  const validClientIds = new Set(
    appClients.map((client) => client.glide_row_id).filter(Boolean),
  );
  const existingTaskIds = new Set(
    existingTasks.map((task) => task.glide_row_id).filter(Boolean),
  );

  const missingLegacyIds = sourceTasks.filter((task) => !cleanText(task.glide_row_id));
  const duplicateLegacyIds = sourceTasks.filter((task, index, rows) => {
    if (!cleanText(task.glide_row_id)) return false;
    return rows.findIndex((row) => row.glide_row_id === task.glide_row_id) !== index;
  });

  const payloads = sourceTasks
    .filter((task) => cleanText(task.glide_row_id))
    .filter((task) => !existingTaskIds.has(task.glide_row_id))
    .map((task) => taskPayload(task, company, validClientIds));

  const companyLevelTasks = sourceTasks.filter((task) => !cleanText(task.client_id));
  const clientLinkedTasks = sourceTasks.filter((task) => cleanText(task.client_id));
  const unresolvedLegacyClientLinks = sourceTasks.filter(
    (task) => cleanText(task.client_id) && !validClientIds.has(task.client_id),
  );
  const archivedPayloads = payloads.filter(
    (task) => task.status_value === "archived" || task.is_manually_archived,
  );

  const report = {
    ok: true,
    apply,
    company,
    counts: {
      sourceTasks: sourceTasks.length,
      appClients: appClients.length,
      existingAppTasks: existingTasks.length,
      toBackfill: payloads.length,
      companyLevelTasks: companyLevelTasks.length,
      clientLinkedTasks: clientLinkedTasks.length,
      unresolvedLegacyClientLinks: unresolvedLegacyClientLinks.length,
      sourceTasksMissingLegacyId: missingLegacyIds.length,
      duplicateSourceLegacyIds: duplicateLegacyIds.length,
      archivedBackfillRows: archivedPayloads.length,
    },
    rawStatusCounts: countBy(sourceTasks, "status_value"),
    mappedStatusCounts: countBy(payloads, "status_value"),
    unresolvedLegacyClientLinkSamples: sample(
      unresolvedLegacyClientLinks.map((task) => ({
        glide_row_id: task.glide_row_id,
        client_id: task.client_id,
        task_name: task.task_name,
        status_value: task.status_value,
        mapped_status_value: normalizeTaskStatus(task),
      })),
    ),
    backfillSamples: sample(
      payloads.map((task) => ({
        glide_row_id: task.glide_row_id,
        client_id: task.client_id,
        task_name: task.task_name,
        status_value: task.status_value,
        unresolved_legacy_client_link:
          task.metadata.unresolved_legacy_client_link,
      })),
    ),
  };

  console.log(JSON.stringify(report, null, 2));

  if (missingLegacyIds.length > 0 || duplicateLegacyIds.length > 0) {
    fail("Source task legacy IDs are not clean enough to apply safely.", {
      missingLegacyIds: missingLegacyIds.length,
      duplicateLegacyIds: duplicateLegacyIds.length,
      duplicateSamples: sample(duplicateLegacyIds.map((task) => task.glide_row_id)),
    });
  }

  if (!apply) {
    console.log("Dry run only. Re-run with --apply after reviewing the candidates.");
    return;
  }

  await insertInChunks("client_tasks", payloads);

  const { error: auditError } = await supabase.from("app_audit_events").insert({
    company_id: company.id,
    event_type: "historical_task_backfill",
    source: "script",
    entity_table: "client_tasks",
    entity_id: null,
    legacy_glide_row_id: company.legacy_glide_row_id,
    title: "Historical client tasks backfilled",
    summary: `Backfilled ${payloads.length} tasks from CST mirror tables.`,
    after_data: {
      source_tasks: sourceTasks.length,
      backfilled_tasks: payloads.length,
      company_level_tasks: companyLevelTasks.length,
      client_linked_tasks: clientLinkedTasks.length,
      unresolved_legacy_client_links: unresolvedLegacyClientLinks.length,
      mapped_status_counts: countBy(payloads, "status_value"),
    },
  });
  if (auditError) throw auditError;

  console.log(
    JSON.stringify(
      {
        applied: true,
        inserted: payloads.length,
        company_id: company.id,
        legacy_company_id: company.legacy_glide_row_id,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
