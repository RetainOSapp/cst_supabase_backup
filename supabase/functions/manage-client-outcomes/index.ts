/// <reference path="../_shared/deno.d.ts" />

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const WRITER_ROLES = new Set(["director", "support", "csm"]);
const SUCCESS_VALUES = new Set(["yes", "no"]);
const HEALTH_VALUES = new Set(["green", "yellow", "red"]);
const ADVOCACY_TYPES = new Set([
  "review",
  "testimonial",
  "referral",
  "renewal_upsell",
]);
const ADVOCACY_ACTIONS = new Set(["asked", "received"]);
const ADVOCACY_PREFIXES: Record<string, string> = {
  review: "advocacy_review",
  testimonial: "advocacy_testimonial",
  referral: "advocacy_referral",
  renewal_upsell: "advocacy_renewal_upsell",
};
const FALLBACK_OUTCOME_VALUES = {
  success: SUCCESS_VALUES,
  progress: HEALTH_VALUES,
  buy_in: HEALTH_VALUES,
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

function cleanText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function nullableText(value: unknown) {
  const text = cleanText(value);
  return text || null;
}

function parseDateTime(value: unknown) {
  const raw = cleanText(value);
  if (!raw) return null;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function parseAdvocacyEvents(value: unknown) {
  const rows = Array.isArray(value) ? value : [];
  return rows
    .map((row) => (row && typeof row === "object" ? (row as Record<string, unknown>) : null))
    .filter((row): row is Record<string, unknown> => Boolean(row))
    .map((row) => {
      const advocacyType = cleanText(row.advocacyType ?? row.type);
      const action = cleanText(row.action);
      if (!ADVOCACY_TYPES.has(advocacyType)) {
        throw new Error("Choose a valid advocacy type.");
      }
      if (!ADVOCACY_ACTIONS.has(action)) {
        throw new Error("Choose either asked or received for advocacy tracking.");
      }
      return {
        advocacyType,
        action,
        occurredAt: parseDateTime(row.occurredAt) ?? new Date().toISOString(),
        notes: cleanText(row.notes) || null,
      };
    });
}

function normalizeEmail(value: unknown) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function parseAllowlist(value: string | undefined) {
  return new Set(
    (value ?? "")
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  );
}

function getBearerToken(req: Request) {
  const auth = req.headers.get("Authorization") ?? "";
  const match = auth.match(/^Bearer\s+(.+)$/i);
  return match?.[1] ?? "";
}

async function resolveActor(
  supabase: ReturnType<typeof createClient>,
  userEmail: string,
  companyId: string,
) {
  const superAdminEmails = parseAllowlist(
    Deno.env.get("SUPER_ADMIN_EMAILS") ??
      Deno.env.get("VITE_SUPER_ADMIN_EMAILS"),
  );

  if (superAdminEmails.has(userEmail)) {
    return { role: "super_admin", memberId: null, legacyMemberId: null };
  }

  const { data, error } = await supabase
    .from("company_members")
    .select("id, legacy_glide_row_id, role, status")
    .eq("company_id", companyId)
    .ilike("email", userEmail)
    .maybeSingle();

  if (error) throw error;

  if (data?.status === "active" && WRITER_ROLES.has(data.role)) {
    return {
      role: data.role as string,
      memberId: data.id as string,
      legacyMemberId: data.legacy_glide_row_id as string | null,
    };
  }

  throw new Error("You do not have permission to edit client outcomes.");
}

function changedFields(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
) {
  return Object.keys(after).filter((key) => {
    const beforeValue = before[key] ?? null;
    const afterValue = after[key] ?? null;
    return beforeValue !== afterValue;
  });
}

function validateChoice(
  label: string,
  value: string | null,
  allowed: Set<string>,
) {
  if (value && !allowed.has(value)) {
    throw new Error(`${label} is not a supported outcome value.`);
  }
}

function parseCustomFieldValue(field: Record<string, unknown>, value: unknown) {
  const fieldType = cleanText(field.field_type) || "text";
  const options = Array.isArray(field.options)
    ? (field.options as Record<string, unknown>[])
    : [];
  const optionValues = new Set(
    options
      .flatMap((option) => [cleanText(option.value), cleanText(option.label)])
      .filter(Boolean)
      .map((option) => option.toLowerCase()),
  );

  if (value === null || value === undefined || value === "") {
    return { valueText: null, valueJson: null };
  }

  if (fieldType === "boolean") {
    const raw = String(value).trim().toLowerCase();
    if (!["true", "false", "yes", "no", "1", "0"].includes(raw)) {
      throw new Error(`${field.label ?? "Custom field"} must be yes or no.`);
    }
    const bool = raw === "true" || raw === "yes" || raw === "1";
    return { valueText: String(bool), valueJson: bool };
  }

  if (fieldType === "number") {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
      throw new Error(`${field.label ?? "Custom field"} must be a number.`);
    }
    return { valueText: String(numeric), valueJson: numeric };
  }

  if (fieldType === "date") {
    const raw = cleanText(value);
    const date = new Date(raw);
    if (!raw || Number.isNaN(date.getTime())) {
      throw new Error(`${field.label ?? "Custom field"} must be a valid date.`);
    }
    return { valueText: raw.slice(0, 10), valueJson: raw.slice(0, 10) };
  }

  if (fieldType === "multi_select") {
    const values = Array.isArray(value)
      ? value.map((item) => cleanText(item)).filter(Boolean)
      : cleanText(value)
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean);
    if (optionValues.size > 0) {
      for (const item of values) {
        if (!optionValues.has(item.toLowerCase())) {
          throw new Error(`${field.label ?? "Custom field"} has an unsupported option.`);
        }
      }
    }
    return { valueText: values.join(", "), valueJson: values };
  }

  const text = cleanText(value);
  if (fieldType === "single_select" && text && optionValues.size > 0) {
    if (!optionValues.has(text.toLowerCase())) {
      throw new Error(`${field.label ?? "Custom field"} has an unsupported option.`);
    }
  }
  return { valueText: text || null, valueJson: text || null };
}

