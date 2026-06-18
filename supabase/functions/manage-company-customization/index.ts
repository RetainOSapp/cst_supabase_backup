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
  "update_notification_preferences",
  "seed_default_churn_reasons",
  "upsert_custom_field",
  "archive_custom_field",
  "upsert_outcome",
  "archive_outcome",
  "upsert_churn_reason",
  "archive_churn_reason",
  "upsert_task_template",
  "archive_task_template",
]);
const OUTCOME_TYPES = new Set(["success", "progress", "buy_in", "suitable"]);
const CUSTOM_FIELD_TYPES = new Set([
  "text",
  "textarea",
  "number",
  "date",
  "boolean",
  "single_select",
  "multi_select",
  "url",
  "email",
]);
const CUSTOM_FIELD_ENTITY_TYPES = new Set(["client", "company_member", "contract"]);
const CLIENT_VIEWS = new Set(["list", "card", "calendar"]);
const CALENDAR_MODES = new Set(["month", "week", "day"]);
const TASK_TEMPLATE_TRIGGERS = new Set(["manual", "client_created"]);
const TASK_TEMPLATE_ASSIGNEES = new Set([
  "assigned_csm",
  "director",
  "support",
  "specific_member",
  "unassigned",
]);
const TASK_STATUSES = new Set([
  "todo",
  "in-progress",
  "waiting",
  "done",
  "dismissed",
  "archived",
]);
const NOTIFICATION_TYPES = new Set([
  "next_contact_due",
  "renewal_due",
  "paused_return_due",
  "churn_risk",
  "rga_candidate",
  "quiet_profile",
  "task_due",
  "diagnostic_due",
  "strategic_review_due",
]);
const DEFAULT_CHURN_REASONS = [
  {
    value: "financial",
    label: "Financial",
    category: "commercial",
    position: 10,
    requires_notes: false,
  },
  {
    value: "overwhelm",
    label: "Overwhelm",
    category: "capacity",
    position: 20,
    requires_notes: false,
  },
  {
    value: "paused",
    label: "Paused",
    category: "paused",
    position: 30,
    requires_notes: false,
  },
  {
    value: "spousal",
    label: "Spousal",
    category: "family",
    position: 40,
    requires_notes: false,
  },
  {
    value: "uncertainty",
    label: "Uncertainty",
    category: "uncertainty",
    position: 50,
    requires_notes: false,
  },
  {
    value: "other",
    label: "Other",
    category: "other",
    position: 60,
    requires_notes: true,
  },
];

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

