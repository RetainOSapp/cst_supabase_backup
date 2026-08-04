import { createClient } from "@supabase/supabase-js";
import { getSupabaseEnv, loadDotEnv } from "./shared-env.mjs";

loadDotEnv();

const { url, serviceRoleKey } = getSupabaseEnv();
const supabase = createClient(url, serviceRoleKey, {
  auth: { persistSession: false },
});

const companyId = "21586391-9a84-4072-9ae6-20436b27bea9";
const companyLegacyId = "wd7vy0vaQK2hgB3IRqy17w";
const activeStatuses = new Set([
  "front-end",
  "back-end",
  "paused",
  "suspended",
]);
const offboardedStatuses = new Set(["off-boarded", "offboarded"]);

function normalizeEmail(value) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function normalizeEmails(value) {
  const values = Array.isArray(value) ? value : [value];
  return [
    ...new Set(
      values
        .flatMap((item) =>
          typeof item === "string" ? item.split(/[;,\n]/) : [],
        )
        .map(normalizeEmail)
        .filter((email) => email.includes("@")),
    ),
  ];
}

function record(value) {
  return value && typeof value === "object" ? value : {};
}

function eventEmails(event) {
  const payload = record(event.payload);
  const metadata = record(event.metadata);
  return normalizeEmails(
    metadata.client_emails ??
      metadata.client_email ??
      payload.client_email ??
      payload.clientEmail ??
      payload.email ??
      payload.attendee_emails ??
      payload.attendeeEmails ??
      payload.invitee_emails ??
      payload.inviteeEmails,
  );
}

function eventTitle(event) {
  const payload = record(event.payload);
  const metadata = record(event.metadata);
  return (
    metadata.title ??
    payload.title ??
    metadata.client_name ??
    payload.client_name ??
    event.external_event_id
  );
}

function clientEmails(client) {
  return [
    client.client_email,
    client.client_email_secondary,
    client.client_email_tertiary,
  ]
    .map(normalizeEmail)
    .filter(Boolean);
}

function normalizedStatus(client) {
  return String(client.program_status_value ?? "").trim().toLowerCase();
}

function normalizeName(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function eventClientName(event) {
  const title = String(eventTitle(event) ?? "");
  return title.split(/\s+&\s+|\s+x\s+/i)[0]?.trim() ?? "";
}

async function loadClientRows(table, companyColumn, companyValue, excludeArchived) {
  const rows = [];
  const pageSize = 1_000;
  for (let from = 0; ; from += pageSize) {
    let query = supabase
      .from(table)
      .select("*")
      .eq(companyColumn, companyValue)
      .order("glide_row_id", { ascending: true })
      .range(from, from + pageSize - 1);
    if (excludeArchived) query = query.is("archived_at", null);
    const { data, error } = await query;
    if (error) throw error;
    rows.push(...(data ?? []));
    if ((data ?? []).length < pageSize) return rows;
  }
}

const [companyResult, eventsResult, appClients] = await Promise.all([
  supabase
    .from("companies")
    .select("id, name, legacy_glide_row_id, migration_status")
    .eq("id", companyId)
    .single(),
  supabase
    .from("integration_intake_events")
    .select(
      "id, integration_type, provider, external_event_id, status, match_status, error_message, payload, metadata, created_at",
    )
    .eq("company_id", companyId)
    .in("integration_type", [
      "call_summary_next_steps",
      "call_ai_transcript",
    ])
    .in("status", ["needs_review", "failed"])
    .order("created_at", { ascending: false })
    .limit(100),
  loadClientRows("clients", "company_id", companyId, true),
]);

if (companyResult.error) throw companyResult.error;
if (eventsResult.error) throw eventsResult.error;
if (
  companyResult.data.name !== "Moves Method" ||
  companyResult.data.legacy_glide_row_id !== companyLegacyId ||
  companyResult.data.migration_status !== "migrated"
) {
  throw new Error("This audit is restricted to migrated Moves Method.");
}

const allClients = appClients.map((client) => ({
  ...client,
  data_source: "clients",
}));
const clientsByEmail = new Map();
const clientsByName = new Map();
for (const client of allClients) {
  for (const email of clientEmails(client)) {
    const rows = clientsByEmail.get(email) ?? [];
    rows.push(client);
    clientsByEmail.set(email, rows);
  }
  const normalizedName = normalizeName(client.client_name);
  if (normalizedName) {
    const rows = clientsByName.get(normalizedName) ?? [];
    rows.push(client);
    clientsByName.set(normalizedName, rows);
  }
}

const rows = (eventsResult.data ?? []).map((event) => {
  const emails = eventEmails(event);
  const candidates = new Map();
  for (const email of emails) {
    for (const client of clientsByEmail.get(email) ?? []) {
      candidates.set(`${client.data_source}:${client.id ?? client.glide_row_id}`, client);
    }
  }
  const matches = [...candidates.values()];
  const active = matches.filter((client) =>
    activeStatuses.has(normalizedStatus(client)),
  );
  const offboarded = matches.filter((client) =>
    offboardedStatuses.has(normalizedStatus(client)),
  );
  const otherStatus = matches.filter(
    (client) =>
      !activeStatuses.has(normalizedStatus(client)) &&
      !offboardedStatuses.has(normalizedStatus(client)),
  );
  const inferredClientName = eventClientName(event);
  const nameMatches = clientsByName.get(normalizeName(inferredClientName)) ?? [];
  return {
    event_id: event.id,
    integration_type: event.integration_type,
    title: eventTitle(event),
    client_emails: emails,
    inferred_client_name: inferredClientName,
    current_error: event.error_message,
    active_matches: active.map((client) => ({
      id: client.id,
      glide_row_id: client.glide_row_id,
      name: client.client_name,
      status: client.program_status_value,
      data_source: client.data_source,
    })),
    offboarded_matches: offboarded.map((client) => ({
      id: client.id,
      glide_row_id: client.glide_row_id,
      name: client.client_name,
      status: client.program_status_value,
      data_source: client.data_source,
    })),
    other_status_matches: otherStatus.map((client) => ({
      id: client.id,
      glide_row_id: client.glide_row_id,
      name: client.client_name,
      status: client.program_status_value,
      data_source: client.data_source,
    })),
    safe_offboarded_fallback:
      active.length === 0 && offboarded.length === 1,
    exact_name_matches: nameMatches.map((client) => ({
      id: client.id,
      glide_row_id: client.glide_row_id,
      name: client.client_name,
      email: client.client_email,
      status: client.program_status_value,
      data_source: client.data_source,
    })),
  };
});

console.log(
  JSON.stringify(
    {
      ok: true,
      company: companyResult.data.name,
      counts: {
        open_events: rows.length,
        unique_active_match: rows.filter(
          (row) => row.active_matches.length === 1,
        ).length,
        ambiguous_active: rows.filter(
          (row) => row.active_matches.length > 1,
        ).length,
        unique_offboarded_fallback: rows.filter(
          (row) => row.safe_offboarded_fallback,
        ).length,
        ambiguous_offboarded: rows.filter(
          (row) =>
            row.active_matches.length === 0 &&
            row.offboarded_matches.length > 1,
        ).length,
        no_email_match: rows.filter(
          (row) =>
            row.active_matches.length === 0 &&
            row.offboarded_matches.length === 0,
        ).length,
        other_status_email_match: rows.filter(
          (row) => row.other_status_matches.length > 0,
        ).length,
        unique_exact_name_match: rows.filter(
          (row) => row.exact_name_matches.length === 1,
        ).length,
      },
      events: rows,
    },
    null,
    2,
  ),
);