async function prepareCustomFieldUpdates(
  supabase: ReturnType<typeof createClient>,
  companyId: string,
  clientLegacyId: string,
  customFields: unknown,
) {
  const rows = Array.isArray(customFields) ? customFields : [];
  const requested = rows
    .map((row) => (row && typeof row === "object" ? (row as Record<string, unknown>) : null))
    .filter((row): row is Record<string, unknown> => Boolean(row && cleanText(row.id)));

  if (requested.length === 0) return { changes: [], upserts: [] };

  const ids = [...new Set(requested.map((row) => cleanText(row.id)))];
  const { data: definitions, error: definitionsError } = await supabase
    .from("company_custom_fields")
    .select("id, key, label, field_type, options")
    .eq("company_id", companyId)
    .eq("entity_type", "client")
    .eq("status", "active")
    .in("id", ids);

  if (definitionsError) throw definitionsError;
  const definitionById = new Map(
    ((definitions ?? []) as Record<string, unknown>[]).map((row) => [String(row.id), row]),
  );

  const { data: existing, error: existingError } = await supabase
    .from("client_custom_field_values")
    .select("custom_field_id, value_text, value_json")
    .eq("company_id", companyId)
    .eq("client_id", clientLegacyId)
    .in("custom_field_id", ids);

  if (existingError) throw existingError;
  const existingById = new Map(
    ((existing ?? []) as Record<string, unknown>[]).map((row) => [
      String(row.custom_field_id),
      row,
    ]),
  );

  const changes: Record<string, unknown>[] = [];
  const upserts: Record<string, unknown>[] = [];

  for (const item of requested) {
    const id = cleanText(item.id);
    const definition = definitionById.get(id);
    if (!definition) throw new Error("A custom field is not enabled for this company.");
    const parsed = parseCustomFieldValue(definition, item.value);
    const before = existingById.get(id)?.value_text ?? null;
    if ((before ?? null) === (parsed.valueText ?? null)) continue;
    changes.push({
      id,
      key: definition.key,
      label: definition.label,
      before,
      after: parsed.valueText,
    });
    upserts.push({
      company_id: companyId,
      client_id: clientLegacyId,
      custom_field_id: id,
      field_key: definition.key,
      value_text: parsed.valueText,
      value_json: parsed.valueJson,
      source_table: "client_custom_field_values",
      metadata: {
        updated_from: "client_outcomes",
      },
    });
  }

  return { changes, upserts };
}

