/// <reference path="../_shared/deno.d.ts" />

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-webhook-secret, x-retainos-integration-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const ACTIVE_PROGRAM_STATUSES = new Set(["front-end", "back-end", "paused", "suspended"]);

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

function normalizeEmailList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return [
      ...new Set(
        value
          .flatMap((item) => normalizeEmailList(item))
          .filter((email) => email.includes("@")),
      ),
    ];
  }

  const text = normalizeEmail(value);
  if (!text) return [];
  return [
    ...new Set(
      text
        .split(/[\s,;]+/)
        .map((item) => item.trim())
        .filter((email) => email.includes("@")),
    ),
  ];
}

function clientEmailValues(client: Record<string, unknown>) {
  return [
    normalizeEmail(client.client_email),
    normalizeEmail(client.client_email_secondary),
    normalizeEmail(client.client_email_tertiary),
  ].filter(Boolean);
}

function clientMatchesAnyEmail(
  client: Record<string, unknown>,
  submittedEmails: string[],
) {
  const submitted = new Set(submittedEmails.map((email) => normalizeEmail(email)));
  return clientEmailValues(client).some((email) => submitted.has(email));
}

function matchedClientEmail(
  client: Record<string, unknown>,
  submittedEmails: string[],
) {
  const submitted = new Set(submittedEmails.map((email) => normalizeEmail(email)));
  return clientEmailValues(client).find((email) => submitted.has(email)) ?? "";
}

function normalizeProvider(value: unknown) {
  return cleanText(value).toLowerCase().replace(/[^a-z0-9_-]/g, "_") || "unknown";
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

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    value,
  );
}

