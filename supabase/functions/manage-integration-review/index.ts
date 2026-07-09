/// <reference path="../_shared/deno.d.ts" />

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const ACTIONS = new Set(["match", "retry", "ignore"]);
const ACTIVE_PROGRAM_STATUSES = new Set([
  "front-end",
  "back-end",
  "paused",
  "suspended",
]);
const CLIENT_UPDATE_FIELDS = [
  "next_steps_value",
  "csm_date_of_last_contact",
  "csm_date_of_next_contact",
  "offer_milestones_current_offer_id",
  "csm_team_member_id",
] as const;

type SupabaseClient = ReturnType<typeof createClient>;
type JsonRecord = Record<string, unknown>;

class ReviewValidationError extends Error {}

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

function normalizeEmail(value: unknown) {
  return cleanText(value).toLowerCase();
}

function clientEmailValues(client: JsonRecord) {
  return [
    normalizeEmail(client.client_email),
    normalizeEmail(client.client_email_secondary),
    normalizeEmail(client.client_email_tertiary),
  ].filter(Boolean);
}

function clientMatchesEmail(client: JsonRecord, email: string) {
  const normalized = normalizeEmail(email);
  if (!normalized) return false;
  return clientEmailValues(client).includes(normalized);
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
  return auth.match(/^Bearer\s+(.+)$/i)?.[1] ?? "";
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    value,
  );
}

function hasOwn(body: JsonRecord, key: string) {
  return Object.prototype.hasOwnProperty.call(body, key);
}

function firstPresent(body: JsonRecord, keys: string[]) {
  for (const key of keys) {
    if (hasOwn(body, key)) return body[key];
  }
  return undefined;
}

function parseDateTime(value: unknown, fallbackToNow = false) {
  const text = cleanText(value);
  if (!text) return fallbackToNow ? new Date().toISOString() : null;
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) {
    throw new ReviewValidationError(`Invalid date: ${text}`);
  }
  return date.toISOString();
}

function metadataRecord(value: unknown) {
  return value && typeof value === "object" ? (value as JsonRecord) : {};
}

function boundedInteger(value: unknown, fallback: number, min: number, max: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.round(parsed)));
}

function addDaysFromDateIso(value: string, days: number) {
  const date = new Date(value);
  date.setUTCDate(date.getUTCDate() + days);
  date.setUTCHours(0, 0, 0, 0);
  return date.toISOString();
}

async function nextContactFromCompanySetting(
  supabase: SupabaseClient,
  companyId: string,
  lastContactAt: string | null,
) {
  if (!lastContactAt) return null;
  const { data, error } = await supabase
    .from("company_settings")
    .select("metadata")
    .eq("company_id", companyId)
    .maybeSingle();
  if (error) throw error;
  const metadata = metadataRecord(data?.metadata);
  if (metadata.contact_touch_sets_next_contact !== true) return null;
  return addDaysFromDateIso(
    lastContactAt,
    boundedInteger(metadata.contact_touch_next_contact_days, 4, 0, 365),
  );
}

function compactObject(value: JsonRecord) {
  return Object.fromEntries(
    Object.entries(value).filter(([, item]) => item !== undefined && item !== ""),
  );
}

function isManualMatch(matchedBy: string) {
  return matchedBy === "manual_client_id" || matchedBy === "manual_legacy_client_id";
}

function changedFields(before: JsonRecord, after: JsonRecord) {
  return Object.keys(after).filter((key) => {
    const beforeValue = before[key] ?? null;
    const afterValue = after[key] ?? null;
    return beforeValue !== afterValue;
  });
}

function getPayload(event: JsonRecord) {
  return event.payload && typeof event.payload === "object"
    ? (event.payload as JsonRecord)
    : {};
}

function getMetadata(event: JsonRecord) {
  return event.metadata && typeof event.metadata === "object"
    ? (event.metadata as JsonRecord)
    : {};
}

