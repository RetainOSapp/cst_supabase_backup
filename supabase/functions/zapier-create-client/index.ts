/// <reference path="../_shared/deno.d.ts" />

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-webhook-secret, x-retainos-integration-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

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

function cleanText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function nullableText(value: unknown) {
  const text = cleanText(value);
  return text || null;
}

function firstNullableText(...values: unknown[]) {
  for (const value of values) {
    const text = nullableText(value);
    if (text) return text;
  }
  return null;
}

function nullableNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const text = cleanText(value);
  if (!text) return null;
  const number = Number(text.replace(/[$,\s]/g, ""));
  return Number.isFinite(number) ? number : null;
}

function normalizeDate(value: unknown) {
  const text = cleanText(value);
  if (!text) return null;
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function daysBetween(startIso: string | null, endIso: string | null) {
  if (!startIso || !endIso) return null;
  const start = new Date(startIso);
  const end = new Date(endIso);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
  return Math.max(
    0,
    Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)),
  );
}

function addDaysIso(value: string | null, days: number) {
  const base = value ? new Date(value) : new Date();
  if (Number.isNaN(base.getTime())) return new Date().toISOString();
  base.setDate(base.getDate() + days);
  return base.toISOString();
}

async function resolveTemplateAssignee(
  supabase: ReturnType<typeof createClient>,
  companyId: string,
  template: Record<string, unknown>,
  client: Record<string, unknown>,
) {
  const assignToType = String(template.assign_to_type ?? "assigned_csm");
  if (assignToType === "assigned_csm") {
    return (client.csm_team_member_id as string | null | undefined) ?? null;
  }
  if (assignToType === "specific_member") {
    return (template.assigned_member_legacy_id as string | null | undefined) ?? null;
  }
  if (assignToType === "unassigned") return null;
  if (assignToType === "director" || assignToType === "support") {
    const { data, error } = await supabase
      .from("company_members")
      .select("legacy_glide_row_id")
      .eq("company_id", companyId)
      .eq("role", assignToType)
      .eq("status", "active")
      .order("name", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return (data?.legacy_glide_row_id as string | null | undefined) ?? null;
  }
  return null;
}

async function createTasksFromClientTemplates({
  supabase,
  company,
  client,
  source,
}: {
  supabase: ReturnType<typeof createClient>;
  company: { id: string; legacy_glide_row_id: string | null };
  client: Record<string, unknown>;
  source: string;
}) {
  const { data: templates, error } = await supabase
    .from("company_task_templates")
    .select("*")
    .eq("company_id", company.id)
    .eq("trigger_type", "client_created")
    .eq("is_enabled", true)
    .is("archived_at", null)
    .order("position", { ascending: true });
  if (error) throw error;

  const matchingTemplates = ((templates ?? []) as Record<string, unknown>[]).filter(
    (template) =>
      !template.applies_to_offer_id ||
      template.applies_to_offer_id === client.offer_milestones_current_offer_id,
  );
  const createdTasks: Record<string, unknown>[] = [];
  const taskErrors: string[] = [];

  for (const template of matchingTemplates) {
    try {
      const assignedToId = await resolveTemplateAssignee(
        supabase,
        company.id,
        template,
        client,
      );
      const taskName = String(template.name ?? "").trim();
      if (!taskName) continue;
      const dueOffsetDays = Number(template.due_offset_days ?? 0);
      const taskDueDate = addDaysIso(
        (client.client_age_date_onboarded as string | null | undefined) ?? null,
        Number.isFinite(dueOffsetDays) ? dueOffsetDays : 0,
      );
      const { data: task, error: taskError } = await supabase
        .from("client_tasks")
        .insert({
          company_id: company.id,
          company_glide_row_id: company.legacy_glide_row_id,
          glide_row_id: `task_${crypto.randomUUID()}`,
          client_id: client.glide_row_id,
          task_name: taskName,
          task_description: template.description ?? null,
          task_due_date: taskDueDate,
          task_last_updated_date: new Date().toISOString(),
          start_date: new Date().toISOString(),
          created_by_id: null,
          assigned_to_id: assignedToId,
          priority: template.priority ?? null,
          status_value: template.status_value ?? "todo",
          metadata: {
            created_in: source,
            task_template_id: template.id,
            task_template_name: template.name,
          },
        })
        .select("*")
        .single();
      if (taskError) throw taskError;
      createdTasks.push(task);
    } catch (templateError) {
      taskErrors.push(
        templateError instanceof Error ? templateError.message : "Task template failed.",
      );
    }
  }

  return { createdTasks, taskErrors };
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

function mergeRecord(
  target: Record<string, unknown>,
  value: unknown,
) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return;
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    target[key] = entry;
  }
}