function parseDateTime(value: unknown) {
  const text = cleanText(value);
  if (!text) return new Date().toISOString();
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

function metadataRecord(value: unknown) {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
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
  supabase: ReturnType<typeof createClient>,
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

function compactObject(value: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(value).filter(([, item]) => item !== undefined && item !== ""),
  );
}

async function resolveCompany(
  supabase: ReturnType<typeof createClient>,
  rawCompanyId: string,
) {
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
  supabase: ReturnType<typeof createClient>,
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
  supabase: ReturnType<typeof createClient>,
  payload: Record<string, unknown>,
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

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const submittedSecret = getWebhookSecret(req);
    const fallbackSecret =
      Deno.env.get("CALL_SUMMARY_WEBHOOK_SECRET") ??
      Deno.env.get("CLIENT_CALL_SUMMARY_WEBHOOK_SECRET");
    const rawCompanyId =
      cleanText(body.company_id) ||
      cleanText(body.companyId) ||
      cleanText(body.companyGlideId) ||
      cleanText(body.company_glide_id);
    const clientEmails = normalizeEmailList(
      body.client_email ??
        body.clientEmail ??
        body.email ??
        body.attendee_emails ??
        body.attendeeEmails ??
        body.invitee_emails ??
        body.inviteeEmails,
    );
    const clientEmail = clientEmails[0] ?? "";
    const summary =
      cleanText(body.summary) ||
      cleanText(body.notes) ||
      cleanText(body.next_steps) ||
      cleanText(body.nextSteps);
    const provider = normalizeProvider(body.provider ?? "fathom");
    const externalEventId =
      nullableText(body.external_event_id) ??
      nullableText(body.externalEventId) ??
      nullableText(body.external_call_id) ??
      nullableText(body.externalCallId) ??
      nullableText(body.call_id) ??
      nullableText(body.callId);
    const startedAt = parseDateTime(
      body.started_at ?? body.startedAt ?? body.timestamp ?? body.call_timestamp,
    );

    if (!rawCompanyId) {
      return jsonResponse({ error: "company_id is required." }, 400);
    }
    if (clientEmails.length === 0) {
      return jsonResponse(
        { error: "client_email or attendee_emails is required." },
        400,
      );
    }
    if (!summary) {
      return jsonResponse({ error: "summary or notes is required." }, 400);
    }

    const company = await resolveCompany(supabase, rawCompanyId);
    if (!company) {
      return jsonResponse(
        {
          error:
            "Company is not enabled for RetainOS summary webhooks. Check company_id.",
        },
        400,
      );
    }

    const authResult = await validateCompanyIntegrationSecret(
      supabase,
      company.id,
      "call_summary_next_steps",
      submittedSecret,
      fallbackSecret,
      getClientIp(req),
    );
    if (!authResult.ok) {
      return jsonResponse({ error: authResult.error }, authResult.status);
    }

    const intakePayload = {
      company_id: company.id,
      legacy_company_glide_row_id: company.legacy_glide_row_id,
      integration_type: "call_summary_next_steps",
      provider,
      external_event_id: externalEventId,
      status: "received",
      match_status: "unmatched",
      payload: body,
      metadata: compactObject({
        client_email: clientEmail,
        client_emails: clientEmails.length > 1 ? clientEmails : undefined,
        started_at: startedAt,
        recording_url: nullableText(body.recording_url) ?? nullableText(body.url),
        title: nullableText(body.title),
        auth_mode: authResult.authMode,
        integration_secret_id: authResult.tokenId,
        integration_token_prefix: authResult.tokenPrefix,
      }),
    };

    const intakeEvent = await upsertIntakeEvent(
      supabase,
      intakePayload,
      externalEventId,
    );

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

    let clientQuery = supabase
        .from("clients")
        .select(
          "id, glide_row_id, client_name, client_email, client_email_secondary, client_email_tertiary, program_status_value, next_steps_value, csm_date_of_last_contact, csm_date_of_next_contact",
        )
      .eq("company_id", company.id);

    const emailClauses = clientEmails.flatMap((email) => {
      const safeEmail = email.replaceAll(",", "");
      return [
        `client_email.ilike.${safeEmail}`,
        `client_email_secondary.ilike.${safeEmail}`,
        `client_email_tertiary.ilike.${safeEmail}`,
      ];
    });
    clientQuery = clientQuery.or(emailClauses.join(","));

    const { data: clientRows, error: clientError } = await clientQuery;

    if (clientError) throw clientError;

    const activeClients = (clientRows ?? []).filter(
      (client) =>
        ACTIVE_PROGRAM_STATUSES.has(
          String(client.program_status_value ?? "").trim().toLowerCase(),
        ) && clientMatchesAnyEmail(client, clientEmails),
    );

    if (activeClients.length !== 1) {
      const matchStatus =
        activeClients.length > 1 || (clientRows ?? []).length > 1
          ? "ambiguous"
          : "unmatched";
      const errorMessage =
        matchStatus === "ambiguous"
          ? "Multiple matching active clients were found for this email."
          : "No active client matched this email.";

      const { data: failedEvent, error: updateError } = await supabase
        .from("integration_intake_events")
        .update({
          status: "needs_review",
          match_status: matchStatus,
          error_message: errorMessage,
          metadata: {
            ...(intakeEvent.metadata ?? {}),
            total_matches: (clientRows ?? []).length,
            active_matches: activeClients.length,
            submitted_client_emails: clientEmails,
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

    const client = activeClients[0];
    const matchedEmail = matchedClientEmail(client, clientEmails) || clientEmail;
    const previousNextSteps = client.next_steps_value ?? null;
    const previousLastContact = client.csm_date_of_last_contact ?? null;
    const previousNextContact = client.csm_date_of_next_contact ?? null;
    const nextContactAt = await nextContactFromCompanySetting(
      supabase,
      company.id,
      startedAt,
    );

    const { data: updatedClient, error: updateClientError } = await supabase
      .from("clients")
      .update({
        next_steps_value: summary,
        csm_date_of_last_contact: startedAt,
        ...(nextContactAt ? { csm_date_of_next_contact: nextContactAt } : {}),
      })
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
          integration_intake_event_id: intakeEvent.id,
          provider,
          external_event_id: externalEventId,
          client_email: matchedEmail,
          submitted_client_emails: clientEmails,
          recording_url: nullableText(body.recording_url) ?? nullableText(body.url),
          title: nullableText(body.title),
          previous_next_steps: previousNextSteps,
          previous_last_contact_at: previousLastContact,
          previous_next_contact_at: previousNextContact,
        },
        payload: {
          integration_type: "call_summary_next_steps",
          raw_payload: body,
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
        matched_by: "client_email",
        error_message: null,
        processed_at: new Date().toISOString(),
        metadata: {
          ...(intakeEvent.metadata ?? {}),
          history_event_id: historyEvent.id,
          previous_next_steps: previousNextSteps,
          previous_last_contact_at: previousLastContact,
          previous_next_contact_at: previousNextContact,
        },
      })
      .eq("id", intakeEvent.id)
      .select("*")
      .single();
    if (processedError) throw processedError;

    await supabase.from("app_audit_events").insert({
      company_id: company.id,
      event_type: "call_summary_next_steps_processed",
      source: provider,
      entity_table: "clients",
      entity_id: client.id,
      legacy_glide_row_id: client.glide_row_id,
      title: "Client call summary processed",
      summary: `Updated next steps for ${client.client_name ?? clientEmail}.`,
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
      },
    });

    return jsonResponse({
      ok: true,
      event: processedEvent,
      historyEvent,
      client: updatedClient,
    });
  } catch (error) {
    const message = describeError(error);
    return jsonResponse({ error: message }, 500);
  }
});
