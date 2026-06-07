/// <reference path="../_shared/deno.d.ts" />

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-webhook-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
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

function getWebhookSecret(req: Request) {
  const bearer = (req.headers.get("Authorization") ?? "").match(/^Bearer\s+(.+)$/i)
    ?.[1];
  return bearer ?? req.headers.get("x-webhook-secret") ?? "";
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
    const expectedSecret = Deno.env.get("ZAPIER_CLIENT_WEBHOOK_SECRET");
    if (!expectedSecret) {
      return jsonResponse({ error: "Zapier webhook secret is not configured." }, 500);
    }

    if (getWebhookSecret(req) !== expectedSecret) {
      return jsonResponse({ error: "Invalid webhook secret." }, 401);
    }

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

    const body = await req.json().catch(() => ({}));
    const clientName =
      cleanText(body.client_name) ||
      cleanText(body.clientName) ||
      cleanText(body.name);

    if (!clientName) {
      return jsonResponse({ error: "Client name is required." }, 400);
    }

    const companyResult = await resolveCompany(supabase, body);
    if (companyResult.error) {
      return jsonResponse({ error: companyResult.error }, 400);
    }
    const company = companyResult.company;

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
          },
        })
        .select("*")
        .single();
      if (error) throw error;
      contract = data;
    }

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
      },
    });

    return jsonResponse({ ok: true, client, event, contract });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    return jsonResponse({ error: message }, 500);
  }
});
