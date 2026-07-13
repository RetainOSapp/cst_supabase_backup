/// <reference path="../_shared/deno.d.ts" />

import {
  AuthError,
  createServiceClient,
  getBearerToken,
  isRegisteredSuperAdmin,
  requireAuthenticatedActor,
  type AuthenticatedActor,
  type SupabaseServiceClient,
} from "../_shared/auth.ts";
import {
  jsonResponse as sharedJsonResponse,
  optionsResponse,
} from "../_shared/http.ts";

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
// Hosted Supabase Edge workers stop after at most 400 seconds. This buffer
// ensures an abandoned operator claim is safe to return to review.
const REVIEW_CLAIM_STALE_AFTER_MS = 30 * 60 * 1000;

type SupabaseClient = SupabaseServiceClient;
type JsonRecord = Record<string, unknown>;

class ReviewValidationError extends Error {}

function jsonResponse(req: Request, body: unknown, status = 200) {
  return sharedJsonResponse(req, body, status);
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

function hasIlikeWildcard(value: string) {
  return ["\\", "%", "_", "*"].some((character) => value.includes(character));
}

function normalizeEmailList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return [
      ...new Set(
        value
          .flatMap((item) => normalizeEmailList(item))
          .filter((email) => email.includes("@")),
      ),
    ].slice(0, 25);
  }
  const text = normalizeEmail(value);
  if (!text) return [];
  return [
    ...new Set(
      text
        .split(/[;,\n]/)
        .map((item) => item.trim())
        .filter((email) => email.includes("@")),
    ),
  ].slice(0, 25);
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

function clientMatchesAnyEmail(client: JsonRecord, emails: string[]) {
  const submitted = new Set(emails.map(normalizeEmail).filter(Boolean));
  return clientEmailValues(client).some((email) => submitted.has(email));
}

