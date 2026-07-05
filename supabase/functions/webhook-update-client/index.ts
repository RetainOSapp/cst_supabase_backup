/// <reference path="../_shared/deno.d.ts" />

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-webhook-secret, x-retainos-integration-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const CLIENT_UPDATE_FIELDS = [
  "next_steps_value",
  "csm_date_of_last_contact",
  "csm_date_of_next_contact",
  "offer_milestones_current_offer_id",
  "secondary_offer_milestones_current_offer_id",
  "secondary_offer_milestones_current_milestone_id",
  "secondary_offer_milestones_current_milestone_change_date",
  "csm_team_member_id",
] as const;

type SupabaseClient = ReturnType<typeof createClient>;
type JsonRecord = Record<string, unknown>;
type IntegrationSecretValidationResult =
  | {
      ok: true;
      authMode: "company_integration_token" | "global_secret_fallback";
      tokenId: string | null;
      tokenPrefix: string | null;
    }
  | {
      ok: false;
      error: string;
      status: number;
    };

class RequestValidationError extends Error {}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

function describeError(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  if (error && typeof error === "object") {
    const record = error as Record<string, unknown>;
    const parts = [
      record.message,
      record.details,
      record.hint,
      record.code ? `code: ${record.code}` : null,
    ]
      .filter(Boolean)
      .map(String);

    if (parts.length > 0) return parts.join(" | ");

    try {
      return JSON.stringify(record);
    } catch {
      return "Unexpected object error";
    }
  }
  return "Unexpected error";
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

function normalizeProvider(value: unknown) {
  return cleanText(value).toLowerCase().replace(/[^a-z0-9_-]/g, "_") || "unknown";
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

function getWebhookSecret(req: Request) {
  const bearer = (req.headers.get("Authorization") ?? "").match(/^Bearer\s+(.+)$/i)
    ?.[1];
  return (
    bearer ??
    req.headers.get("x-retainos-integration-token") ??
    req.headers.get("x-webhook-secret") ??
    ""
  );
}

function getClientIp(req: Request) {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("cf-connecting-ip") ??
    null
  );
}

function timingSafeEqual(left: string, right: string) {
  if (left.length !== right.length) return false;
  let mismatch = 0;
  for (let index = 0; index < left.length; index += 1) {
    mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return mismatch === 0;
}

async function sha256Hex(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function parseDateTime(value: unknown) {
  if (value === null) return null;
  const text = cleanText(value);
  if (!text) return null;
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) {
    throw new RequestValidationError(`Invalid date: ${text}`);
  }
  return date.toISOString();
}

function compactObject(value: JsonRecord) {
  return Object.fromEntries(
    Object.entries(value).filter(([, item]) => item !== undefined && item !== ""),
  );
}

function changedFields(before: JsonRecord, after: JsonRecord) {
  return Object.keys(after).filter((key) => {
    const beforeValue = before[key] ?? null;
    const afterValue = after[key] ?? null;
    return beforeValue !== afterValue;
  });
}

function parseCustomFieldValue(field: JsonRecord, value: unknown) {
  const fieldType = cleanText(field.field_type) || "text";
  const options = Array.isArray(field.options) ? (field.options as JsonRecord[]) : [];
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
      throw new RequestValidationError(`${field.label ?? "Custom field"} must be yes or no.`);
    }
    const bool = raw === "true" || raw === "yes" || raw === "1";
    return { valueText: String(bool), valueJson: bool };
  }

  if (fieldType === "number") {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
      throw new RequestValidationError(`${field.label ?? "Custom field"} must be a number.`);
    }
    return { valueText: String(numeric), valueJson: numeric };
  }

  if (fieldType === "date") {
    const raw = cleanText(value);
    const date = new Date(raw);
    if (!raw || Number.isNaN(date.getTime())) {
      throw new RequestValidationError(`${field.label ?? "Custom field"} must be a valid date.`);
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
          throw new RequestValidationError(`${field.label ?? "Custom field"} has an unsupported option.`);
        }
      }
    }
    return { valueText: values.join(", "), valueJson: values };
  }

  const text = cleanText(value);
  if (fieldType === "single_select" && text && optionValues.size > 0) {
    if (!optionValues.has(text.toLowerCase())) {
      throw new RequestValidationError(`${field.label ?? "Custom field"} has an unsupported option.`);
    }
  }
  return { valueText: text || null, valueJson: text || null };
}