function parsePossiblyNestedPayload(value: unknown) {
  if (!value) return null;
  if (typeof value === "object" && !Array.isArray(value)) return value;
  if (Array.isArray(value)) {
    const entries: Record<string, unknown> = {};
    for (const item of value) {
      if (!item || typeof item !== "object") continue;
      const record = item as Record<string, unknown>;
      const key =
        typeof record.key === "string"
          ? record.key
          : typeof record.name === "string"
            ? record.name
            : "";
      if (!key) continue;
      entries[key] = record.value ?? record.val ?? record.data ?? "";
    }
    return Object.keys(entries).length > 0 ? entries : null;
  }
  if (typeof value !== "string") return null;

  const text = value.trim();
  if (!text) return null;

  try {
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // Fall through to URL-encoded parsing below.
  }

  if (text.includes("=")) {
    return Object.fromEntries(new URLSearchParams(text).entries());
  }

  return null;
}

function flattenZapierKeys(body: Record<string, unknown>) {
  for (const [key, value] of Object.entries({ ...body })) {
    const bracketMatch = key.match(/^(?:data|body|payload|request)\[([^\]]+)\]$/);
    const dotMatch = key.match(/^(?:data|body|payload|request)\.([^.]+)$/);
    const nestedKey = bracketMatch?.[1] ?? dotMatch?.[1];
    if (nestedKey && body[nestedKey] === undefined) {
      body[nestedKey] = value;
    }
  }
}

async function parseWebhookBody(req: Request) {
  const body: Record<string, unknown> = Object.fromEntries(
    new URL(req.url).searchParams.entries(),
  );
  const contentType = req.headers.get("content-type")?.toLowerCase() ?? "";
  const rawBody = await req.text();

  if (rawBody.trim()) {
    let parsed: unknown = null;

    if (contentType.includes("application/json")) {
      parsed = parsePossiblyNestedPayload(rawBody);
    } else if (contentType.includes("application/x-www-form-urlencoded")) {
      parsed = Object.fromEntries(new URLSearchParams(rawBody).entries());
    } else {
      parsed = parsePossiblyNestedPayload(rawBody);
    }

    mergeRecord(body, parsed);
  }

  for (const key of ["", "data", "body", "payload", "request"]) {
    const nested = parsePossiblyNestedPayload(body[key]);
    mergeRecord(body, nested);
  }
  flattenZapierKeys(body);

  return body;
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

async function resolveCompany(
  supabase: ReturnType<typeof createClient>,
  body: Record<string, unknown>,
) {
  const rawCompanyId =
    cleanText(body.company_id) ||
    cleanText(body.companyId) ||
    cleanText(body.companyGlideId) ||
    cleanText(body.company_glide_id);

  if (!rawCompanyId) {
    return { error: "Zapier payload must include company_id." };
  }

  const isUuid =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      rawCompanyId,
    );

  const query = supabase
    .from("companies")
    .select("id, legacy_glide_row_id, name, migration_status")
    .in("migration_status", ["pilot", "migrated"]);

  const { data, error } = isUuid
    ? await query.eq("id", rawCompanyId).maybeSingle()
    : await query.eq("legacy_glide_row_id", rawCompanyId).maybeSingle();

  if (error) throw error;
  if (!data) {
    return {
      error:
        "Company is not enabled for RetainOS Zapier client creation. Check company_id.",
    };
  }

  return { company: data };
}