async function refreshAdvocacySummary(
  supabase: ReturnType<typeof createClient>,
  companyId: string,
  clientLegacyId: string,
) {
  const { data, error } = await supabase
    .from("client_advocacy_events")
    .select("advocacy_type, action, occurred_at, notes, created_at")
    .eq("company_id", companyId)
    .eq("client_legacy_id", clientLegacyId);

  if (error) throw error;

  const payload: Record<string, unknown> = {};
  for (const [type, prefix] of Object.entries(ADVOCACY_PREFIXES)) {
    const rows = ((data ?? []) as Record<string, unknown>[]).filter(
      (row) => row.advocacy_type === type,
    );
    const askedRows = rows.filter((row) => row.action === "asked");
    const receivedRows = rows.filter((row) => row.action === "received");
    const latest = [...rows].sort((left, right) => {
      const leftDate = new Date(
        String(left.occurred_at ?? left.created_at ?? "1970-01-01"),
      ).getTime();
      const rightDate = new Date(
        String(right.occurred_at ?? right.created_at ?? "1970-01-01"),
      ).getTime();
      return rightDate - leftDate;
    })[0];
    payload[`${prefix}_asked_count`] = askedRows.length;
    payload[`${prefix}_received_count`] = receivedRows.length;
    payload[`${prefix}_status`] =
      receivedRows.length > 0 ? "received" : askedRows.length > 0 ? "asked" : "not_asked";
    payload[`${prefix}_last_asked_at`] =
      askedRows
        .map((row) => row.occurred_at as string | null)
        .filter(Boolean)
        .sort()
        .at(-1) ?? null;
    payload[`${prefix}_last_received_at`] =
      receivedRows
        .map((row) => row.occurred_at as string | null)
        .filter(Boolean)
        .sort()
        .at(-1) ?? null;
    payload[`${prefix}_last_note`] = cleanText(latest?.notes) || null;
  }

  return payload;
}