async function resolveCompany(supabase: SupabaseClient, rawCompanyId: string) {
  const query = supabase
    .from("companies")
    .select("id, legacy_glide_row_id, name, migration_status")
    .in("migration_status", ["pilot", "migrated"]);

  const { data, error } = isUuid(rawCompanyId)
    ? await query.eq("id", rawCompanyId).maybeSingle()
    : await query.eq("legacy_glide_row_id", rawCompanyId).maybeSingle();

  if (error) throw error;
  return data;
}

async function validateCompanyIntegrationSecret(
  supabase: SupabaseClient,
  companyId: string,
  integrationType: string,
  submittedSecret: string,
  fallbackSecret: string | undefined,
  clientIp: string | null,
): Promise<IntegrationSecretValidationResult> {
  const { data, error } = await supabase
    .from("company_integration_secrets")
    .select("id, token_hash, token_prefix, expires_at")
    .eq("company_id", companyId)
    .eq("integration_type", integrationType)
    .eq("status", "active");

  if (error) throw error;

  const activeSecrets = data ?? [];
  if (activeSecrets.length > 0) {
    const submittedHash = submittedSecret ? await sha256Hex(submittedSecret) : "";
    const matchingSecret = activeSecrets.find((secret) => {
      if (!secret.token_hash) return false;
      const expiresAt = secret.expires_at ? new Date(secret.expires_at) : null;
      if (expiresAt && expiresAt.getTime() <= Date.now()) return false;
      return timingSafeEqual(String(secret.token_hash), submittedHash);
    });

    if (!matchingSecret) {
      return {
        ok: false,
        error: "Invalid company integration token.",
        status: 401,
      };
    }

    await supabase
      .from("company_integration_secrets")
      .update({
        last_used_at: new Date().toISOString(),
        last_used_from: clientIp,
      })
      .eq("id", matchingSecret.id);

    return {
      ok: true,
      authMode: "company_integration_token",
      tokenId: matchingSecret.id,
      tokenPrefix: matchingSecret.token_prefix ?? null,
    };
  }

  if (fallbackSecret && submittedSecret === fallbackSecret) {
    return {
      ok: true,
      authMode: "global_secret_fallback",
      tokenId: null,
      tokenPrefix: null,
    };
  }

  return {
    ok: false,
    error: fallbackSecret
      ? "Invalid webhook secret."
      : "Company integration token is not configured.",
    status: 401,
  };
}

async function upsertIntakeEvent(
  supabase: SupabaseClient,
  payload: JsonRecord,
  externalEventId: string | null,
) {
  if (externalEventId) {
    const { data: existing, error: existingError } = await supabase
      .from("integration_intake_events")
      .select("*")
      .eq("company_id", payload.company_id)
      .eq("integration_type", payload.integration_type)
      .eq("provider", payload.provider)
      .eq("external_event_id", externalEventId)
      .maybeSingle();
    if (existingError) throw existingError;
    if (existing) return existing;

    const { data, error } = await supabase
      .from("integration_intake_events")
      .insert(payload)
      .select("*")
      .single();
    if (error) throw error;
    return data;
  }

  const { data, error } = await supabase
    .from("integration_intake_events")
    .insert(payload)
    .select("*")
    .single();
  if (error) throw error;
  return data;
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
    throw new RequestValidationError("Assigned CSM is not an active client manager.");
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
  if (!data) throw new RequestValidationError("Pathway ID is not active for this company.");

  return data;
}

async function resolveOfferMilestone(
  supabase: SupabaseClient,
  companyId: string,
  offerId: string,
  value: unknown,
) {
  const requested = cleanText(value);
  if (!requested) return null;

  const { data, error } = await supabase
    .from("company_offer_milestones")
    .select("glide_row_id, name, status")
    .eq("company_id", companyId)
    .eq("offer_id", offerId)
    .eq("glide_row_id", requested)
    .eq("status", "active")
    .maybeSingle();
  if (error) throw error;
  if (!data) {
    throw new RequestValidationError(
      "Secondary milestone ID is not active for the selected secondary pathway.",
    );
  }

  return data;
}

