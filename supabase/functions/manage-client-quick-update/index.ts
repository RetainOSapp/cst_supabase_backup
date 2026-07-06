/// <reference path="../_shared/deno.d.ts" />

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const WRITER_ROLES = new Set(["director", "support", "csm"]);
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

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

function cleanText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
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

function parseDateTime(value: unknown) {
  const raw = cleanText(value);
  if (!raw) return null;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function hasOwn(record: Record<string, unknown>, key: string) {
  return Object.prototype.hasOwnProperty.call(record, key);
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
        updated_from: "quick_update",
      },
    });
  }

  return { changes, upserts };
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

  throw new Error("You do not have permission to quick update this client.");
}

function actorAssignmentIds(actor: {
  memberId: string | null;
  legacyMemberId: string | null;
}) {
  return [actor.legacyMemberId, actor.memberId].filter(
    (id): id is string => Boolean(id),
  );
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
    const companyLegacyId = cleanText(body.companyLegacyId);
    const clientLegacyId = cleanText(body.clientLegacyId);

    if (!companyLegacyId) {
      return jsonResponse({ error: "Missing company id." }, 400);
    }
    if (!clientLegacyId) {
      return jsonResponse({ error: "Missing client id." }, 400);
    }

    const { data: company, error: companyError } = await supabase
      .from("companies")
      .select("id, legacy_glide_row_id, migration_status")
      .eq("legacy_glide_row_id", companyLegacyId)
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

    const { data: client, error: clientError } = await supabase
      .from("clients")
      .select(
        "id, glide_row_id, company_id, company_glide_row_id, client_name, csm_team_member_id, csm_secondary_assignee_id",
      )
      .eq("glide_row_id", clientLegacyId)
      .eq("company_id", company.id)
      .maybeSingle();

    if (clientError) throw clientError;
    if (!client) return jsonResponse({ error: "Client not found." }, 404);

    if (actor.role === "csm") {
      const assignmentIds = actorAssignmentIds(actor);
      const isAssigned =
        assignmentIds.includes(client.csm_team_member_id ?? "") ||
        assignmentIds.includes(client.csm_secondary_assignee_id ?? "");
      if (!isAssigned) {
        return jsonResponse(
          { error: "CSMs can quick update assigned clients only." },
          403,
        );
      }
    }

    const hasNextSteps = hasOwn(body, "nextSteps");
    const hasLastContactAt = hasOwn(body, "lastContactAt");
    const hasNextContactAt = hasOwn(body, "nextContactAt");
    const hasSuccessStatus = hasOwn(body, "successStatus");
    const hasProgressStatus = hasOwn(body, "progressStatus");
    const hasBuyInStatus = hasOwn(body, "buyInStatus");
    const isContactTouch = body.contactTouch === true;

    const nextSteps = hasNextSteps ? cleanText(body.nextSteps) : "";
    const notes = cleanText(body.notes);
    const lastContactAt = hasLastContactAt
      ? parseDateTime(body.lastContactAt)
      : null;
    let nextContactAt = hasNextContactAt
      ? parseDateTime(body.nextContactAt)
      : null;
    const successStatus = hasSuccessStatus ? cleanText(body.successStatus) : "";
    const progressStatus = hasProgressStatus ? cleanText(body.progressStatus) : "";
    const buyInStatus = hasBuyInStatus ? cleanText(body.buyInStatus) : "";
    const advocacyEvents = parseAdvocacyEvents(body.advocacyEvents);
    const customFieldUpdates = await prepareCustomFieldUpdates(
      supabase,
      company.id,
      clientLegacyId,
      body.customFields,
    );

    if (lastContactAt && !hasNextContactAt) {
      const { data: settings, error: settingsError } = await supabase
        .from("company_settings")
        .select("metadata")
        .eq("company_id", company.id)
        .maybeSingle();
      if (settingsError) throw settingsError;
      const metadata = metadataRecord(settings?.metadata);
      if (metadata.contact_touch_sets_next_contact === true) {
        const days = boundedInteger(
          metadata.contact_touch_next_contact_days,
          4,
          0,
          365,
        );
        nextContactAt = addDaysFromDateIso(lastContactAt, days);
      }
    }

    if (
      !hasNextSteps &&
      !notes &&
      !hasLastContactAt &&
      !hasNextContactAt &&
      !hasSuccessStatus &&
      !hasProgressStatus &&
      !hasBuyInStatus &&
      advocacyEvents.length === 0 &&
      customFieldUpdates.changes.length === 0
    ) {
      return jsonResponse(
        { error: "Add at least one Quick Update field before saving." },
        400,
      );
    }

    const payload = {
      company_id: company.id,
      legacy_client_glide_row_id: clientLegacyId,
      actor_auth_user_id: userData.user.id,
      actor_member_id: actor.memberId,
      event_type: "quick_update",
      source: "client_quick_update",
      title: `Quick update for ${client.client_name ?? "client"}`,
      summary: notes || nextSteps || (isContactTouch ? "Contacted today" : null),
      next_steps: hasNextSteps ? nextSteps || null : null,
      last_contact_at: hasLastContactAt ? lastContactAt : null,
      next_contact_at: hasNextContactAt || nextContactAt ? nextContactAt : null,
      success_status: hasSuccessStatus ? successStatus || null : null,
      progress_status: hasProgressStatus ? progressStatus || null : null,
      buy_in_status: hasBuyInStatus ? buyInStatus || null : null,
      notes: notes || null,
      payload: {
        actor_role: actor.role,
        client_name: client.client_name ?? null,
        contact_touch: isContactTouch,
        custom_fields: customFieldUpdates.changes,
        advocacy_events: advocacyEvents,
      },
    };

    const { data: event, error: insertError } = await supabase
      .from("client_history_events")
      .insert(payload)
      .select("*")
      .single();

    if (insertError) throw insertError;

    let insertedAdvocacyEvents: Record<string, unknown>[] = [];
    if (advocacyEvents.length > 0) {
      const { data: advocacyRows, error: advocacyError } = await supabase
        .from("client_advocacy_events")
        .insert(
          advocacyEvents.map((advocacyEvent) => ({
            company_id: company.id,
            client_id: client.id,
            client_legacy_id: clientLegacyId,
            company_legacy_id: company.legacy_glide_row_id,
            advocacy_type: advocacyEvent.advocacyType,
            action: advocacyEvent.action,
            occurred_at: advocacyEvent.occurredAt,
            notes: advocacyEvent.notes,
            csm_team_member_id: client.csm_team_member_id ?? null,
            actor_member_id: actor.memberId,
            actor_member_legacy_id: actor.legacyMemberId,
            actor_auth_user_id: userData.user.id,
            source: "quick_update",
            metadata: {
              history_event_id: event.id,
              actor_role: actor.role,
            },
          })),
        )
        .select("*");
      if (advocacyError) throw advocacyError;
      insertedAdvocacyEvents = (advocacyRows ?? []) as Record<string, unknown>[];
    }

    const advocacySummaryUpdates =
      advocacyEvents.length > 0
        ? await refreshAdvocacySummary(supabase, company.id, clientLegacyId)
        : {};

    const clientUpdates: Record<string, unknown> = {
      ...advocacySummaryUpdates,
    };
    if (hasNextSteps) clientUpdates.next_steps_value = nextSteps || null;
    if (hasLastContactAt) clientUpdates.csm_date_of_last_contact = lastContactAt;
    if (hasNextContactAt || nextContactAt) {
      clientUpdates.csm_date_of_next_contact = nextContactAt;
    }
    const outcomeUpdatedAt = new Date().toISOString();
    if (hasSuccessStatus) {
      clientUpdates.outcomes_success_value = successStatus || null;
      clientUpdates.outcomes_success_value_for_filtering = successStatus || null;
      clientUpdates.outcomes_success_date = successStatus ? outcomeUpdatedAt : null;
    }
    if (hasProgressStatus) {
      clientUpdates.outcomes_progress_value = progressStatus || null;
      clientUpdates.outcomes_progress_for_filtering = progressStatus || null;
      clientUpdates.outcomes_progress_date = progressStatus ? outcomeUpdatedAt : null;
    }
    if (hasBuyInStatus) {
      clientUpdates.outcomes_buy_in_value = buyInStatus || null;
      clientUpdates.outcomes_buy_in_for_filtering = buyInStatus || null;
      clientUpdates.outcomes_buy_in_date = buyInStatus ? outcomeUpdatedAt : null;
    }

    let updatedClient: Record<string, unknown> | null = null;
    if (Object.keys(clientUpdates).length > 0) {
      const { data, error: updateClientError } = await supabase
        .from("clients")
        .update(clientUpdates)
        .eq("company_id", company.id)
        .eq("glide_row_id", clientLegacyId)
        .select("*")
        .maybeSingle();

      if (updateClientError) throw updateClientError;
      updatedClient = data as Record<string, unknown> | null;
    } else {
      const { data, error: reloadClientError } = await supabase
        .from("clients")
        .select("*")
        .eq("company_id", company.id)
        .eq("glide_row_id", clientLegacyId)
        .maybeSingle();
      if (reloadClientError) throw reloadClientError;
      updatedClient = data as Record<string, unknown> | null;
    }

    if (customFieldUpdates.upserts.length > 0) {
      const { error: customFieldsError } = await supabase
        .from("client_custom_field_values")
        .upsert(customFieldUpdates.upserts, {
          onConflict: "company_id,client_id,custom_field_id",
        });
      if (customFieldsError) throw customFieldsError;
    }

    await supabase.from("app_audit_events").insert({
      company_id: company.id,
      actor_auth_user_id: userData.user.id,
      actor_member_id: actor.memberId,
      event_type: "client_quick_update_created",
      source: "client_quick_update",
      entity_table: "client_history_events",
      entity_id: event.id,
      legacy_glide_row_id: clientLegacyId,
      title: "Client Quick Update created",
      summary: `Quick Update saved for ${client.client_name ?? clientLegacyId}.`,
      after_data: {
        event,
        updated_client: updatedClient,
        custom_fields: customFieldUpdates.changes,
        advocacy_events: insertedAdvocacyEvents,
      },
    });

    return jsonResponse({
      ok: true,
      event,
      client: updatedClient,
      customFields: customFieldUpdates.changes,
      advocacyEvents: insertedAdvocacyEvents,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    return jsonResponse({ error: message }, 500);
  }
});