async function resolveAssignableMember(
  supabase: ReturnType<typeof createClient>,
  companyId: string,
  value: unknown,
) {
  const requested = cleanText(value);
  if (!requested) return null;

  const { data, error } = await supabase
    .from("company_members")
    .select("id, legacy_glide_row_id, email, status, hide_from_csm_list")
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
    throw new Error("Assigned CSM is not an active client manager.");
  }

  return member.legacy_glide_row_id ?? member.id;
}

async function resolveOffer(
  supabase: ReturnType<typeof createClient>,
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
  if (!data) throw new Error("Offer ID is not active for this company.");

  return data.glide_row_id;
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

    const body = await parseWebhookBody(req);
    const clientName =
      cleanText(body.client_name) ||
      cleanText(body.clientName) ||
      cleanText(body.name);

    if (!clientName) {
      return jsonResponse(
        {
          error: "Client name is required.",
          received_keys: Object.keys(body).filter(Boolean).sort(),
        },
        400,
      );
    }

    const companyResult = await resolveCompany(supabase, body);
    if (companyResult.error) {
      return jsonResponse(
        {
          error: companyResult.error,
          received_keys: Object.keys(body).filter(Boolean).sort(),
        },
        400,
      );
    }
    const company = companyResult.company;

    const authResult = await validateCompanyIntegrationSecret(
      supabase,
      company.id,
      "client_create",
      getWebhookSecret(req),
      Deno.env.get("ZAPIER_CLIENT_WEBHOOK_SECRET") ?? undefined,
      getClientIp(req),
    );
    if (!authResult.ok) {
      return jsonResponse({ error: authResult.error }, authResult.status);
    }

    const externalId =
      nullableText(body.external_id) ??
      nullableText(body.externalId) ??
      nullableText(body.zapier_id) ??
      nullableText(body.zapierId);
    const glideRowId = externalId
      ? `zapier_${company.id}_${externalId}`.replace(/[^a-zA-Z0-9_-]/g, "_")
      : `ro_${crypto.randomUUID()}`;

    const { data: existingClient, error: existingError } = await supabase
      .from("clients")
      .select("id, glide_row_id, client_name")
      .eq("company_id", company.id)
      .eq("glide_row_id", glideRowId)
      .maybeSingle();
    if (existingError) throw existingError;
    if (existingClient) {
      return jsonResponse({
        ok: true,
        duplicate: true,
        client: existingClient,
      });
    }

    const assignedCsmId = await resolveAssignableMember(
      supabase,
      company.id,
      body.csm_team_member_id ??
        body.csmTeamMemberId ??
        body.csm_email ??
        body.csmEmail ??
        body.assigned_to ??
        body.assignedTo,
    );

    const offerId = await resolveOffer(
      supabase,
      company.id,
      body.offer_id ?? body.offerId,
    );

    const now = new Date().toISOString();
    const onboardedAt =
      normalizeDate(body.date_onboarded) ??
      normalizeDate(body.dateOnboarded) ??
      normalizeDate(body.onboarded_at) ??
      now;
    const contractStartDate =
      normalizeDate(body.contract_start_date) ??
      normalizeDate(body.contractStartDate);
    const contractEndDate =
      normalizeDate(body.contract_end_date) ??
      normalizeDate(body.contractEndDate);
    const contractMonthlyValue =
      nullableNumber(body.contract_monthly_value) ??
      nullableNumber(body.contractMonthlyValue);

    const customFields: Record<string, string> = {};
    for (let index = 1; index <= 7; index += 1) {
      const value = nullableText(body[`customfield${index}`]);
      if (value) customFields[`customfield${index}`] = value;
    }

    const archetype = firstNullableText(body.archetype, body.client_archetype, body.clientArchetype);
    if (
      archetype &&
      !["doer", "controller", "worrier", "follower"].includes(archetype.toLowerCase())
    ) {
      return jsonResponse(
        { error: "Archetype must be one of: doer, controller, worrier, follower." },
        400,
      );
    }

    const insertPayload = {
      glide_row_id: glideRowId,
      company_id: company.id,
      company_glide_row_id: company.legacy_glide_row_id,
      client_name: clientName,
      client_business:
        firstNullableText(body.client_business, body.clientBusiness, body.business, body.business_name),
      client_email:
        nullableText(body.client_email) ?? nullableText(body.clientEmail),
      client_archetype_value: archetype,
      north_star_value:
        firstNullableText(body.north_star, body.northStar, body.northstar),
      next_steps_value:
        firstNullableText(body.next_steps, body.nextSteps, body.notes),
      csm_team_member_id: assignedCsmId,
      client_age_date_onboarded: onboardedAt,
      program_status_value:
        nullableText(body.program_status) ??
        nullableText(body.programStatusValue) ??
        "front-end",
      offer_milestones_current_offer_id: offerId,
      current_contract_start_date: contractStartDate,
      current_contract_end_date: contractEndDate,
      current_contract_end_date_for_filtering: contractEndDate,
      current_contract_of_days: daysBetween(contractStartDate, contractEndDate),
      current_contract_monthly_value: contractMonthlyValue,
      metadata: {
        created_in: "zapier_create_client",
        external_id: externalId,
        auth_mode: authResult.authMode,
        integration_token_id: authResult.tokenId,
        integration_token_prefix: authResult.tokenPrefix,
        client_phone: firstNullableText(body.client_phone, body.clientPhone, body.phone),
        mailing_address: firstNullableText(body.mailing_address, body.mailingAddress),
        custom_fields: customFields,
      },
    };

    const { data: client, error: createError } = await supabase
      .from("clients")
      .insert(insertPayload)
      .select("*")
      .single();
    if (createError) throw createError;

    let contract = null;
    if (contractStartDate || contractEndDate) {
      const { data, error } = await supabase
        .from("client_contracts")
        .insert({
          company_id: company.id,
          company_glide_row_id: company.legacy_glide_row_id,
          glide_row_id: `contract_${crypto.randomUUID()}`,
          client_id: glideRowId,
          start_date: contractStartDate,
          end_date: contractEndDate,
          monthly_value: contractMonthlyValue,
          contract_days: daysBetween(contractStartDate, contractEndDate),
          status: "active",
          metadata: {
            created_in: "zapier_create_client",
            external_id: externalId,
            auth_mode: authResult.authMode,
            integration_token_id: authResult.tokenId,
            integration_token_prefix: authResult.tokenPrefix,
          },
        })
        .select("*")
        .single();
      if (error) throw error;
      contract = data;
    }

    const templateTaskResult = await createTasksFromClientTemplates({
      supabase,
      company,
      client,
      source: "zapier_create_client_template",
    });

    const { data: event, error: historyError } = await supabase
      .from("client_history_events")
      .insert({
        company_id: company.id,
        legacy_client_glide_row_id: glideRowId,
        event_type: "client_created",
        source: "zapier",
        title: `Client created by Zapier: ${client.client_name}`,
        summary: `Created ${client.client_name} from Zapier webhook.`,
        payload: {
          client,
          initial_contract: contract,
          external_id: externalId,
          auth_mode: authResult.authMode,
          integration_token_prefix: authResult.tokenPrefix,
          created_template_tasks: templateTaskResult.createdTasks,
          task_template_errors: templateTaskResult.taskErrors,
        },
      })
      .select("*")
      .single();
    if (historyError) throw historyError;

    await supabase.from("app_audit_events").insert({
      company_id: company.id,
      event_type: "client_created",
      source: "zapier",
      entity_table: "clients",
      entity_id: client.id,
      legacy_glide_row_id: glideRowId,
      title: "Client created by Zapier",
      summary: `Created ${client.client_name}.`,
      after_data: client,
      metadata: {
        history_event_id: event.id,
        external_id: externalId,
        auth_mode: authResult.authMode,
        integration_token_id: authResult.tokenId,
        integration_token_prefix: authResult.tokenPrefix,
        created_template_task_count: templateTaskResult.createdTasks.length,
        task_template_errors: templateTaskResult.taskErrors,
      },
    });

    return jsonResponse({
      ok: true,
      client,
      event,
      contract,
      createdTemplateTasks: templateTaskResult.createdTasks,
      taskTemplateErrors: templateTaskResult.taskErrors,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    return jsonResponse({ error: message }, 500);
  }
});