function eventClientEmails(event: JsonRecord) {
  const payload = getPayload(event);
  const metadata = getMetadata(event);
  return normalizeEmailList(
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

function eventClientEmail(event: JsonRecord) {
  return eventClientEmails(event)[0] ?? "";
}

async function findClientsByEmail(
  supabase: SupabaseClient,
  companyId: string,
  clientSelect: string,
  email: string,
) {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) return [];

  const results = await Promise.all(
    ["client_email", "client_email_secondary", "client_email_tertiary"].map(
      (column) => {
        let query = supabase
          .from("clients")
          .select(clientSelect)
          .eq("company_id", companyId);
        query = hasIlikeWildcard(normalizedEmail)
          ? query.eq(column, normalizedEmail)
          : query.ilike(column, normalizedEmail);
        return query.is("archived_at", null);
      },
    ),
  );
  const clients = new Map<string, JsonRecord>();

  for (const result of results) {
    if (result.error) throw result.error;
    for (const row of result.data ?? []) {
      const client = row as JsonRecord;
      if (clientMatchesEmail(client, normalizedEmail)) {
        clients.set(String(client.id), client);
      }
    }
  }
  return [...clients.values()];
}

async function findClientsByEmails(
  supabase: SupabaseClient,
  companyId: string,
  clientSelect: string,
  emails: string[],
) {
  const matches = await Promise.all(
    emails.slice(0, 25).map((email) =>
      findClientsByEmail(supabase, companyId, clientSelect, email)
    ),
  );
  const clients = new Map<string, JsonRecord>();
  for (const rows of matches) {
    for (const client of rows) clients.set(String(client.id), client);
  }
  return [...clients.values()];
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

function pickPayloadFields(body: JsonRecord, keys: string[]) {
  const picked: JsonRecord = {};
  for (const key of keys) {
    if (hasOwn(body, key)) picked[key] = body[key];
  }
  return picked;
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

async function learnClientEmailFromManualMatch(
  supabase: SupabaseClient,
  company: JsonRecord,
  event: JsonRecord,
  client: JsonRecord,
  matchedBy: string,
  actorEmail: string,
) {
  if (!isManualMatch(matchedBy)) return null;

  const submittedEmails = eventClientEmails(event);
  if (submittedEmails.length !== 1) return null;
  const learnedEmail = submittedEmails[0];
  if (!learnedEmail || clientMatchesEmail(client, learnedEmail)) return null;

  const updateColumn =
    !normalizeEmail(client.client_email_secondary)
      ? "client_email_secondary"
      : !normalizeEmail(client.client_email_tertiary)
        ? "client_email_tertiary"
        : null;

  if (!updateColumn) return null;

  const { data: updatedClient, error } = await supabase
    .from("clients")
    .update({ [updateColumn]: learnedEmail })
    .eq("id", client.id)
    .select("id, client_email_secondary, client_email_tertiary")
    .single();
  if (error) throw error;

  await supabase.from("app_audit_events").insert({
    company_id: company.id,
    event_type: "client_alternate_email_learned",
    source: cleanText(event.provider) || "integration",
    entity_table: "clients",
    entity_id: client.id,
    legacy_glide_row_id: client.glide_row_id,
    title: "Alternate client email learned from manual integration match",
    summary: `Added ${learnedEmail} to ${client.client_name ?? "client"} after manual Call AI match.`,
    before_data: {
      client_email_secondary: client.client_email_secondary ?? null,
      client_email_tertiary: client.client_email_tertiary ?? null,
    },
    after_data: {
      client_email_secondary: updatedClient.client_email_secondary ?? null,
      client_email_tertiary: updatedClient.client_email_tertiary ?? null,
    },
    metadata: {
      integration_intake_event_id: event.id,
      learned_email: learnedEmail,
      updated_column: updateColumn,
      reviewed_by: actorEmail,
      matched_by: matchedBy,
    },
  });

  client[updateColumn] = learnedEmail;
  return { email: learnedEmail, column: updateColumn };
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
  actor: AuthenticatedActor,
  companyId: string,
) {
  if (await isRegisteredSuperAdmin(supabase, actor)) return "super_admin";

  const { data: uuidMembership, error: uuidMembershipError } = await supabase
    .from("company_members")
    .select("id, role, status")
    .eq("company_id", companyId)
    .eq("auth_user_id", actor.id)
    .maybeSingle();
  if (uuidMembershipError) throw uuidMembershipError;

  let membership = uuidMembership;
  if (!membership) {
    const { data: emailMembership, error: emailMembershipError } = await supabase
      .from("company_members")
      .select("id, role, status")
      .eq("company_id", companyId)
      .ilike("email", normalizeEmail(actor.email))
      .maybeSingle();
    if (emailMembershipError) throw emailMembershipError;
    membership = emailMembership;
  }

  if (membership?.status === "active" && membership.role === "director") {
    return membership.role as string;
  }
  throw new AuthError(
    "You do not have permission to review integration events.",
    403,
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
    .in("status", ["needs_review", "failed", "received"])
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new ReviewValidationError("Review event is not open.");
  if (data.status === "received") {
    const updatedAt = new Date(String(data.updated_at ?? ""));
    if (
      Number.isNaN(updatedAt.getTime()) ||
      Date.now() - updatedAt.getTime() < REVIEW_CLAIM_STALE_AFTER_MS
    ) {
      throw new ReviewValidationError("This event is already being reviewed.");
    }
    const { data: recovered, error: recoverError } = await supabase
      .from("integration_intake_events")
      .update({
        status: "failed",
        error_message: "A previous review attempt did not finish.",
        metadata: {
          ...getMetadata(data as JsonRecord),
          review_claim_recovered_at: new Date().toISOString(),
        },
      })
      .eq("id", data.id)
      .eq("status", "received")
      .eq("updated_at", data.updated_at)
      .select("*")
      .maybeSingle();
    if (recoverError) throw recoverError;
    if (!recovered) {
      throw new ReviewValidationError("This event is already being reviewed.");
    }
    return recovered as JsonRecord;
  }
  return data as JsonRecord;
}

async function claimReviewEvent(
  supabase: SupabaseClient,
  event: JsonRecord,
  action: string,
  actorEmail: string,
) {
  const { data, error } = await supabase
    .from("integration_intake_events")
    .update({
      status: "received",
      error_message: null,
      metadata: {
        ...getMetadata(event),
        review_claimed_at: new Date().toISOString(),
        review_claimed_by: actorEmail,
        review_claimed_action: action,
      },
    })
    .eq("id", event.id)
    .eq("status", event.status)
    .eq("updated_at", event.updated_at)
    .select("*")
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new ReviewValidationError("This event is already being reviewed.");
  return data as JsonRecord;
}

function reviewClaimVersion(event: JsonRecord) {
  // The database-generated updated_at value is the claim version. Every event
  // transition must still own this exact version, so an older worker cannot
  // close or fail a claim recovered by a newer operator.
  const updatedAt = cleanText(event.updated_at);
  if (!updatedAt) {
    throw new ReviewValidationError("This review claim has no ownership version.");
  }
  return updatedAt;
}

async function assertReviewClaimOwnership(
  supabase: SupabaseClient,
  event: JsonRecord,
) {
  const { data, error } = await supabase
    .from("integration_intake_events")
    .select("id")
    .eq("id", event.id)
    .eq("status", "received")
    .eq("updated_at", reviewClaimVersion(event))
    .maybeSingle();
  if (error) throw error;
  if (!data) {
    throw new ReviewValidationError("This review claim is no longer active.");
  }
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

  const clientEmails = eventClientEmails(event);
  const clientEmail = clientEmails[0] ?? "";
  const requestedClientId = cleanText(payload.client_id) || cleanText(payload.clientId);

  if (requestedClientId) {
    const { data, error } = await supabase
      .from("clients")
      .select(clientSelect)
      .eq("company_id", companyId)
      .eq("id", requestedClientId)
      .is("archived_at", null);
    if (error) throw error;
    const rows = clientEmails.length > 0
      ? (data ?? []).filter(
          (client) => clientMatchesAnyEmail(client, clientEmails),
        )
      : data ?? [];
    if (rows.length === 1) {
      return { client: rows[0] as JsonRecord, matchedBy: "client_id" };
    }
  }

  if (!clientEmail) {
    throw new ReviewValidationError("This event has no client email to retry.");
  }

  const emailMatches = await findClientsByEmails(
    supabase,
    companyId,
    clientSelect,
    clientEmails,
  );
  const rows = emailMatches.filter((client) =>
    ACTIVE_PROGRAM_STATUSES.has(
      String(client.program_status_value ?? "").trim().toLowerCase(),
    ),
  );
  if (rows.length !== 1) {
    const matchStatus = rows.length > 1 ? "ambiguous" : "unmatched";
    const errorMessage =
      matchStatus === "ambiguous"
        ? "Multiple matching active clients were found for this email."
        : "No active client matched this email.";
    const { data: reviewEvent, error: reviewError } = await supabase
      .from("integration_intake_events")
      .update({
        status: "needs_review",
        match_status: matchStatus,
        error_message: errorMessage,
        metadata: {
          ...metadata,
          retry_checked_at: new Date().toISOString(),
          submitted_client_emails: clientEmails,
          active_matches: rows.length,
          total_matches: emailMatches.length,
        },
      })
      .eq("id", event.id)
      .eq("status", "received")
      .eq("updated_at", reviewClaimVersion(event))
      .select("id")
      .maybeSingle();
    if (reviewError) throw reviewError;
    if (!reviewEvent) {
      throw new ReviewValidationError("This review claim is no longer active.");
    }
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
  await assertReviewClaimOwnership(supabase, event);

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
  const { data: existingHistory, error: existingHistoryError } = await supabase
    .from("client_history_events")
    .select("*")
    .eq("company_id", company.id)
    .eq("legacy_client_glide_row_id", client.glide_row_id)
    .eq("event_type", "call_summary_webhook")
    .eq("metadata->>integration_intake_event_id", String(event.id))
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (existingHistoryError) throw existingHistoryError;
  const existingHistoryMetadata = getMetadata((existingHistory ?? {}) as JsonRecord);
  const processingCheckpoint = metadataRecord(metadata.processing_checkpoint);
  const previousNextSteps = existingHistory
    ? (existingHistoryMetadata.previous_next_steps ?? null)
    : (processingCheckpoint.previous_next_steps ?? client.next_steps_value ?? null);
  const previousLastContact = existingHistory
    ? (existingHistoryMetadata.previous_last_contact_at ?? null)
    : (processingCheckpoint.previous_last_contact_at ??
      client.csm_date_of_last_contact ??
      null);
  const previousNextContact = existingHistory
    ? (existingHistoryMetadata.previous_next_contact_at ?? null)
    : (processingCheckpoint.previous_next_contact_at ??
      client.csm_date_of_next_contact ??
      null);
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

  let historyEvent = existingHistory as JsonRecord | null;
  if (!historyEvent) {
    const { data, error: historyError } = await supabase
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
          client_email: eventClientEmail(event),
          submitted_client_emails: eventClientEmails(event),
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
          submitted_payload: pickPayloadFields(payload, [
            "provider",
            "external_event_id",
            "externalEventId",
            "external_call_id",
            "externalCallId",
            "call_id",
            "callId",
            "recording_url",
            "recordingUrl",
            "url",
            "title",
          ]),
          recording_url: recordingUrl,
          title: nullableText(payload.title) ?? nullableText(metadata.title),
          started_at: startedAt,
        },
      })
      .select("*")
      .single();
    if (historyError) throw historyError;
    historyEvent = data as JsonRecord;
  }

  const { data: existingAttendance, error: existingAttendanceError } = await supabase
    .from("client_call_attendance_events")
    .select("*")
    .eq("company_id", company.id)
    .eq("client_id", client.id)
    .eq("integration_intake_event_id", event.id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (existingAttendanceError) throw existingAttendanceError;
  let callAttendanceEvent = existingAttendance as JsonRecord | null;
  if (!callAttendanceEvent) {
    const { data, error: attendanceError } = await supabase
      .from("client_call_attendance_events")
      .insert({
        company_id: company.id,
        client_id: client.id,
        client_legacy_id: client.glide_row_id,
        company_legacy_id: company.legacy_glide_row_id,
        attendance_status: "attended",
        occurred_at: startedAt ?? new Date().toISOString(),
        source: provider,
        notes: summary,
        history_event_id: historyEvent.id,
        integration_intake_event_id: event.id,
        metadata: {
          provider,
          external_event_id: externalEventId,
          client_email: eventClientEmail(event),
          submitted_client_emails: eventClientEmails(event),
          reviewed_by: actorEmail,
          auto_recorded_from: "integration_review",
        },
      })
      .select("*")
      .single();
    if (attendanceError) throw attendanceError;
    callAttendanceEvent = data as JsonRecord;
  }

  const { data: existingAudit, error: existingAuditError } = await supabase
    .from("app_audit_events")
    .select("id")
    .eq("company_id", company.id)
    .eq("legacy_glide_row_id", client.glide_row_id)
    .in("event_type", [
      "call_summary_next_steps_processed",
      "call_summary_next_steps_reviewed",
    ])
    .eq("metadata->>integration_intake_event_id", String(event.id))
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (existingAuditError) throw existingAuditError;
  if (!existingAudit) {
    const { error: auditError } = await supabase.from("app_audit_events").insert({
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
        integration_intake_event_id: event.id,
        history_event_id: historyEvent.id,
        call_attendance_event_id: callAttendanceEvent.id,
        provider,
        external_event_id: externalEventId,
        reviewed_by: actorEmail,
        matched_by: matchedBy,
      },
    });
    if (auditError) throw auditError;
  }

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
        ...getMetadata(event),
        history_event_id: historyEvent.id,
        call_attendance_event_id: callAttendanceEvent.id,
        previous_next_steps: previousNextSteps,
        previous_last_contact_at: previousLastContact,
        previous_next_contact_at: previousNextContact,
        reviewed_by: actorEmail,
        reviewed_at: new Date().toISOString(),
        review_action: isManualMatch(matchedBy) ? "manual_match" : "retry_apply",
      },
    })
    .eq("id", event.id)
    .eq("status", "received")
    .eq("updated_at", reviewClaimVersion(event))
    .select("*")
    .single();
  if (processedError) throw processedError;

  return {
    event: processedEvent,
    historyEvent,
    callAttendanceEvent,
    client: updatedClient,
  };
}