async function assertSecondaryPathwaysEnabled(
  supabase: SupabaseClient,
  companyId: string,
) {
  const { data, error } = await supabase
    .from("company_settings")
    .select("enable_secondary_offers")
    .eq("company_id", companyId)
    .maybeSingle();
  if (error) throw error;
  if (data?.enable_secondary_offers !== true) {
    throw new RequestValidationError(
      "Secondary Pathway must be enabled in company settings first.",
    );
  }
}

async function prepareCustomFieldUpdates(
  supabase: SupabaseClient,
  companyId: string,
  clientLegacyId: string,
  customFields: unknown,
) {
  const rows = Array.isArray(customFields)
    ? customFields
    : customFields && typeof customFields === "object"
      ? Object.entries(customFields as JsonRecord).map(([key, value]) => ({ key, value }))
      : [];
  const requested = rows
    .map((row) => (row && typeof row === "object" ? (row as JsonRecord) : null))
    .filter((row): row is JsonRecord =>
      Boolean(row && (cleanText(row.id) || cleanText(row.key))),
    );

  if (requested.length === 0) return { changes: [], upserts: [] };

  const ids = [...new Set(requested.map((row) => cleanText(row.id)).filter(Boolean))];
  const keys = [...new Set(requested.map((row) => cleanText(row.key)).filter(Boolean))];
  const { data: allDefinitions, error: definitionsError } = await supabase
    .from("company_custom_fields")
    .select("id, key, label, field_type, options")
    .eq("company_id", companyId)
    .eq("entity_type", "client")
    .eq("status", "active");
  if (definitionsError) throw definitionsError;
  const definitions = ((allDefinitions ?? []) as JsonRecord[]).filter(
    (row) => ids.includes(String(row.id)) || keys.includes(String(row.key)),
  );

  const definitionById = new Map(
    ((definitions ?? []) as JsonRecord[]).map((row) => [String(row.id), row]),
  );
  const definitionByKey = new Map(
    ((definitions ?? []) as JsonRecord[]).map((row) => [String(row.key), row]),
  );
  const definitionIds = [...definitionById.keys()];

  const { data: existing, error: existingError } = definitionIds.length > 0
    ? await supabase
        .from("client_custom_field_values")
        .select("custom_field_id, value_text, value_json")
        .eq("company_id", companyId)
        .eq("client_id", clientLegacyId)
        .in("custom_field_id", definitionIds)
    : { data: [], error: null };

  if (existingError) throw existingError;
  const existingById = new Map(
    ((existing ?? []) as JsonRecord[]).map((row) => [
      String(row.custom_field_id),
      row,
    ]),
  );

  const changes: JsonRecord[] = [];
  const upserts: JsonRecord[] = [];

  for (const item of requested) {
    const definition =
      definitionById.get(cleanText(item.id)) ?? definitionByKey.get(cleanText(item.key));
    if (!definition) throw new RequestValidationError("A custom field is not enabled for this company.");
    const parsed = parseCustomFieldValue(definition, item.value);
    const id = String(definition.id);
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
        updated_from: "client_update_webhook",
      },
    });
  }

  return { changes, upserts };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  let supabase: SupabaseClient | null = null;
  let storedIntakeEvent: JsonRecord | null = null;

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

    supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });

    const body = (await req.json().catch(() => ({}))) as JsonRecord;
    const rawCompanyId =
      cleanText(body.company_id) ||
      cleanText(body.companyId) ||
      cleanText(body.companyGlideId) ||
      cleanText(body.company_glide_id);
    if (!rawCompanyId) {
      return jsonResponse({ error: "company_id is required." }, 400);
    }

    const provider = normalizeProvider(body.provider ?? "zapier");
    const company = await resolveCompany(supabase, rawCompanyId);
    if (!company) {
      return jsonResponse(
        {
          error:
            "Company is not enabled for RetainOS client update webhooks. Check company_id.",
        },
        400,
      );
    }

    const submittedSecret = getWebhookSecret(req);
    const fallbackSecret =
      Deno.env.get("CLIENT_UPDATE_WEBHOOK_SECRET") ??
      Deno.env.get("WEBHOOK_UPDATE_CLIENT_SECRET");
    const authResult = await validateCompanyIntegrationSecret(
      supabase,
      company.id,
      "client_update",
      submittedSecret,
      fallbackSecret,
      getClientIp(req),
    );
    if (!authResult.ok) {
      return jsonResponse({ error: authResult.error }, authResult.status);
    }

    const externalEventId =
      nullableText(body.external_event_id) ??
      nullableText(body.externalEventId) ??
      nullableText(body.event_id) ??
      nullableText(body.eventId) ??
      nullableText(body.zapier_id) ??
      nullableText(body.zapierId);
    const clientEmail = normalizeEmail(
      body.client_email ?? body.clientEmail ?? body.email,
    );
    const requestedClientId =
      cleanText(body.client_id) || cleanText(body.clientId);

    if (!clientEmail && !requestedClientId) {
      return jsonResponse(
        { error: "client_email or client_id is required." },
        400,
      );
    }
    if (requestedClientId && !isUuid(requestedClientId)) {
      return jsonResponse(
        { error: "client_id must be the app-owned RetainOS client UUID." },
        400,
      );
    }

    const intakePayload = {
      company_id: company.id,
      legacy_company_glide_row_id: company.legacy_glide_row_id,
      integration_type: "client_update",
      provider,
      external_event_id: externalEventId,
      status: "received",
      match_status: "unmatched",
      payload: body,
      metadata: compactObject({
        client_email: clientEmail,
        requested_client_id: requestedClientId,
        auth_mode: authResult.authMode,
        integration_secret_id: authResult.tokenId,
        integration_secret_prefix: authResult.tokenPrefix,
      }),
    };

    const intakeEvent = await upsertIntakeEvent(
      supabase,
      intakePayload,
      externalEventId,
    );
    storedIntakeEvent = intakeEvent as JsonRecord | null;

    if (!intakeEvent) {
      return jsonResponse(
        { error: "Unable to store integration intake event." },
        500,
      );
    }

    if (intakeEvent.status === "processed") {
      return jsonResponse({
        ok: true,
        duplicate: true,
        event: intakeEvent,
      });
    }

    const clientSelect = [
      "id",
      "company_id",
      "glide_row_id",
      "client_name",
      "client_email",
      "client_email_secondary",
      "client_email_tertiary",
      "next_steps_value",
      "csm_date_of_last_contact",
      "csm_date_of_next_contact",
      "offer_milestones_current_offer_id",
      "secondary_offer_milestones_current_offer_id",
      "secondary_offer_milestones_current_milestone_id",
      "secondary_offer_milestones_current_milestone_change_date",
      "csm_team_member_id",
      "archived_at",
    ].join(", ");

    const { data: clientRows, error: clientError } = requestedClientId
      ? await supabase
          .from("clients")
          .select(clientSelect)
          .eq("company_id", company.id)
          .eq("id", requestedClientId)
          .is("archived_at", null)
      : await supabase
          .from("clients")
          .select(clientSelect)
          .eq("company_id", company.id)
          .or(
            [
              `client_email.ilike.${clientEmail.replaceAll(",", "")}`,
              `client_email_secondary.ilike.${clientEmail.replaceAll(",", "")}`,
              `client_email_tertiary.ilike.${clientEmail.replaceAll(",", "")}`,
            ].join(","),
          )
          .is("archived_at", null);

    if (clientError) throw clientError;

    const emailSafeRows = requestedClientId && clientEmail
      ? (clientRows ?? []).filter(
          (client) => clientMatchesEmail(client, clientEmail),
        )
      : clientRows ?? [];

    if (emailSafeRows.length !== 1) {
      const matchStatus = emailSafeRows.length > 1 ? "ambiguous" : "unmatched";
      const errorMessage =
        matchStatus === "ambiguous"
          ? "Multiple matching app-owned clients were found."
          : "No app-owned client matched this request.";

      const { data: failedEvent, error: updateError } = await supabase
        .from("integration_intake_events")
        .update({
          status: "needs_review",
          match_status: matchStatus,
          error_message: errorMessage,
          metadata: {
            ...(intakeEvent.metadata ?? {}),
            total_matches: (clientRows ?? []).length,
            safe_matches: emailSafeRows.length,
          },
        })
        .eq("id", intakeEvent.id)
        .select("*")
        .single();
      if (updateError) throw updateError;

      return jsonResponse(
        {
          ok: false,
          needsReview: true,
          error: errorMessage,
          event: failedEvent,
        },
        202,
      );
    }

    const client = emailSafeRows[0] as JsonRecord;
    const clientUpdates: JsonRecord = {};
    const historyPayload: JsonRecord = {};
    const metadataUpdates: JsonRecord = {};
    const notes = nullableText(firstPresent(body, ["notes", "note"]));

    if (firstPresent(body, ["next_steps", "nextSteps"]) !== undefined) {
      clientUpdates.next_steps_value = nullableText(
        firstPresent(body, ["next_steps", "nextSteps"]),
      );
      historyPayload.next_steps = clientUpdates.next_steps_value;
    }

    if (firstPresent(body, ["last_contact", "lastContact", "last_contact_at"]) !== undefined) {
      clientUpdates.csm_date_of_last_contact = parseDateTime(
        firstPresent(body, ["last_contact", "lastContact", "last_contact_at"]),
      );
      historyPayload.last_contact_at = clientUpdates.csm_date_of_last_contact;
    }

    if (firstPresent(body, ["next_contact", "nextContact", "next_contact_at"]) !== undefined) {
      clientUpdates.csm_date_of_next_contact = parseDateTime(
        firstPresent(body, ["next_contact", "nextContact", "next_contact_at"]),
      );
      historyPayload.next_contact_at = clientUpdates.csm_date_of_next_contact;
    }

    if (firstPresent(body, ["pathway_id", "pathwayId", "offer_id", "offerId"]) !== undefined) {
      const offer = await resolveOffer(
        supabase,
        company.id,
        firstPresent(body, ["pathway_id", "pathwayId", "offer_id", "offerId"]),
      );
      clientUpdates.offer_milestones_current_offer_id = offer?.glide_row_id ?? null;
      metadataUpdates.offer = offer;
    }

    const secondaryOfferValue = firstPresent(body, [
      "secondary_pathway_id",
      "secondaryPathwayId",
      "secondary_offer_id",
      "secondaryOfferId",
      "secondary_pathway_offer_id",
      "secondaryPathwayOfferId",
    ]);
    const secondaryMilestoneValue = firstPresent(body, [
      "secondary_milestone_id",
      "secondaryMilestoneId",
      "secondary_pathway_milestone_id",
      "secondaryPathwayMilestoneId",
    ]);
    const hasSecondaryOffer = Boolean(cleanText(secondaryOfferValue));
    const hasSecondaryMilestone = Boolean(cleanText(secondaryMilestoneValue));
    if (hasSecondaryOffer || hasSecondaryMilestone) {
      if (!hasSecondaryOffer) {
        throw new RequestValidationError(
          "Secondary milestone requires secondary_pathway_id.",
        );
      }
      await assertSecondaryPathwaysEnabled(supabase, company.id);
      const secondaryOffer = await resolveOffer(
        supabase,
        company.id,
        secondaryOfferValue,
      );
      if (!secondaryOffer) {
        throw new RequestValidationError("Choose a secondary pathway first.");
      }
      const secondaryMilestone = hasSecondaryMilestone
        ? await resolveOfferMilestone(
            supabase,
            company.id,
            secondaryOffer.glide_row_id,
            secondaryMilestoneValue,
          )
        : null;
      clientUpdates.secondary_offer_milestones_current_offer_id =
        secondaryOffer.glide_row_id;
      clientUpdates.secondary_offer_milestones_current_milestone_id =
        secondaryMilestone?.glide_row_id ?? null;
      clientUpdates.secondary_offer_milestones_current_milestone_change_date =
        new Date().toISOString();
      metadataUpdates.secondary_pathway = {
        offer_id: secondaryOffer.glide_row_id,
        offer_name: secondaryOffer.name,
        milestone_id: secondaryMilestone?.glide_row_id ?? null,
        milestone_name: secondaryMilestone?.name ?? null,
      };
    }

    if (firstPresent(body, ["assigned_to", "assignedTo", "csm_email", "csmEmail"]) !== undefined) {
      const assignment = await resolveAssignableMember(
        supabase,
        company.id,
        firstPresent(body, ["assigned_to", "assignedTo", "csm_email", "csmEmail"]),
      );
      clientUpdates.csm_team_member_id = assignment?.value ?? null;
      metadataUpdates.assigned_to = assignment?.member ?? null;
    }

    if (body.status !== undefined || body.program !== undefined || body.program_status !== undefined) {
      throw new RequestValidationError(
        "status/program updates are intentionally not enabled in Client Update Webhook V1. Use the RetainOS status flow.",
      );
    }

    const customFieldUpdates = await prepareCustomFieldUpdates(
      supabase,
      company.id,
      String(client.glide_row_id),
      body.custom_fields ?? body.customFields,
    );

    const changedClientFields = changedFields(client, clientUpdates);
    if (!notes && changedClientFields.length === 0 && customFieldUpdates.changes.length === 0) {
      throw new RequestValidationError("No supported client update fields changed.");
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

    if (customFieldUpdates.upserts.length > 0) {
      const { error: customFieldsError } = await supabase
        .from("client_custom_field_values")
        .upsert(customFieldUpdates.upserts, {
          onConflict: "company_id,client_id,custom_field_id",
        });
      if (customFieldsError) throw customFieldsError;
    }

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
          `Updated ${[
            ...changedClientFields,
            ...customFieldUpdates.changes.map((field) => `custom:${field.key}`),
          ].join(", ")}.`,
        notes,
        ...historyPayload,
        metadata: {
          integration_intake_event_id: intakeEvent.id,
          provider,
          external_event_id: externalEventId,
          changed_client_fields: changedClientFields,
          custom_fields: customFieldUpdates.changes,
          updates: metadataUpdates,
        },
        payload: {
          integration_type: "client_update",
          raw_payload: body,
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
        matched_by: requestedClientId ? "client_id" : "client_email",
        error_message: null,
        processed_at: new Date().toISOString(),
        metadata: {
          ...(intakeEvent.metadata ?? {}),
          history_event_id: historyEvent.id,
          changed_client_fields: changedClientFields,
          custom_fields: customFieldUpdates.changes,
        },
      })
      .eq("id", intakeEvent.id)
      .select("*")
      .single();
    if (processedError) throw processedError;

    await supabase.from("app_audit_events").insert({
      company_id: company.id,
      event_type: "client_update_webhook_processed",
      source: provider,
      entity_table: "clients",
      entity_id: client.id,
      legacy_glide_row_id: client.glide_row_id,
      title: "Client update webhook processed",
      summary: `Updated ${client.client_name ?? clientEmail ?? client.id}.`,
      before_data: beforeData,
      after_data: {
        ...Object.fromEntries(
          CLIENT_UPDATE_FIELDS.map((key) => [key, updatedClient[key] ?? null]),
        ),
        custom_fields: customFieldUpdates.changes,
      },
      metadata: {
        integration_intake_event_id: processedEvent.id,
        history_event_id: historyEvent.id,
        provider,
        external_event_id: externalEventId,
      },
    });

    return jsonResponse({
      ok: true,
      event: processedEvent,
      historyEvent,
      client: updatedClient,
      changedFields: changedClientFields,
      customFields: customFieldUpdates.changes,
    });
  } catch (error) {
    const message = describeError(error);
    if (supabase && storedIntakeEvent?.id) {
      await supabase
        .from("integration_intake_events")
        .update({
          status: "failed",
          error_message: message,
        })
        .eq("id", storedIntakeEvent.id);
    }
    return jsonResponse(
      { error: message },
      error instanceof RequestValidationError ? 400 : 500,
    );
  }
});