async function assertCanReviewIntegrations(
  supabase: SupabaseClient,
  userEmail: string,
  companyId: string,
) {
  const superAdminEmails = parseAllowlist(
    Deno.env.get("SUPER_ADMIN_EMAILS") ??
      Deno.env.get("VITE_SUPER_ADMIN_EMAILS"),
  );
  if (superAdminEmails.has(userEmail)) return "super_admin";

  const { data, error } = await supabase
    .from("company_members")
    .select("id, role, status")
    .eq("company_id", companyId)
    .ilike("email", userEmail)
    .maybeSingle();
  if (error) throw error;
  if (
    data?.status === "active" &&
    (data.role === "director" || data.role === "support")
  ) {
    return data.role as string;
  }
  throw new ReviewValidationError(
    "You do not have permission to review integration events.",
  );
}

async function resolveCompany(supabase: SupabaseClient, rawCompanyId: string) {
  const { data, error } = await supabase
    .from("companies")
    .select("id, legacy_glide_row_id, name, migration_status")
    .eq("legacy_glide_row_id", rawCompanyId)
    .in("migration_status", ["pilot", "migrated"])
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function loadReviewEvent(
  supabase: SupabaseClient,
  companyId: string,
  eventId: string,
) {
  const { data, error } = await supabase
    .from("integration_intake_events")
    .select("*")
    .eq("id", eventId)
    .eq("company_id", companyId)
    .in("status", ["needs_review", "failed"])
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new ReviewValidationError("Review event is not open.");
  return data as JsonRecord;
}

async function findClientForEvent(
  supabase: SupabaseClient,
  companyId: string,
  event: JsonRecord,
  manualClientId: string | null,
) {
  const payload = getPayload(event);
  const metadata = getMetadata(event);
  const clientSelect = [
    "id",
    "company_id",
    "glide_row_id",
    "client_name",
    "client_email",
    "client_email_secondary",
    "client_email_tertiary",
    "program_status_value",
    "next_steps_value",
    "csm_date_of_last_contact",
    "csm_date_of_next_contact",
    "offer_milestones_current_offer_id",
    "csm_team_member_id",
    "archived_at",
  ].join(", ");

  if (manualClientId) {
    let query = supabase
      .from("clients")
      .select(clientSelect)
      .eq("company_id", companyId)
      .is("archived_at", null);
    query = isUuid(manualClientId)
      ? query.eq("id", manualClientId)
      : query.eq("glide_row_id", manualClientId);
    const { data, error } = await query
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new ReviewValidationError("Selected client is not active.");
    return {
      client: data as JsonRecord,
      matchedBy: isUuid(manualClientId)
        ? "manual_client_id"
        : "manual_legacy_client_id",
    };
  }

  const clientEmail = normalizeEmail(
    metadata.client_email ??
      payload.client_email ??
      payload.clientEmail ??
      payload.email,
  );
  const requestedClientId = cleanText(payload.client_id) || cleanText(payload.clientId);

  if (requestedClientId) {
    const { data, error } = await supabase
      .from("clients")
      .select(clientSelect)
      .eq("company_id", companyId)
      .eq("id", requestedClientId)
      .is("archived_at", null);
    if (error) throw error;
    const rows = clientEmail
      ? (data ?? []).filter(
          (client) => clientMatchesEmail(client, clientEmail),
        )
      : data ?? [];
    if (rows.length === 1) {
      return { client: rows[0] as JsonRecord, matchedBy: "client_id" };
    }
  }

  if (!clientEmail) {
    throw new ReviewValidationError("This event has no client email to retry.");
  }

  const { data, error } = await supabase
    .from("clients")
    .select(clientSelect)
    .eq("company_id", companyId)
    .or(
      [
        `client_email.ilike.${clientEmail.replaceAll(",", "")}`,
        `client_email_secondary.ilike.${clientEmail.replaceAll(",", "")}`,
        `client_email_tertiary.ilike.${clientEmail.replaceAll(",", "")}`,
      ].join(","),
    )
    .is("archived_at", null);
  if (error) throw error;

  const rows = (data ?? []).filter((client) =>
    ACTIVE_PROGRAM_STATUSES.has(
      String(client.program_status_value ?? "").trim().toLowerCase(),
    ) && clientMatchesEmail(client, clientEmail),
  );
  if (rows.length !== 1) {
    const matchStatus = rows.length > 1 ? "ambiguous" : "unmatched";
    const errorMessage =
      matchStatus === "ambiguous"
        ? "Multiple matching active clients were found for this email."
        : "No active client matched this email.";
    await supabase
      .from("integration_intake_events")
      .update({
        status: "needs_review",
        match_status: matchStatus,
        error_message: errorMessage,
        metadata: {
          ...metadata,
          retry_checked_at: new Date().toISOString(),
          active_matches: rows.length,
          total_matches: (data ?? []).length,
        },
      })
      .eq("id", event.id);
    throw new ReviewValidationError(errorMessage);
  }

  return { client: rows[0] as JsonRecord, matchedBy: "client_email" };
}

async function resolveAssignableMember(
  supabase: SupabaseClient,
  companyId: string,
  value: unknown,
) {
  const requested = cleanText(value);
  if (!requested) return null;

  const { data, error } = await supabase
    .from("company_members")
    .select("id, legacy_glide_row_id, email, name, status, hide_from_csm_list")
    .eq("company_id", companyId)
    .eq("status", "active");
  if (error) throw error;

  const normalizedRequested = requested.toLowerCase();
  const member = data?.find((candidate) =>
    candidate.id === requested ||
    candidate.legacy_glide_row_id === requested ||
    (candidate.email ?? "").toLowerCase() === normalizedRequested
  );

  if (!member || member.hide_from_csm_list === true) {
    throw new ReviewValidationError(
      "Assigned CSM is not an active client manager.",
    );
  }

  return {
    value: member.legacy_glide_row_id ?? member.id,
    member,
  };
}

async function resolveOffer(
  supabase: SupabaseClient,
  companyId: string,
  value: unknown,
) {
  const requested = cleanText(value);
  if (!requested) return null;

  const { data, error } = await supabase
    .from("company_offers")
    .select("glide_row_id, name, status")
    .eq("company_id", companyId)
    .eq("glide_row_id", requested)
    .eq("status", "active")
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new ReviewValidationError("Offer ID is not active for this company.");
  return data;
}

async function applyCallSummary(
  supabase: SupabaseClient,
  company: JsonRecord,
  event: JsonRecord,
  client: JsonRecord,
  matchedBy: string,
  actorEmail: string,
) {
  const payload = getPayload(event);
  const metadata = getMetadata(event);
  const provider = cleanText(event.provider) || "integration";
  const externalEventId = nullableText(event.external_event_id);
  const summary =
    cleanText(payload.summary) ||
    cleanText(payload.notes) ||
    cleanText(payload.next_steps) ||
    cleanText(payload.nextSteps);
  if (!summary) {
    throw new ReviewValidationError("This call summary event has no summary to apply.");
  }

  const startedAt = parseDateTime(
    payload.started_at ??
      payload.startedAt ??
      payload.timestamp ??
      payload.call_timestamp ??
      metadata.started_at,
    false,
  );
  const previousNextSteps = client.next_steps_value ?? null;
  const previousLastContact = client.csm_date_of_last_contact ?? null;
  const previousNextContact = client.csm_date_of_next_contact ?? null;
  const recordingUrl =
    nullableText(payload.recording_url) ??
    nullableText(payload.recordingUrl) ??
    nullableText(payload.url);
  const clientUpdates: JsonRecord = { next_steps_value: summary };
  if (startedAt) clientUpdates.csm_date_of_last_contact = startedAt;
  const nextContactAt = await nextContactFromCompanySetting(
    supabase,
    String(company.id),
    startedAt,
  );
  if (nextContactAt) clientUpdates.csm_date_of_next_contact = nextContactAt;

  const { data: updatedClient, error: updateClientError } = await supabase
    .from("clients")
    .update(clientUpdates)
    .eq("id", client.id)
    .select("*")
    .single();
  if (updateClientError) throw updateClientError;

  const { data: historyEvent, error: historyError } = await supabase
    .from("client_history_events")
    .insert({
      company_id: company.id,
      legacy_client_glide_row_id: client.glide_row_id,
      event_type: "call_summary_webhook",
      source: provider,
      title: `Call summary added for ${client.client_name ?? "client"}`,
      summary,
      next_steps: summary,
      last_contact_at: startedAt,
      next_contact_at: nextContactAt,
      notes: summary,
      metadata: {
        integration_intake_event_id: event.id,
        provider,
        external_event_id: externalEventId,
        client_email:
          metadata.client_email ??
          payload.client_email ??
          payload.clientEmail ??
          payload.email,
        recording_url: recordingUrl,
        title: nullableText(payload.title) ?? nullableText(metadata.title),
        previous_next_steps: previousNextSteps,
        previous_last_contact_at: previousLastContact,
        previous_next_contact_at: previousNextContact,
        reviewed_by: actorEmail,
        reviewed_action: isManualMatch(matchedBy) ? "manual_match" : "retry_apply",
      },
      payload: {
        integration_type: "call_summary_next_steps",
        recording_url: recordingUrl,
        title: nullableText(payload.title) ?? nullableText(metadata.title),
        started_at: startedAt,
        raw_payload: payload,
      },
    })
    .select("*")
    .single();
  if (historyError) throw historyError;

  const { data: processedEvent, error: processedError } = await supabase
    .from("integration_intake_events")
    .update({
      status: "processed",
      match_status: "matched",
      matched_client_id: client.id,
      matched_legacy_client_glide_row_id: client.glide_row_id,
      matched_by: matchedBy,
      error_message: null,
      processed_at: new Date().toISOString(),
      metadata: {
        ...metadata,
        history_event_id: historyEvent.id,
        previous_next_steps: previousNextSteps,
        previous_last_contact_at: previousLastContact,
        previous_next_contact_at: previousNextContact,
        reviewed_by: actorEmail,
        reviewed_at: new Date().toISOString(),
        review_action: isManualMatch(matchedBy) ? "manual_match" : "retry_apply",
      },
    })
    .eq("id", event.id)
    .select("*")
    .single();
  if (processedError) throw processedError;

  await supabase.from("app_audit_events").insert({
    company_id: company.id,
    event_type: "call_summary_next_steps_reviewed",
    source: provider,
    entity_table: "clients",
    entity_id: client.id,
    legacy_glide_row_id: client.glide_row_id,
    title: "Integration review event applied",
    summary: `Updated next steps for ${client.client_name ?? "client"}.`,
    before_data: {
      next_steps_value: previousNextSteps,
      csm_date_of_last_contact: previousLastContact,
      csm_date_of_next_contact: previousNextContact,
    },
    after_data: {
      next_steps_value: updatedClient.next_steps_value,
      csm_date_of_last_contact: updatedClient.csm_date_of_last_contact,
      csm_date_of_next_contact: updatedClient.csm_date_of_next_contact,
    },
    metadata: {
      integration_intake_event_id: processedEvent.id,
      history_event_id: historyEvent.id,
      provider,
      external_event_id: externalEventId,
      reviewed_by: actorEmail,
      matched_by: matchedBy,
    },
  });

  return { event: processedEvent, historyEvent, client: updatedClient };
}

async function applyClientUpdate(
  supabase: SupabaseClient,
  company: JsonRecord,
  event: JsonRecord,
  client: JsonRecord,
  matchedBy: string,
  actorEmail: string,
) {
  const payload = getPayload(event);
  const metadata = getMetadata(event);
  const provider = cleanText(event.provider) || "integration";
  const externalEventId = nullableText(event.external_event_id);
  const clientUpdates: JsonRecord = {};
  const historyPayload: JsonRecord = {};
  const notes = nullableText(firstPresent(payload, ["notes", "note"]));

  if (firstPresent(payload, ["next_steps", "nextSteps"]) !== undefined) {
    clientUpdates.next_steps_value = nullableText(
      firstPresent(payload, ["next_steps", "nextSteps"]),
    );
    historyPayload.next_steps = clientUpdates.next_steps_value;
  }

  const hasLastContactUpdate =
    firstPresent(payload, ["last_contact", "lastContact", "last_contact_at"]) !==
    undefined;
  const hasNextContactUpdate =
    firstPresent(payload, ["next_contact", "nextContact", "next_contact_at"]) !==
    undefined;

  if (hasLastContactUpdate) {
    clientUpdates.csm_date_of_last_contact = parseDateTime(
      firstPresent(payload, ["last_contact", "lastContact", "last_contact_at"]),
      false,
    );
    historyPayload.last_contact_at = clientUpdates.csm_date_of_last_contact;
  }

  if (hasNextContactUpdate) {
    clientUpdates.csm_date_of_next_contact = parseDateTime(
      firstPresent(payload, ["next_contact", "nextContact", "next_contact_at"]),
      false,
    );
    historyPayload.next_contact_at = clientUpdates.csm_date_of_next_contact;
  } else if (hasLastContactUpdate) {
    const nextContactAt = await nextContactFromCompanySetting(
      supabase,
      String(company.id),
      (clientUpdates.csm_date_of_last_contact as string | null) ?? null,
    );
    if (nextContactAt) {
      clientUpdates.csm_date_of_next_contact = nextContactAt;
      historyPayload.next_contact_at = nextContactAt;
    }
  }

  if (firstPresent(payload, ["offer_id", "offerId"]) !== undefined) {
    const offer = await resolveOffer(
      supabase,
      company.id,
      firstPresent(payload, ["offer_id", "offerId"]),
    );
    clientUpdates.offer_milestones_current_offer_id = offer?.glide_row_id ?? null;
  }

  if (
    firstPresent(payload, ["assigned_to", "assignedTo", "csm_email", "csmEmail"]) !==
      undefined
  ) {
    const assignment = await resolveAssignableMember(
      supabase,
      company.id,
      firstPresent(payload, ["assigned_to", "assignedTo", "csm_email", "csmEmail"]),
    );
    clientUpdates.csm_team_member_id = assignment?.value ?? null;
  }

  if (
    payload.status !== undefined ||
    payload.program !== undefined ||
    payload.program_status !== undefined
  ) {
    throw new ReviewValidationError(
      "status/program updates are intentionally not enabled in Client Update Webhook V1.",
    );
  }

  const changedClientFields = changedFields(client, clientUpdates);
  if (!notes && changedClientFields.length === 0) {
    throw new ReviewValidationError("No supported client update fields changed.");
  }

  const beforeData = Object.fromEntries(
    CLIENT_UPDATE_FIELDS.map((key) => [key, client[key] ?? null]),
  );
  const { data: updatedClient, error: updateClientError } =
    changedClientFields.length > 0
      ? await supabase
          .from("clients")
          .update(clientUpdates)
          .eq("id", client.id)
          .select("*")
          .single()
      : { data: client, error: null };
  if (updateClientError) throw updateClientError;

  const { data: historyEvent, error: historyError } = await supabase
    .from("client_history_events")
    .insert({
      company_id: company.id,
      legacy_client_glide_row_id: client.glide_row_id,
      event_type: "client_update_webhook",
      source: provider,
      title: `Webhook update for ${client.client_name ?? "client"}`,
      summary:
        notes ??
        `Updated ${changedClientFields.join(", ")} from integration review.`,
      notes,
      ...historyPayload,
      metadata: {
        integration_intake_event_id: event.id,
        provider,
        external_event_id: externalEventId,
        changed_client_fields: changedClientFields,
        reviewed_by: actorEmail,
        reviewed_action: isManualMatch(matchedBy) ? "manual_match" : "retry_apply",
      },
      payload: {
        integration_type: "client_update",
        raw_payload: payload,
        normalized_updates: clientUpdates,
      },
    })
    .select("*")
    .single();
  if (historyError) throw historyError;

  const { data: processedEvent, error: processedError } = await supabase
    .from("integration_intake_events")
    .update({
      status: "processed",
      match_status: "matched",
      matched_client_id: client.id,
      matched_legacy_client_glide_row_id: client.glide_row_id,
      matched_by: matchedBy,
      error_message: null,
      processed_at: new Date().toISOString(),
      metadata: {
        ...metadata,
        history_event_id: historyEvent.id,
        changed_client_fields: changedClientFields,
        reviewed_by: actorEmail,
        reviewed_at: new Date().toISOString(),
        review_action: isManualMatch(matchedBy) ? "manual_match" : "retry_apply",
      },
    })
    .eq("id", event.id)
    .select("*")
    .single();
  if (processedError) throw processedError;

  await supabase.from("app_audit_events").insert({
    company_id: company.id,
    event_type: "client_update_webhook_reviewed",
    source: provider,
    entity_table: "clients",
    entity_id: client.id,
    legacy_glide_row_id: client.glide_row_id,
    title: "Integration review event applied",
    summary: `Updated ${client.client_name ?? "client"} from review queue.`,
    before_data: beforeData,
    after_data: {
      ...Object.fromEntries(
        CLIENT_UPDATE_FIELDS.map((key) => [key, updatedClient[key] ?? null]),
      ),
    },
    metadata: {
      integration_intake_event_id: processedEvent.id,
      history_event_id: historyEvent.id,
      provider,
      external_event_id: externalEventId,
      reviewed_by: actorEmail,
      matched_by: matchedBy,
    },
  });

  return {
    event: processedEvent,
    historyEvent,
    client: updatedClient,
    changedFields: changedClientFields,
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
      return jsonResponse({ error: "Missing Supabase configuration." }, 500);
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });
    const token = getBearerToken(req);
    if (!token) return jsonResponse({ error: "Missing authorization." }, 401);

    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    if (userError || !userData.user?.email) {
      return jsonResponse({ error: "Invalid session." }, 401);
    }

    const body = (await req.json().catch(() => ({}))) as JsonRecord;
    const action = cleanText(body.action);
    const companyLegacyId = cleanText(body.companyLegacyId);
    const eventId = cleanText(body.eventId);
    const clientId = nullableText(body.clientId);

    if (!ACTIONS.has(action)) {
      return jsonResponse({ error: "Choose a valid review action." }, 400);
    }
    if (!companyLegacyId || !eventId) {
      return jsonResponse({ error: "Missing company or event id." }, 400);
    }

    const company = await resolveCompany(supabase, companyLegacyId);
    if (!company) {
      return jsonResponse(
        { error: "Integration review is available for app-owned companies only." },
        400,
      );
    }

    const actorEmail = normalizeEmail(userData.user.email);
    await assertCanReviewIntegrations(supabase, actorEmail, company.id);
    const event = await loadReviewEvent(supabase, company.id, eventId);

    if (action === "ignore") {
      const { data: ignoredEvent, error: ignoreError } = await supabase
        .from("integration_intake_events")
        .update({
          status: "ignored",
          error_message: null,
          processed_at: new Date().toISOString(),
          metadata: {
            ...getMetadata(event),
            reviewed_by: actorEmail,
            reviewed_at: new Date().toISOString(),
            review_action: "ignored",
          },
        })
        .eq("id", event.id)
        .select("*")
        .single();
      if (ignoreError) throw ignoreError;
      return jsonResponse({ ok: true, event: ignoredEvent });
    }

    const { client, matchedBy } = await findClientForEvent(
      supabase,
      company.id,
      event,
      action === "match" ? clientId : null,
    );

    if (String(event.integration_type) === "call_summary_next_steps") {
      const result = await applyCallSummary(
        supabase,
        company,
        event,
        client,
        matchedBy,
        actorEmail,
      );
      return jsonResponse({ ok: true, ...result });
    }

    if (String(event.integration_type) === "client_update") {
      const result = await applyClientUpdate(
        supabase,
        company,
        event,
        client,
        matchedBy,
        actorEmail,
      );
      return jsonResponse({ ok: true, ...result });
    }

    throw new ReviewValidationError(
      "This integration type is stored for review but cannot be retried yet.",
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    return jsonResponse(
      { error: message },
      error instanceof ReviewValidationError ? 400 : 500,
    );
  }
});