async function applyClientUpdate(
  supabase: SupabaseClient,
  company: JsonRecord,
  event: JsonRecord,
  client: JsonRecord,
  matchedBy: string,
  actorEmail: string,
) {
  await assertReviewClaimOwnership(supabase, event);

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

  const hasLastContactUpdate = firstPresent(payload, [
    "last_contact",
    "lastContact",
    "last_contact_at",
    "lastContactAt",
  ]) !== undefined;
  const hasNextContactUpdate = firstPresent(payload, [
    "next_contact",
    "nextContact",
    "next_contact_at",
    "nextContactAt",
  ]) !== undefined;

  if (hasLastContactUpdate) {
    clientUpdates.csm_date_of_last_contact = parseDateTime(
      firstPresent(payload, [
        "last_contact",
        "lastContact",
        "last_contact_at",
        "lastContactAt",
      ]),
      false,
    );
    historyPayload.last_contact_at = clientUpdates.csm_date_of_last_contact;
  }

  if (hasNextContactUpdate) {
    clientUpdates.csm_date_of_next_contact = parseDateTime(
      firstPresent(payload, [
        "next_contact",
        "nextContact",
        "next_contact_at",
        "nextContactAt",
      ]),
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

  if (
    firstPresent(payload, ["pathway_id", "pathwayId", "offer_id", "offerId"]) !==
      undefined
  ) {
    const offer = await resolveOffer(
      supabase,
      String(company.id),
      firstPresent(payload, ["pathway_id", "pathwayId", "offer_id", "offerId"]),
    );
    clientUpdates.offer_milestones_current_offer_id = offer?.glide_row_id ?? null;
  }

  if (
    firstPresent(payload, ["assigned_to", "assignedTo", "csm_email", "csmEmail"]) !==
      undefined
  ) {
    const assignment = await resolveAssignableMember(
      supabase,
      String(company.id),
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
        submitted_payload: pickPayloadFields(payload, [
          "external_event_id",
          "externalEventId",
          "provider",
          "client_id",
          "clientId",
          "client_email",
          "clientEmail",
          "email",
        ]),
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
    .eq("status", "received")
    .eq("updated_at", reviewClaimVersion(event))
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
    return optionsResponse(req);
  }
  if (req.method !== "POST") {
    return jsonResponse(req, { error: "Method not allowed" }, 405);
  }

  let supabase: SupabaseClient | null = null;
  let claimedReviewEventId: string | null = null;
  let claimedReviewEventVersion: string | null = null;

  try {
    supabase = createServiceClient();
    const token = getBearerToken(req);
    const actor = await requireAuthenticatedActor(supabase, token);

    const body = (await req.json().catch(() => ({}))) as JsonRecord;
    const action = cleanText(body.action);
    const companyLegacyId = cleanText(body.companyLegacyId);
    const eventId = cleanText(body.eventId);
    const clientId = nullableText(body.clientId);

    if (!ACTIONS.has(action)) {
      return jsonResponse(req, { error: "Choose a valid review action." }, 400);
    }
    if (!companyLegacyId || !eventId) {
      return jsonResponse(req, { error: "Missing company or event id." }, 400);
    }

    const company = await resolveCompany(supabase, companyLegacyId);
    if (!company) {
      return jsonResponse(
        req,
        { error: "Integration review is available for app-owned companies only." },
        400,
      );
    }

    const actorEmail = normalizeEmail(actor.email);
    await assertCanReviewIntegrations(supabase, actor, company.id);
    let event = await loadReviewEvent(supabase, company.id, eventId);
    event = await claimReviewEvent(supabase, event, action, actorEmail);
    claimedReviewEventId = String(event.id);
    claimedReviewEventVersion = reviewClaimVersion(event);
    await assertReviewClaimOwnership(supabase, event);

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
        .eq("status", "received")
        .eq("updated_at", reviewClaimVersion(event))
        .select("*")
        .single();
      if (ignoreError) throw ignoreError;
      return jsonResponse(req, { ok: true, event: ignoredEvent });
    }

    const { client, matchedBy } = await findClientForEvent(
      supabase,
      company.id,
      event,
      action === "match" ? clientId : null,
    );
    const learnedEmail = await learnClientEmailFromManualMatch(
      supabase,
      company,
      event,
      client,
      matchedBy,
      actorEmail,
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
      return jsonResponse(req, { ok: true, learnedEmail, ...result });
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
      return jsonResponse(req, { ok: true, learnedEmail, ...result });
    }

    throw new ReviewValidationError(
      "This integration type is stored for review but cannot be retried yet.",
    );
  } catch (error) {
    console.error(error);
    const isValidationError = error instanceof ReviewValidationError;
    const isAuthError = error instanceof AuthError;
    const message = isValidationError || isAuthError
      ? error.message
      : "Unexpected integration review error.";
    if (supabase && claimedReviewEventId && claimedReviewEventVersion) {
      await supabase
        .from("integration_intake_events")
        .update({
          status: "failed",
          error_message: message,
        })
        .eq("id", claimedReviewEventId)
        .eq("status", "received")
        .eq("updated_at", claimedReviewEventVersion);
    }
    return jsonResponse(
      req,
      { error: message },
      isAuthError ? error.status : isValidationError ? 400 : 500,
    );
  }
});