async function loadAllowedOutcomeValues(
  supabase: ReturnType<typeof createClient>,
  companyId: string,
) {
  const { data, error } = await supabase
    .from("company_outcome_definitions")
    .select("outcome_type, value")
    .eq("company_id", companyId)
    .eq("status", "active");

  if (error) {
    console.error("Failed to load company outcome definitions:", error);
    return FALLBACK_OUTCOME_VALUES;
  }

  const allowed = {
    success: new Set<string>(),
    progress: new Set<string>(),
    buy_in: new Set<string>(),
  };

  for (const row of data ?? []) {
    const type = row.outcome_type as keyof typeof allowed;
    const value = cleanText(row.value).toLowerCase();
    if (type in allowed && value) allowed[type].add(value);
  }

  return {
    success:
      allowed.success.size > 0 ? allowed.success : FALLBACK_OUTCOME_VALUES.success,
    progress:
      allowed.progress.size > 0
        ? allowed.progress
        : FALLBACK_OUTCOME_VALUES.progress,
    buy_in:
      allowed.buy_in.size > 0 ? allowed.buy_in : FALLBACK_OUTCOME_VALUES.buy_in,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey =
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ??
      Deno.env.get("supabase_service_role");

    if (!supabaseUrl || !serviceRoleKey) {
      return jsonResponse(
        { error: "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY" },
        500,
      );
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });

    const token = getBearerToken(req);
    if (!token) return jsonResponse({ error: "Missing authorization." }, 401);

    const { data: userData, error: userError } =
      await supabase.auth.getUser(token);

    if (userError || !userData.user?.email) {
      return jsonResponse({ error: "Invalid session." }, 401);
    }

    const userEmail = normalizeEmail(userData.user.email);
    const body = await req.json().catch(() => ({}));
    const clientLegacyId = cleanText(body.clientLegacyId);

    if (!clientLegacyId) {
      return jsonResponse({ error: "Missing client id." }, 400);
    }

    const { data: client, error: clientError } = await supabase
      .from("clients")
      .select("*")
      .eq("glide_row_id", clientLegacyId)
      .maybeSingle();

    if (clientError) throw clientError;
    if (!client) {
      return jsonResponse(
        { error: "This client is not enabled for RetainOS outcome edits." },
        404,
      );
    }

    const { data: company, error: companyError } = await supabase
      .from("companies")
      .select("id, migration_status")
      .eq("id", client.company_id)
      .in("migration_status", ["pilot", "migrated"])
      .maybeSingle();

    if (companyError) throw companyError;
    if (!company) {
      return jsonResponse(
        { error: "This company is not enabled for RetainOS client writes." },
        400,
      );
    }

    const actor = await resolveActor(supabase, userEmail, company.id);

    if (actor.role === "csm") {
      const legacyMemberId = actor.legacyMemberId;
      const isAssigned =
        legacyMemberId &&
        (client.csm_team_member_id === legacyMemberId ||
          client.csm_secondary_assignee_id === legacyMemberId);
      if (!isAssigned) {
        return jsonResponse(
          { error: "CSMs can edit assigned clients only." },
          403,
        );
      }
    }

    const now = new Date().toISOString();
    const successStatus = nullableText(body.successStatus);
    const progressStatus = nullableText(body.progressStatus);
    const buyInStatus = nullableText(body.buyInStatus);
    const notes = nullableText(body.notes);
    const advocacyEvents = parseAdvocacyEvents(body.advocacyEvents);
    const outcomeUpdateTypes = new Set(
      Array.isArray(body.outcomeUpdateTypes)
        ? body.outcomeUpdateTypes.map((item) => cleanText(item)).filter(Boolean)
        : [],
    );
    const allowedOutcomes = await loadAllowedOutcomeValues(supabase, company.id);

    validateChoice("Success", successStatus, allowedOutcomes.success);
    validateChoice("Progress", progressStatus, allowedOutcomes.progress);
    validateChoice("Buy-in", buyInStatus, allowedOutcomes.buy_in);
    const customFieldUpdates = await prepareCustomFieldUpdates(
      supabase,
      company.id,
      clientLegacyId,
      body.customFields,
    );

    const advocacySummaryUpdates =
      advocacyEvents.length > 0
        ? await refreshAdvocacySummary(supabase, company.id, clientLegacyId)
        : {};

    const nextOutcomes: Record<string, unknown> = {
      outcomes_success_value: successStatus,
      outcomes_success_value_for_filtering: successStatus,
      outcomes_progress_value: progressStatus,
      outcomes_progress_for_filtering: progressStatus,
      outcomes_buy_in_value: buyInStatus,
      outcomes_buy_in_for_filtering: buyInStatus,
      ...advocacySummaryUpdates,
    };

    if (
      (client.outcomes_success_value ?? null) !== successStatus ||
      outcomeUpdateTypes.has("success")
    ) {
      nextOutcomes.outcomes_success_date = successStatus ? now : null;
    }
    if (
      (client.outcomes_progress_value ?? null) !== progressStatus ||
      outcomeUpdateTypes.has("progress")
    ) {
      nextOutcomes.outcomes_progress_date = progressStatus ? now : null;
    }
    if (
      (client.outcomes_buy_in_value ?? null) !== buyInStatus ||
      outcomeUpdateTypes.has("buy_in")
    ) {
      nextOutcomes.outcomes_buy_in_date = buyInStatus ? now : null;
    }

    const changes = changedFields(client, nextOutcomes);
    if (
      changes.length === 0 &&
      customFieldUpdates.changes.length === 0 &&
      advocacyEvents.length === 0 &&
      !notes
    ) {
      return jsonResponse({ error: "No outcome changes to save." }, 400);
    }

    const { data: updatedClient, error: updateError } = changes.length
      ? await supabase
          .from("clients")
          .update(nextOutcomes)
          .eq("id", client.id)
          .select("*")
          .single()
      : { data: client, error: null };

    if (updateError) throw updateError;

    if (customFieldUpdates.upserts.length > 0) {
      const { error: customFieldsError } = await supabase
        .from("client_custom_field_values")
        .upsert(customFieldUpdates.upserts, {
          onConflict: "company_id,client_id,custom_field_id",
        });
      if (customFieldsError) throw customFieldsError;
    }

    let insertedAdvocacyEvents: Record<string, unknown>[] = [];
    if (advocacyEvents.length > 0) {
      const { data: advocacyRows, error: advocacyError } = await supabase
        .from("client_advocacy_events")
        .insert(
          advocacyEvents.map((advocacyEvent) => ({
            company_id: company.id,
            client_id: client.id,
            client_legacy_id: clientLegacyId,
            company_legacy_id: client.company_glide_row_id ?? null,
            advocacy_type: advocacyEvent.advocacyType,
            action: advocacyEvent.action,
            occurred_at: advocacyEvent.occurredAt,
            notes: advocacyEvent.notes,
            csm_team_member_id: client.csm_team_member_id ?? null,
            actor_member_id: actor.memberId,
            actor_member_legacy_id: actor.legacyMemberId,
            actor_auth_user_id: userData.user.id,
            source: "client_outcomes",
            metadata: {
              actor_role: actor.role,
            },
          })),
        )
        .select("*");
      if (advocacyError) throw advocacyError;
      insertedAdvocacyEvents = (advocacyRows ?? []) as Record<string, unknown>[];

      const refreshedAdvocacySummary = await refreshAdvocacySummary(
        supabase,
        company.id,
        clientLegacyId,
      );
      const { data: refreshedClient, error: refreshedError } = await supabase
        .from("clients")
        .update(refreshedAdvocacySummary)
        .eq("id", client.id)
        .select("*")
        .single();
      if (refreshedError) throw refreshedError;
      Object.assign(updatedClient, refreshedClient);
    }

    const { data: event, error: historyError } = await supabase
      .from("client_history_events")
      .insert({
        company_id: company.id,
        legacy_client_glide_row_id: clientLegacyId,
        actor_auth_user_id: userData.user.id,
        actor_member_id: actor.memberId,
        event_type: "client_outcomes_updated",
        source: "client_outcomes",
        title: `Outcomes updated for ${updatedClient.client_name ?? "client"}`,
        summary:
          notes ??
          `Updated ${
            changes.length > 0
              ? changes.join(", ")
              : customFieldUpdates.changes.length > 0
                ? "custom fields"
                : "outcome notes"
          }.`,
        success_status: successStatus,
        progress_status: progressStatus,
        buy_in_status: buyInStatus,
        notes,
        payload: {
          actor_role: actor.role,
          changed_fields: changes,
          before: {
            outcomes_success_value: client.outcomes_success_value ?? null,
            outcomes_progress_value: client.outcomes_progress_value ?? null,
            outcomes_buy_in_value: client.outcomes_buy_in_value ?? null,
          },
          after: {
            outcomes_success_value: updatedClient.outcomes_success_value ?? null,
            outcomes_progress_value: updatedClient.outcomes_progress_value ?? null,
            outcomes_buy_in_value: updatedClient.outcomes_buy_in_value ?? null,
          },
          custom_fields: customFieldUpdates.changes,
          outcome_update_types: [...outcomeUpdateTypes],
          advocacy_events: insertedAdvocacyEvents,
        },
      })
      .select("*")
      .single();

    if (historyError) throw historyError;

    await supabase.from("app_audit_events").insert({
      company_id: company.id,
      actor_auth_user_id: userData.user.id,
      actor_member_id: actor.memberId,
      event_type: "client_outcomes_updated",
      source: "client_outcomes",
      entity_table: "clients",
      entity_id: updatedClient.id,
      legacy_glide_row_id: clientLegacyId,
      title: "Client outcomes updated",
      summary: `Outcomes updated for ${updatedClient.client_name ?? clientLegacyId}.`,
      before_data: client,
      after_data: updatedClient,
      metadata: {
        changed_fields: changes,
        custom_fields: customFieldUpdates.changes,
        outcome_update_types: [...outcomeUpdateTypes],
        advocacy_events: insertedAdvocacyEvents,
        history_event_id: event.id,
      },
    });

    return jsonResponse({
      ok: true,
      client: updatedClient,
      event,
      customFields: customFieldUpdates.changes,
      advocacyEvents: insertedAdvocacyEvents,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    return jsonResponse({ error: message }, 500);
  }
});
