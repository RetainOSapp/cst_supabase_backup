/// <reference path="../_shared/deno.d.ts" />

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const ACTIONS = new Set([
  "update_settings",
  "upsert_outcome",
  "archive_outcome",
  "upsert_churn_reason",
  "archive_churn_reason",
]);
const OUTCOME_TYPES = new Set(["success", "progress", "buy_in", "suitable"]);
const CLIENT_VIEWS = new Set(["list", "card", "calendar"]);
const CALENDAR_MODES = new Set(["month", "week", "day"]);

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

function optionalInteger(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? Math.round(number) : null;
}

function requiredBoundedInteger(
  value: unknown,
  fallback: number,
  min: number,
  max: number,
) {
  const parsed = optionalInteger(value) ?? fallback;
  return Math.min(max, Math.max(min, parsed));
}

function cleanValue(value: unknown) {
  return cleanText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

async function assertCanManageCompany(
  supabase: ReturnType<typeof createClient>,
  userEmail: string,
  companyId: string,
) {
  const superAdminEmails = parseAllowlist(
    Deno.env.get("SUPER_ADMIN_EMAILS") ??
      Deno.env.get("VITE_SUPER_ADMIN_EMAILS"),
  );
  if (superAdminEmails.has(userEmail)) {
    return { role: "super_admin", memberId: null };
  }

  const { data, error } = await supabase
    .from("company_members")
    .select("id, role, status")
    .eq("company_id", companyId)
    .ilike("email", userEmail)
    .maybeSingle();
  if (error) throw error;
  if (data?.status === "active" && data.role === "director") {
    return { role: "director", memberId: data.id as string };
  }
  throw new Error("You do not have permission to manage company customization.");
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

    const body = await req.json().catch(() => ({}));
    const action = cleanText(body.action);
    const companyLegacyId = cleanText(body.companyLegacyId);
    if (!ACTIONS.has(action)) {
      return jsonResponse({ error: "Choose a valid customization action." }, 400);
    }
    if (!companyLegacyId) {
      return jsonResponse({ error: "Missing company id." }, 400);
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
        { error: "This company is not enabled for RetainOS customization writes." },
        400,
      );
    }

    const actor = await assertCanManageCompany(
      supabase,
      normalizeEmail(userData.user.email),
      company.id,
    );

    if (action === "update_settings") {
      const defaultClientView = cleanText(body.defaultClientView) || "list";
      const defaultCalendarMode = cleanText(body.defaultCalendarMode) || "month";
      if (!CLIENT_VIEWS.has(defaultClientView)) {
        return jsonResponse({ error: "Choose a valid default client view." }, 400);
      }
      if (!CALENDAR_MODES.has(defaultCalendarMode)) {
        return jsonResponse({ error: "Choose a valid default calendar mode." }, 400);
      }

      const { data: existing, error: existingError } = await supabase
        .from("company_settings")
        .select("*")
        .eq("company_id", company.id)
        .maybeSingle();
      if (existingError) throw existingError;

      const payload = {
        company_id: company.id,
        profile_upkeep_freshness_days: requiredBoundedInteger(
          body.profileUpkeepFreshnessDays,
          14,
          1,
          365,
        ),
        default_client_view: defaultClientView,
        default_calendar_mode: defaultCalendarMode,
        enable_secondary_assignee: Boolean(body.enableSecondaryAssignee),
        enable_call_ai_for_csms: Boolean(body.enableCallAiForCsms),
        enable_embeds: Boolean(body.enableEmbeds),
        enable_zapier_client_create: Boolean(body.enableZapierClientCreate),
      };

      const { data: saved, error: saveError } = existing?.id
        ? await supabase
            .from("company_settings")
            .update(payload)
            .eq("id", existing.id)
            .eq("company_id", company.id)
            .select("*")
            .single()
        : await supabase
            .from("company_settings")
            .insert({
              ...payload,
              metadata: { created_from: "manage-company-customization" },
            })
            .select("*")
            .single();
      if (saveError) throw saveError;

      await supabase
        .from("companies")
        .update({
          enable_secondary_assignee: payload.enable_secondary_assignee,
          enable_call_ai_for_csms: payload.enable_call_ai_for_csms,
        })
        .eq("id", company.id);

      await supabase.from("app_audit_events").insert({
        company_id: company.id,
        actor_auth_user_id: userData.user.id,
        actor_member_id: actor.memberId,
        event_type: "company_customization_update_settings",
        source: "company_settings_admin",
        entity_table: "company_settings",
        entity_id: saved.id,
        legacy_glide_row_id: company.legacy_glide_row_id,
        title: "update settings",
        summary: "Company settings were updated.",
        before_data: existing,
        after_data: saved,
      });

      return jsonResponse({ ok: true, item: saved });
    }

    const isOutcomeAction = action.includes("outcome");
    const table = isOutcomeAction
      ? "company_outcome_definitions"
      : "company_churn_reasons";
    const entityId = cleanText(body.entityId);

    let beforeData: Record<string, unknown> | null = null;
    let saved: Record<string, unknown> | null = null;

    if (action.startsWith("archive_")) {
      if (!entityId) return jsonResponse({ error: "Missing item id." }, 400);
      const { data: existing, error: existingError } = await supabase
        .from(table)
        .select("*")
        .eq("id", entityId)
        .eq("company_id", company.id)
        .maybeSingle();
      if (existingError) throw existingError;
      if (!existing) return jsonResponse({ error: "Item not found." }, 404);
      beforeData = existing;

      const { data, error } = await supabase
        .from(table)
        .update({ status: "archived", archived_at: new Date().toISOString() })
        .eq("id", entityId)
        .eq("company_id", company.id)
        .select("*")
        .single();
      if (error) throw error;
      saved = data;
    } else if (isOutcomeAction) {
      const outcomeType = cleanText(body.outcomeType);
      const value = cleanValue(body.value);
      const label = cleanText(body.label);
      if (!OUTCOME_TYPES.has(outcomeType)) {
        return jsonResponse({ error: "Choose a valid outcome type." }, 400);
      }
      if (!value || !label) {
        return jsonResponse({ error: "Outcome value and label are required." }, 400);
      }
      const payload = {
        company_id: company.id,
        outcome_type: outcomeType,
        value,
        label,
        color: nullableText(body.color),
        emoji: nullableText(body.emoji),
        positive_rank: optionalInteger(body.positiveRank),
        position: optionalInteger(body.position) ?? 0,
        is_default: Boolean(body.isDefault),
        status: "active",
        archived_at: null,
      };

      if (entityId) {
        const { data: existing, error: existingError } = await supabase
          .from(table)
          .select("*")
          .eq("id", entityId)
          .eq("company_id", company.id)
          .maybeSingle();
        if (existingError) throw existingError;
        if (!existing) return jsonResponse({ error: "Item not found." }, 404);
        beforeData = existing;
        const { data, error } = await supabase
          .from(table)
          .update(payload)
          .eq("id", entityId)
          .eq("company_id", company.id)
          .select("*")
          .single();
        if (error) throw error;
        saved = data;
      } else {
        const { data, error } = await supabase
          .from(table)
          .insert({
            ...payload,
            metadata: { created_from: "manage-company-customization" },
          })
          .select("*")
          .single();
        if (error) throw error;
        saved = data;
      }
    } else {
      const value = cleanValue(body.value);
      const label = cleanText(body.label);
      if (!value || !label) {
        return jsonResponse({ error: "Churn reason value and label are required." }, 400);
      }
      const payload = {
        company_id: company.id,
        value,
        label,
        category: nullableText(body.category),
        requires_notes: Boolean(body.requiresNotes),
        counts_as_churn: body.countsAsChurn === false ? false : true,
        position: optionalInteger(body.position) ?? 0,
        status: "active",
        archived_at: null,
      };

      if (entityId) {
        const { data: existing, error: existingError } = await supabase
          .from(table)
          .select("*")
          .eq("id", entityId)
          .eq("company_id", company.id)
          .maybeSingle();
        if (existingError) throw existingError;
        if (!existing) return jsonResponse({ error: "Item not found." }, 404);
        beforeData = existing;
        const { data, error } = await supabase
          .from(table)
          .update(payload)
          .eq("id", entityId)
          .eq("company_id", company.id)
          .select("*")
          .single();
        if (error) throw error;
        saved = data;
      } else {
        const { data, error } = await supabase
          .from(table)
          .insert({
            ...payload,
            metadata: { created_from: "manage-company-customization" },
          })
          .select("*")
          .single();
        if (error) throw error;
        saved = data;
      }
    }

    await supabase.from("app_audit_events").insert({
      company_id: company.id,
      actor_auth_user_id: userData.user.id,
      actor_member_id: actor.memberId,
      event_type: `company_customization_${action}`,
      source: "company_customization_admin",
      entity_table: table,
      entity_id: saved?.id ?? null,
      legacy_glide_row_id: company.legacy_glide_row_id,
      title: action.replaceAll("_", " "),
      summary: `${saved?.label ?? saved?.value ?? "Customization item"} was ${action.replaceAll("_", " ")}.`,
      before_data: beforeData,
      after_data: saved,
    });

    return jsonResponse({ ok: true, item: saved });
  } catch (error) {
    console.error(error);
    return jsonResponse(
      { error: error instanceof Error ? error.message : "Unexpected error." },
      500,
    );
  }
});