function normalizeNotificationMetadata(
  notificationType: string,
  metadata: unknown,
) {
  if (notificationType !== "diagnostic_due") return {};
  const raw =
    metadata && typeof metadata === "object"
      ? (metadata as Record<string, unknown>)
      : {};
  return {
    recurrence: raw.recurrence === "recurring" ? "recurring" : "once",
  };
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

function parseOptions(value: unknown) {
  if (!Array.isArray(value)) return [];
  const options = value
    .map((option) => {
      if (typeof option === "string") {
        const label = option.trim();
        return label ? { value: cleanValue(label), label } : null;
      }
      if (!option || typeof option !== "object") return null;
      const raw = option as Record<string, unknown>;
      const label = cleanText(raw.label);
      const optionValue = cleanValue(raw.value ?? label);
      if (!label || !optionValue) return null;
      return { value: optionValue, label };
    })
    .filter(Boolean) as { value: string; label: string }[];
  const seen = new Set<string>();
  return options.filter((option) => {
    if (seen.has(option.value)) return false;
    seen.add(option.value);
    return true;
  });
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

    if (action === "update_notification_preferences") {
      const rawPreferences = Array.isArray(body.preferences)
        ? body.preferences
        : [];
      const preferences = rawPreferences
        .map((preference: Record<string, unknown>) => {
          const notificationType = cleanText(preference.notification_type);
          if (!NOTIFICATION_TYPES.has(notificationType)) return null;
          return {
            notification_type: notificationType,
            in_app_enabled: preference.in_app_enabled === false ? false : true,
            email_enabled: false,
            lead_days: requiredBoundedInteger(
              preference.lead_days,
              notificationType === "renewal_due" ? 7 : 0,
              0,
              365,
            ),
            metadata: normalizeNotificationMetadata(
              notificationType,
              preference.metadata,
            ),
          };
        })
        .filter(Boolean) as {
        notification_type: string;
        in_app_enabled: boolean;
        email_enabled: boolean;
        lead_days: number;
        metadata: Record<string, unknown>;
      }[];

      if (preferences.length === 0) {
        return jsonResponse({ error: "Choose at least one notification preference." }, 400);
      }

      const { data: beforeRows, error: beforeError } = await supabase
        .from("notification_preferences")
        .select("*")
        .eq("company_id", company.id)
        .is("member_id", null)
        .is("role", null);
      if (beforeError) throw beforeError;

      const savedRows: Record<string, unknown>[] = [];
      for (const preference of preferences) {
        const { data: existing, error: existingError } = await supabase
          .from("notification_preferences")
          .select("id")
          .eq("company_id", company.id)
          .eq("notification_type", preference.notification_type)
          .is("member_id", null)
          .is("role", null)
          .maybeSingle();
        if (existingError) throw existingError;

        const payload = {
          company_id: company.id,
          member_id: null,
          role: null,
          notification_type: preference.notification_type,
          in_app_enabled: preference.in_app_enabled,
          email_enabled: false,
          lead_days: preference.lead_days,
          metadata: preference.metadata,
        };

        const { data: saved, error: saveError } = existing?.id
          ? await supabase
              .from("notification_preferences")
              .update(payload)
              .eq("id", existing.id)
              .eq("company_id", company.id)
              .select("*")
              .single()
          : await supabase
              .from("notification_preferences")
              .insert(payload)
              .select("*")
              .single();
        if (saveError) throw saveError;
        savedRows.push(saved);
      }

      await supabase.from("app_audit_events").insert({
        company_id: company.id,
        actor_auth_user_id: userData.user.id,
        actor_member_id: actor.memberId,
        event_type: "company_customization_update_notification_preferences",
        source: "company_settings_admin",
        entity_table: "notification_preferences",
        entity_id: null,
        legacy_glide_row_id: company.legacy_glide_row_id,
        title: "update notification preferences",
        summary: "Company notification preferences were updated.",
        before_data: beforeRows ?? [],
        after_data: savedRows,
      });

      return jsonResponse({ ok: true, items: savedRows });
    }

    if (action === "seed_default_churn_reasons") {
      const { count, error: countError } = await supabase
        .from("company_churn_reasons")
        .select("id", { count: "exact", head: true })
        .eq("company_id", company.id);
      if (countError) throw countError;

      if ((count ?? 0) > 0) {
        return jsonResponse({ ok: true, seeded: false, items: [] });
      }

      const { data: savedRows, error: saveError } = await supabase
        .from("company_churn_reasons")
        .insert(
          DEFAULT_CHURN_REASONS.map((reason) => ({
            company_id: company.id,
            ...reason,
            counts_as_churn: true,
            status: "active",
            metadata: { seeded_from: "company_customization_v1_defaults" },
          })),
        )
        .select("*")
        .order("position", { ascending: true });
      if (saveError) throw saveError;

      await supabase.from("app_audit_events").insert({
        company_id: company.id,
        actor_auth_user_id: userData.user.id,
        actor_member_id: actor.memberId,
        event_type: "company_customization_seed_default_churn_reasons",
        source: "company_customization_admin",
        entity_table: "company_churn_reasons",
        entity_id: null,
        legacy_glide_row_id: company.legacy_glide_row_id,
        title: "seed default churn reasons",
        summary: "Default company churn reasons were seeded because none existed.",
        before_data: [],
        after_data: savedRows ?? [],
      });

      return jsonResponse({ ok: true, seeded: true, items: savedRows ?? [] });
    }

    if (action === "upsert_custom_field" || action === "archive_custom_field") {
      const table = "company_custom_fields";
      const entityId = cleanText(body.entityId);
      let beforeData: Record<string, unknown> | null = null;
      let saved: Record<string, unknown> | null = null;

      if (action === "archive_custom_field") {
        if (!entityId) return jsonResponse({ error: "Missing custom field id." }, 400);
        const { data: existing, error: existingError } = await supabase
          .from(table)
          .select("*")
          .eq("id", entityId)
          .eq("company_id", company.id)
          .maybeSingle();
        if (existingError) throw existingError;
        if (!existing) return jsonResponse({ error: "Custom field not found." }, 404);
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
      } else {
        const key = cleanValue(body.key);
        const label = cleanText(body.label);
        const fieldType = cleanText(body.fieldType) || "text";
        const entityType = cleanText(body.entityType) || "client";
        const options = parseOptions(body.options);

        if (!key || !label) {
          return jsonResponse({ error: "Custom field key and label are required." }, 400);
        }
        if (!CUSTOM_FIELD_TYPES.has(fieldType)) {
          return jsonResponse({ error: "Choose a valid custom field type." }, 400);
        }
        if (!CUSTOM_FIELD_ENTITY_TYPES.has(entityType)) {
          return jsonResponse({ error: "Choose a valid custom field entity type." }, 400);
        }
        if (
          (fieldType === "single_select" || fieldType === "multi_select") &&
          options.length === 0
        ) {
          return jsonResponse(
            { error: "Select custom fields require at least one option." },
            400,
          );
        }

        const payload = {
          company_id: company.id,
          key,
          label,
          description: nullableText(body.description),
          entity_type: entityType,
          field_type: fieldType,
          options,
          is_required: Boolean(body.isRequired),
          is_visible_on_client_detail:
            body.isVisibleOnClientDetail === false ? false : true,
          is_visible_on_client_list: Boolean(body.isVisibleOnClientList),
          is_editable_by_csm: Boolean(body.isEditableByCsm),
          position: optionalInteger(body.position) ?? 0,
          source_table: nullableText(body.sourceTable),
          source_key: nullableText(body.sourceKey),
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
          if (!existing) return jsonResponse({ error: "Custom field not found." }, 404);
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
        summary: `${saved?.label ?? saved?.key ?? "Custom field"} was ${action.replaceAll("_", " ")}.`,
        before_data: beforeData,
        after_data: saved,
      });

      return jsonResponse({ ok: true, item: saved });
    }

    if (action === "upsert_task_template" || action === "archive_task_template") {
      const table = "company_task_templates";
      const entityId = cleanText(body.entityId);
      let beforeData: Record<string, unknown> | null = null;
      let saved: Record<string, unknown> | null = null;

      if (action === "archive_task_template") {
        if (!entityId) return jsonResponse({ error: "Missing task template id." }, 400);
        const { data: existing, error: existingError } = await supabase
          .from(table)
          .select("*")
          .eq("id", entityId)
          .eq("company_id", company.id)
          .maybeSingle();
        if (existingError) throw existingError;
        if (!existing) return jsonResponse({ error: "Task template not found." }, 404);
        beforeData = existing;

        const { data, error } = await supabase
          .from(table)
          .update({
            is_enabled: false,
            archived_at: new Date().toISOString(),
          })
          .eq("id", entityId)
          .eq("company_id", company.id)
          .select("*")
          .single();
        if (error) throw error;
        saved = data;
      } else {
        const name = cleanText(body.name);
        if (!name) return jsonResponse({ error: "Template name is required." }, 400);

        const triggerType = cleanText(body.triggerType) || "manual";
        if (!TASK_TEMPLATE_TRIGGERS.has(triggerType)) {
          return jsonResponse({ error: "Choose a valid task template trigger." }, 400);
        }

        const assignToType = cleanText(body.assignToType) || "assigned_csm";
        if (!TASK_TEMPLATE_ASSIGNEES.has(assignToType)) {
          return jsonResponse({ error: "Choose a valid task template assignee." }, 400);
        }

        const statusValue = cleanText(body.statusValue) || "todo";
        const normalizedStatus =
          statusValue === "in progress" || statusValue === "in_progress"
            ? "in-progress"
            : statusValue;
        if (!TASK_STATUSES.has(normalizedStatus)) {
          return jsonResponse({ error: "Choose a valid task template status." }, 400);
        }

        const assignedMemberLegacyId =
          assignToType === "specific_member" ? nullableText(body.assignedMemberLegacyId) : null;
        if (assignToType === "specific_member" && !assignedMemberLegacyId) {
          return jsonResponse({ error: "Choose a team member for this template." }, 400);
        }
        if (assignedMemberLegacyId) {
          const { data: member, error: memberError } = await supabase
            .from("company_members")
            .select("legacy_glide_row_id, status")
            .eq("company_id", company.id)
            .eq("legacy_glide_row_id", assignedMemberLegacyId)
            .maybeSingle();
          if (memberError) throw memberError;
          if (!member || member.status !== "active") {
            return jsonResponse({ error: "Template assignee is not an active team member." }, 400);
          }
        }

        const appliesToOfferId = nullableText(body.appliesToOfferId);
        if (appliesToOfferId) {
          const { data: offer, error: offerError } = await supabase
            .from("company_offers")
            .select("glide_row_id, status")
            .eq("company_id", company.id)
            .eq("glide_row_id", appliesToOfferId)
            .maybeSingle();
          if (offerError) throw offerError;
          if (!offer || offer.status !== "active") {
            return jsonResponse({ error: "Template offer is not active for this company." }, 400);
          }
        }

        const payload = {
          company_id: company.id,
          name,
          description: nullableText(body.description),
          trigger_type: triggerType,
          applies_to_offer_id: appliesToOfferId,
          assign_to_type: assignToType,
          assigned_member_legacy_id: assignedMemberLegacyId,
          due_offset_days: requiredBoundedInteger(body.dueOffsetDays, 0, 0, 365),
          priority: nullableText(body.priority),
          status_value: normalizedStatus,
          is_enabled: body.isEnabled === false ? false : true,
          position: optionalInteger(body.position) ?? 0,
          archived_at: null,
          metadata: { updated_from: "manage-company-customization" },
        };

        if (entityId) {
          const { data: existing, error: existingError } = await supabase
            .from(table)
            .select("*")
            .eq("id", entityId)
            .eq("company_id", company.id)
            .maybeSingle();
          if (existingError) throw existingError;
          if (!existing) return jsonResponse({ error: "Task template not found." }, 404);
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
        summary: `${saved?.name ?? "Task template"} was ${action.replaceAll("_", " ")}.`,
        before_data: beforeData,
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
