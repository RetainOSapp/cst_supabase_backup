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

const ACTIONS = new Set([
  "list_configuration",
  "create_starters",
  "create_pipeline",
  "update_pipeline",
  "update_pipeline_automation",
  "archive_pipeline",
  "reorder_pipelines",
  "create_stage",
  "update_stage",
  "reorder_stages",
  "archive_stage",
  "update_role_access",
]);
const PIPELINE_TYPES = new Set(["renewal", "expansion"]);
const VALUE_SOURCES = new Set(["current_contract", "fixed", "none"]);
const STAGE_TYPES = new Set(["open", "won", "lost"]);
const TERMINAL_STAGE_TYPES = new Set(["won", "lost"]);
const CURRENCY_PATTERN = /^[A-Z]{3}$/;
const COLOR_PATTERN = /^#[0-9A-F]{6}$/;

const STARTERS = [
  {
    name: "Renewal",
    pipelineType: "renewal",
    position: 10,
    valueSource: "current_contract",
    stages: [
      { name: "Strategic Review", color: "#5B8DEF", stageType: "open" },
      { name: "Review Complete", color: "#8B7CF6", stageType: "open" },
      { name: "Follow Up", color: "#F2A65A", stageType: "open" },
      { name: "Won", color: "#45A675", stageType: "won" },
      { name: "Lost", color: "#D96C75", stageType: "lost" },
    ],
  },
  {
    name: "Expansion",
    pipelineType: "expansion",
    position: 20,
    valueSource: "none",
    stages: [
      { name: "Opportunity Identified", color: "#5B8DEF", stageType: "open" },
      { name: "Call Set", color: "#6C9BD2", stageType: "open" },
      { name: "Call Complete", color: "#8B7CF6", stageType: "open" },
      { name: "Follow Up", color: "#F2A65A", stageType: "open" },
      { name: "Won", color: "#45A675", stageType: "won" },
      { name: "Lost", color: "#D96C75", stageType: "lost" },
    ],
  },
] as const;

type ConfigurationActor = {
  role: "super_admin" | "director";
  memberId: string | null;
};

function cleanText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function objectValue(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? { ...(value as Record<string, unknown>) }
    : {};
}

function validatedObject(value: unknown, label: string) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new AuthError(`${label} must be a JSON object.`, 400);
  }
  return { ...(value as Record<string, unknown>) };
}

function requiredName(value: unknown, label: string) {
  const name = cleanText(value);
  if (!name) throw new AuthError(`${label} name is required.`, 400);
  if (name.length > 120) {
    throw new AuthError(`${label} name must be 120 characters or fewer.`, 400);
  }
  return name;
}

function boundedInteger(
  value: unknown,
  label: string,
  minimum: number,
  maximum: number,
  fallback?: number,
) {
  if (value === undefined || value === null || value === "") {
    if (fallback !== undefined) return fallback;
    throw new AuthError(`${label} is required.`, 400);
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new AuthError(
      `${label} must be a whole number between ${minimum} and ${maximum}.`,
      400,
    );
  }
  return parsed;
}

function optionalBoundedInteger(
  value: unknown,
  label: string,
  minimum: number,
  maximum: number,
) {
  if (value === undefined || value === null || value === "") return null;
  return boundedInteger(value, label, minimum, maximum);
}

function optionalCents(value: unknown) {
  if (value === undefined || value === null || value === "") return null;
  const text = typeof value === "number" ? String(value) : cleanText(value);
  if (!/^\d+$/.test(text)) {
    throw new AuthError("Default estimated value must be non-negative cents.", 400);
  }
  const cents = Number(text);
  if (!Number.isSafeInteger(cents) || cents < 0) {
    throw new AuthError("Default estimated value is outside the safe range.", 400);
  }
  return cents;
}

function pipelineType(value: unknown) {
  const type = cleanText(value).toLowerCase();
  if (!PIPELINE_TYPES.has(type)) {
    throw new AuthError("Pipeline type must be renewal or expansion.", 400);
  }
  return type;
}

function valueSource(value: unknown) {
  const source = cleanText(value).toLowerCase();
  if (!VALUE_SOURCES.has(source)) {
    throw new AuthError(
      "Value source must be current_contract, fixed, or none.",
      400,
    );
  }
  return source;
}

function stageType(value: unknown) {
  const type = cleanText(value).toLowerCase();
  if (!STAGE_TYPES.has(type)) {
    throw new AuthError("Stage type must be open, won, or lost.", 400);
  }
  return type;
}

function currencyCode(value: unknown, fallback = "USD") {
  const code = cleanText(value || fallback).toUpperCase();
  if (!CURRENCY_PATTERN.test(code)) {
    throw new AuthError("Currency must be a three-letter code such as USD.", 400);
  }
  return code;
}

function stageColor(value: unknown) {
  const color = cleanText(value).toUpperCase();
  if (!color) return null;
  if (!COLOR_PATTERN.test(color)) {
    throw new AuthError("Stage color must be a six-digit hex color.", 400);
  }
  return color;
}

function booleanValue(value: unknown, fallback: boolean) {
  return typeof value === "boolean" ? value : fallback;
}

function normalizeEntryRules(value: unknown, fallback: unknown = {}) {
  const existing = objectValue(fallback);
  const submitted = value === undefined
    ? {}
    : validatedObject(value, "Entry rules");
  for (const key of ["include_auto_renew", "include_month_to_month"]) {
    if (key in submitted && typeof submitted[key] !== "boolean") {
      throw new AuthError(`${key} must be true or false.`, 400);
    }
  }
  return {
    ...existing,
    ...submitted,
    include_auto_renew: booleanValue(
      submitted.include_auto_renew,
      booleanValue(existing.include_auto_renew, false),
    ),
    include_month_to_month: booleanValue(
      submitted.include_month_to_month,
      booleanValue(existing.include_month_to_month, false),
    ),
  };
}

async function resolveConfigurationActor(
  supabase: SupabaseServiceClient,
  actor: AuthenticatedActor,
  companyId: string,
): Promise<ConfigurationActor> {
  if (await isRegisteredSuperAdmin(supabase, actor)) {
    return { role: "super_admin", memberId: null };
  }

  const selectFields = "id, role, status, is_read_only";
  const { data: idMembership, error: idMembershipError } = await supabase
    .from("company_members")
    .select(selectFields)
    .eq("company_id", companyId)
    .eq("auth_user_id", actor.id)
    .maybeSingle();
  if (idMembershipError) throw idMembershipError;

  let membership = idMembership;
  if (!membership) {
    const { data: emailMembership, error: emailMembershipError } = await supabase
      .from("company_members")
      .select(selectFields)
      .eq("company_id", companyId)
      .eq("email", actor.email.trim().toLowerCase())
      .maybeSingle();
    if (emailMembershipError) throw emailMembershipError;
    membership = emailMembership;
  }

  const effectiveRole = membership?.is_read_only ? "viewer" : membership?.role;
  if (membership?.status !== "active" || effectiveRole !== "director") {
    throw new AuthError(
      "Only Super Admins and active company Directors can configure pipelines.",
      403,
    );
  }
  return { role: "director", memberId: membership.id as string };
}

async function loadPipeline(
  supabase: SupabaseServiceClient,
  companyId: string,
  pipelineId: string,
) {
  const { data, error } = await supabase
    .from("company_pipelines")
    .select("*")
    .eq("id", pipelineId)
    .eq("company_id", companyId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new AuthError("Pipeline not found.", 404);
  return data as Record<string, unknown>;
}

async function loadStage(
  supabase: SupabaseServiceClient,
  companyId: string,
  stageId: string,
) {
  const { data, error } = await supabase
    .from("company_pipeline_stages")
    .select("*")
    .eq("id", stageId)
    .eq("company_id", companyId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new AuthError("Pipeline stage not found.", 404);
  return data as Record<string, unknown>;
}

async function nonArchivedItemCount(
  supabase: SupabaseServiceClient,
  companyId: string,
  filter: { pipelineId?: string; stageId?: string },
) {
  let query = supabase
    .from("client_pipeline_items")
    .select("id", { count: "exact", head: true })
    .eq("company_id", companyId)
    .is("archived_at", null);
  if (filter.pipelineId) query = query.eq("pipeline_id", filter.pipelineId);
  if (filter.stageId) query = query.eq("stage_id", filter.stageId);
  const { count, error } = await query;
  if (error) throw error;
  return count ?? 0;
}

async function assertTerminalSlotAvailable(
  supabase: SupabaseServiceClient,
  companyId: string,
  pipelineId: string,
  type: string,
  excludingStageId?: string,
) {
  if (!TERMINAL_STAGE_TYPES.has(type)) return;
  let query = supabase
    .from("company_pipeline_stages")
    .select("id", { count: "exact", head: true })
    .eq("company_id", companyId)
    .eq("pipeline_id", pipelineId)
    .eq("stage_type", type)
    .eq("is_enabled", true)
    .is("archived_at", null);
  if (excludingStageId) query = query.neq("id", excludingStageId);
  const { count, error } = await query;
  if (error) throw error;
  if ((count ?? 0) > 0) {
    throw new AuthError(`A pipeline can have only one active ${type} stage.`, 409);
  }
}

async function activeStageTypeCount(
  supabase: SupabaseServiceClient,
  companyId: string,
  pipelineId: string,
  type: string,
) {
  const { count, error } = await supabase
    .from("company_pipeline_stages")
    .select("id", { count: "exact", head: true })
    .eq("company_id", companyId)
    .eq("pipeline_id", pipelineId)
    .eq("stage_type", type)
    .eq("is_enabled", true)
    .is("archived_at", null);
  if (error) throw error;
  return count ?? 0;
}

async function assertPipelineCanEnable(
  supabase: SupabaseServiceClient,
  companyId: string,
  pipelineId: string,
) {
  const [openCount, wonCount, lostCount] = await Promise.all([
    activeStageTypeCount(supabase, companyId, pipelineId, "open"),
    activeStageTypeCount(supabase, companyId, pipelineId, "won"),
    activeStageTypeCount(supabase, companyId, pipelineId, "lost"),
  ]);
  if (openCount < 1 || wonCount !== 1 || lostCount !== 1) {
    throw new AuthError(
      "An enabled pipeline needs at least one open stage and exactly one Won and Lost stage.",
      409,
    );
  }
}

async function applyConfigurationMutation(
  supabase: SupabaseServiceClient,
  companyId: string,
  authenticatedActor: AuthenticatedActor,
  actor: ConfigurationActor,
  operation: string,
  entityId: string | null,
  payload: Record<string, unknown>,
  eventType: string,
  title: string,
  summary: string,
) {
  const { data, error } = await supabase.rpc(
    "apply_pipeline_configuration_with_audit",
    {
      p_company_id: companyId,
      p_operation: operation,
      p_entity_id: entityId,
      p_payload: payload,
      p_actor_auth_user_id: authenticatedActor.id,
      p_actor_member_id: actor.memberId,
      p_actor_role: actor.role,
      p_audit_event_type: eventType,
      p_audit_title: title,
      p_audit_summary: summary,
    },
  );
  if (error) throw error;
  return data;
}

async function listConfiguration(
  supabase: SupabaseServiceClient,
  companyId: string,
) {
  const [settingsResult, pipelinesResult, stagesResult] = await Promise.all([
    supabase
      .from("company_settings")
      .select("enable_pipeline, enable_pipeline_director_access, enable_pipeline_support_access, enable_pipeline_csm_access, enable_pipeline_viewer_access")
      .eq("company_id", companyId)
      .maybeSingle(),
    supabase
      .from("company_pipelines")
      .select("*")
      .eq("company_id", companyId)
      .is("archived_at", null)
      .order("position", { ascending: true })
      .order("created_at", { ascending: true }),
    supabase
      .from("company_pipeline_stages")
      .select("*")
      .eq("company_id", companyId)
      .is("archived_at", null)
      .order("position", { ascending: true })
      .order("created_at", { ascending: true }),
  ]);
  if (settingsResult.error) throw settingsResult.error;
  if (pipelinesResult.error) throw pipelinesResult.error;
  if (stagesResult.error) throw stagesResult.error;
  const settings = settingsResult.data ?? {
      enable_pipeline: false,
      enable_pipeline_director_access: true,
      enable_pipeline_support_access: true,
      enable_pipeline_csm_access: true,
      enable_pipeline_viewer_access: false,
    };
  return {
    settings,
    masterEnabled: settings.enable_pipeline === true,
    directorAccessEnabled: settings.enable_pipeline_director_access !== false,
    supportAccessEnabled: settings.enable_pipeline_support_access !== false,
    csmAccessEnabled: settings.enable_pipeline_csm_access !== false,
    viewerAccessEnabled: settings.enable_pipeline_viewer_access === true,
    pipelines: (pipelinesResult.data ?? []).map((pipeline) => ({
      ...pipeline,
      include_auto_renew:
        objectValue(pipeline.entry_rules).include_auto_renew === true,
      include_month_to_month:
        objectValue(pipeline.entry_rules).include_month_to_month === true,
      auto_create_renewals: pipeline.auto_create_renewal_items === true,
      entry_stage_id:
        cleanText(objectValue(pipeline.automation_settings).entry_stage_id) || null,
      catch_up_days: boundedInteger(
        objectValue(pipeline.automation_settings).catch_up_days,
        "Renewal catch-up days",
        0,
        365,
        30,
      ),
      renewal_generation_enabled:
        objectValue(pipeline.automation_settings).renewal_generation_enabled === true,
      offboard_sync_enabled:
        objectValue(pipeline.automation_settings).offboard_sync_enabled === true,
      stage_task_creation_enabled:
        objectValue(pipeline.automation_settings).stage_task_creation_enabled === true,
      automation_paused:
        objectValue(pipeline.automation_settings).automation_paused === true,
    })),
    stages: stagesResult.data ?? [],
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return optionsResponse(req);
  const respond = (body: unknown, status = 200) =>
    sharedJsonResponse(req, body, status);
  if (req.method !== "POST") {
    return respond({ error: "Method not allowed." }, 405);
  }

  try {
    const supabase = createServiceClient();
    const authenticatedActor = await requireAuthenticatedActor(
      supabase,
      getBearerToken(req),
    );
    const body = await req.json().catch(() => ({}));
    const action = cleanText(body.action);
    const companyLegacyId = cleanText(body.companyLegacyId);
    if (!ACTIONS.has(action)) {
      return respond({ error: "Choose a valid pipeline configuration action." }, 400);
    }
    if (!companyLegacyId) return respond({ error: "Missing company id." }, 400);

    const { data: company, error: companyError } = await supabase
      .from("companies")
      .select("id, legacy_glide_row_id, migration_status")
      .eq("legacy_glide_row_id", companyLegacyId)
      .in("migration_status", ["pilot", "migrated"])
      .maybeSingle();
    if (companyError) throw companyError;
    if (!company) {
      return respond(
        { error: "This company is not enabled for app-owned Pipeline configuration." },
        400,
      );
    }

    const actor = await resolveConfigurationActor(
      supabase,
      authenticatedActor,
      company.id,
    );

    if (action === "list_configuration") {
      return respond({
        ok: true,
        ...(await listConfiguration(supabase, company.id)),
      });
    }

    if (action === "update_role_access") {
      if (actor.role !== "super_admin") {
        throw new AuthError(
          "Only a Super Admin can change Pipeline role access.",
          403,
        );
      }
      for (const key of [
        "directorAccessEnabled",
        "supportAccessEnabled",
        "csmAccessEnabled",
        "viewerAccessEnabled",
      ]) {
        if (typeof body[key] !== "boolean") {
          throw new AuthError(`${key} must be true or false.`, 400);
        }
      }
      const { data, error } = await supabase.rpc(
        "update_company_pipeline_role_access_with_audit",
        {
          p_company_id: company.id,
          p_director_access: body.directorAccessEnabled,
          p_support_access: body.supportAccessEnabled,
          p_csm_access: body.csmAccessEnabled,
          p_viewer_access: body.viewerAccessEnabled,
          p_actor_auth_user_id: authenticatedActor.id,
          p_actor_member_id: actor.memberId,
          p_actor_role: actor.role,
        },
      );
      if (error) throw error;
      return respond({
        ok: true,
        settings: Array.isArray(data) ? data[0] : data,
        ...(await listConfiguration(supabase, company.id)),
      });
    }

    if (action === "create_starters") {
      const { data: existing, error: existingError } = await supabase
        .from("company_pipelines")
        .select("id, pipeline_type, name")
        .eq("company_id", company.id)
        .is("archived_at", null);
      if (existingError) throw existingError;
      const existingTypes = new Set((existing ?? []).map((row) => row.pipeline_type));
      const missingStarters = STARTERS
        .filter((starter) => !existingTypes.has(starter.pipelineType))
        .map((starter) => ({
            name: starter.name,
            pipeline_type: starter.pipelineType,
            position: starter.position,
            is_enabled: false,
            value_source: starter.valueSource,
            default_estimated_value_cents: null,
            currency_code: "USD",
            renewal_lead_days: 90,
            default_follow_up_days: null,
            entry_rules: {
              include_auto_renew: false,
              include_month_to_month: false,
            },
            automation_settings: {},
            metadata: { created_from: "pipeline_starter" },
            stages: starter.stages.map((stage, index) => ({
              name: stage.name,
              color: stage.color,
              stage_type: stage.stageType,
              position: (index + 1) * 10,
              requires_note: stage.stageType === "lost",
              is_enabled: true,
              metadata: { created_from: "pipeline_starter" },
            })),
          }));
      const created = missingStarters.length > 0
        ? await applyConfigurationMutation(
            supabase,
            company.id,
            authenticatedActor,
            actor,
            "create_starters",
            null,
            { pipelines: missingStarters },
            "company_pipeline_starter_created",
            "Pipeline starters created",
            "Disabled Pipeline starters were created.",
          )
        : [];
      return respond({
        ok: true,
        created: Array.isArray(created) ? created : [],
        existingTypes: [...existingTypes],
        ...(await listConfiguration(supabase, company.id)),
      });
    }

    if (action === "update_pipeline_automation") {
      const pipelineId = cleanText(body.pipelineId);
      if (!pipelineId) throw new AuthError("Missing pipeline id.", 400);
      const existing = await loadPipeline(supabase, company.id, pipelineId);
      if (existing.archived_at || existing.is_enabled !== true) {
        throw new AuthError(
          "Enable this pipeline before configuring its automations.",
          409,
        );
      }
      for (const key of [
        "autoCreateRenewals",
        "renewalGenerationEnabled",
        "offboardSyncEnabled",
        "stageTaskCreationEnabled",
        "automationPaused",
      ]) {
        if (typeof body[key] !== "boolean") {
          throw new AuthError(`${key} must be true or false.`, 400);
        }
      }
      const catchUpDays = boundedInteger(
        body.catchUpDays,
        "Renewal catch-up days",
        0,
        365,
        30,
      );
      const entryStageId = cleanText(body.entryStageId) || null;
      const { data, error } = await supabase.rpc(
        "configure_pipeline_automation_with_audit",
        {
          p_company_id: company.id,
          p_pipeline_id: pipelineId,
          p_auto_create_renewal_items: body.autoCreateRenewals,
          p_renewal_generation_enabled: body.renewalGenerationEnabled,
          p_entry_stage_id: entryStageId,
          p_catch_up_days: catchUpDays,
          p_offboard_sync_enabled: body.offboardSyncEnabled,
          p_stage_task_creation_enabled: body.stageTaskCreationEnabled,
          p_automation_paused: body.automationPaused,
          p_actor_auth_user_id: authenticatedActor.id,
          p_actor_member_id: actor.memberId,
          p_actor_role: actor.role,
        },
      );
      if (error) throw error;
      const pipeline = Array.isArray(data) ? data[0] : data;
      return respond({ ok: true, pipeline });
    }

    if (action === "create_pipeline") {
      const name = requiredName(body.name, "Pipeline");
      const type = pipelineType(body.pipelineType);
      const source = valueSource(body.valueSource ?? "none");
      if (source === "current_contract" && type !== "renewal") {
        throw new AuthError(
          "Current-contract value is available only for renewal pipelines.",
          400,
        );
      }
      const defaultValue = optionalCents(body.defaultEstimatedValueCents);
      if (source === "fixed" && defaultValue === null) {
        throw new AuthError("Fixed-value pipelines require a default value.", 400);
      }
      const pipelinePayload = {
        name,
        pipeline_type: type,
        position: boundedInteger(body.position, "Position", 0, 10000, 0),
        is_enabled: false,
        value_source: source,
        default_estimated_value_cents: source === "none" ? null : defaultValue,
        currency_code: currencyCode(body.currencyCode),
        renewal_lead_days: boundedInteger(
          body.renewalLeadDays,
          "Renewal lead days",
          0,
          365,
          90,
        ),
        default_follow_up_days: optionalBoundedInteger(
          body.defaultFollowUpDays,
          "Default follow-up days",
          0,
          365,
        ),
        entry_rules: normalizeEntryRules(body.entryRules),
        automation_settings: body.automationSettings === undefined
          ? {}
          : validatedObject(body.automationSettings, "Automation settings"),
        metadata: { created_from: "manage-company-pipeline" },
      };
      const pipeline = await applyConfigurationMutation(
        supabase,
        company.id,
        authenticatedActor,
        actor,
        "create_pipeline",
        null,
        pipelinePayload,
        "company_pipeline_created",
        "Pipeline created",
        `${name} was created disabled.`,
      );
      return respond({ ok: true, pipeline });
    }

    if (action === "update_pipeline") {
      const pipelineId = cleanText(body.pipelineId);
      if (!pipelineId) throw new AuthError("Missing pipeline id.", 400);
      const existing = await loadPipeline(supabase, company.id, pipelineId);
      if (existing.archived_at) throw new AuthError("Pipeline is archived.", 409);
      const update: Record<string, unknown> = {};
      if (body.name !== undefined) update.name = requiredName(body.name, "Pipeline");
      if (body.pipelineType !== undefined) {
        const nextType = pipelineType(body.pipelineType);
        if (nextType !== existing.pipeline_type) {
          const itemCount = await nonArchivedItemCount(supabase, company.id, {
            pipelineId,
          });
          if (itemCount > 0) {
            return respond(
              {
                error: "Move or archive pipeline items before changing pipeline type.",
                itemCount,
              },
              409,
            );
          }
        }
        update.pipeline_type = nextType;
      }
      const nextType = String(update.pipeline_type ?? existing.pipeline_type);
      if (body.position !== undefined) {
        update.position = boundedInteger(body.position, "Position", 0, 10000);
      }
      if (body.valueSource !== undefined) {
        update.value_source = valueSource(body.valueSource);
      }
      const nextSource = String(update.value_source ?? existing.value_source);
      if (nextSource === "current_contract" && nextType !== "renewal") {
        throw new AuthError(
          "Current-contract value is available only for renewal pipelines.",
          400,
        );
      }
      if (body.defaultEstimatedValueCents !== undefined) {
        update.default_estimated_value_cents = optionalCents(
          body.defaultEstimatedValueCents,
        );
      }
      const nextDefaultValue = Object.prototype.hasOwnProperty.call(
          update,
          "default_estimated_value_cents",
        )
        ? update.default_estimated_value_cents
        : existing.default_estimated_value_cents;
      if (nextSource === "fixed" && nextDefaultValue === null) {
        throw new AuthError("Fixed-value pipelines require a default value.", 400);
      }
      if (nextSource === "none") update.default_estimated_value_cents = null;
      if (body.currencyCode !== undefined) {
        update.currency_code = currencyCode(body.currencyCode);
      }
      if (body.renewalLeadDays !== undefined) {
        update.renewal_lead_days = boundedInteger(
          body.renewalLeadDays,
          "Renewal lead days",
          0,
          365,
        );
      }
      if (body.defaultFollowUpDays !== undefined) {
        update.default_follow_up_days = optionalBoundedInteger(
          body.defaultFollowUpDays,
          "Default follow-up days",
          0,
          365,
        );
      }
      if (body.entryRules !== undefined) {
        update.entry_rules = normalizeEntryRules(body.entryRules, existing.entry_rules);
      }
      if (
        body.includeAutoRenew !== undefined ||
        body.includeMonthToMonth !== undefined
      ) {
        if (
          body.includeAutoRenew !== undefined &&
          typeof body.includeAutoRenew !== "boolean"
        ) {
          throw new AuthError("Include auto-renew must be true or false.", 400);
        }
        if (
          body.includeMonthToMonth !== undefined &&
          typeof body.includeMonthToMonth !== "boolean"
        ) {
          throw new AuthError(
            "Include month-to-month must be true or false.",
            400,
          );
        }
        update.entry_rules = normalizeEntryRules(
          {
            include_auto_renew:
              body.includeAutoRenew === undefined
                ? objectValue(existing.entry_rules).include_auto_renew
                : body.includeAutoRenew,
            include_month_to_month:
              body.includeMonthToMonth === undefined
                ? objectValue(existing.entry_rules).include_month_to_month
                : body.includeMonthToMonth,
          },
          update.entry_rules ?? existing.entry_rules,
        );
      }
      if (body.automationSettings !== undefined) {
        update.automation_settings = {
          ...objectValue(existing.automation_settings),
          ...validatedObject(body.automationSettings, "Automation settings"),
        };
      }
      if (body.isEnabled !== undefined) {
        if (typeof body.isEnabled !== "boolean") {
          throw new AuthError("Pipeline enabled state must be true or false.", 400);
        }
        if (body.isEnabled) {
          await assertPipelineCanEnable(supabase, company.id, pipelineId);
        }
        update.is_enabled = body.isEnabled;
      }
      if (Object.keys(update).length === 0) {
        throw new AuthError("No pipeline changes were provided.", 400);
      }
      const pipeline = await applyConfigurationMutation(
        supabase,
        company.id,
        authenticatedActor,
        actor,
        "update_pipeline",
        pipelineId,
        update,
        "company_pipeline_updated",
        "Pipeline updated",
        `${String(update.name ?? existing.name)} configuration was updated.`,
      );
      return respond({ ok: true, pipeline });
    }

    if (action === "archive_pipeline") {
      const pipelineId = cleanText(body.pipelineId);
      if (!pipelineId) throw new AuthError("Missing pipeline id.", 400);
      const existing = await loadPipeline(supabase, company.id, pipelineId);
      if (existing.archived_at) return respond({ ok: true, pipeline: existing });
      const itemCount = await nonArchivedItemCount(supabase, company.id, {
        pipelineId,
      });
      if (itemCount > 0) {
        return respond(
          {
            error: "Archive all pipeline items before archiving this pipeline.",
            itemCount,
          },
          409,
        );
      }
      const pipeline = await applyConfigurationMutation(
        supabase,
        company.id,
        authenticatedActor,
        actor,
        "archive_pipeline",
        pipelineId,
        { is_enabled: false, archived_at: new Date().toISOString() },
        "company_pipeline_archived",
        "Pipeline archived",
        `${String(existing.name)} was archived.`,
      );
      return respond({ ok: true, pipeline, itemCount: 0 });
    }

    if (action === "reorder_pipelines") {
      const pipelineIds = Array.isArray(body.pipelineIds)
        ? body.pipelineIds.map(cleanText).filter(Boolean)
        : [];
      if (pipelineIds.length === 0 || new Set(pipelineIds).size !== pipelineIds.length) {
        throw new AuthError("Provide a unique ordered list of active pipeline ids.", 400);
      }
      const { data: siblings, error: siblingsError } = await supabase
        .from("company_pipelines")
        .select("id, name, position")
        .eq("company_id", company.id)
        .is("archived_at", null)
        .order("position", { ascending: true });
      if (siblingsError) throw siblingsError;
      const siblingIds = (siblings ?? []).map((pipeline) => pipeline.id as string);
      const requested = new Set(pipelineIds);
      const missingIds = siblingIds.filter((id) => !requested.has(id));
      const unknownIds = pipelineIds.filter((id) => !siblingIds.includes(id));
      if (missingIds.length > 0 || unknownIds.length > 0) {
        return respond(
          {
            error: "Reorder must include every active pipeline for this company.",
            missingIds,
            unknownIds,
          },
          400,
        );
      }
      const pipelines = await applyConfigurationMutation(
        supabase,
        company.id,
        authenticatedActor,
        actor,
        "reorder_pipelines",
        null,
        { pipeline_ids: pipelineIds },
        "company_pipelines_reordered",
        "Pipelines reordered",
        "Company pipelines were reordered.",
      );
      return respond({ ok: true, pipelines: Array.isArray(pipelines) ? pipelines : [] });
    }

    if (action === "create_stage") {
      const pipelineId = cleanText(body.pipelineId);
      if (!pipelineId) throw new AuthError("Missing pipeline id.", 400);
      const pipeline = await loadPipeline(supabase, company.id, pipelineId);
      if (pipeline.archived_at) throw new AuthError("Pipeline is archived.", 409);
      const type = stageType(body.stageType ?? "open");
      await assertTerminalSlotAvailable(
        supabase,
        company.id,
        pipelineId,
        type,
      );
      let position = optionalBoundedInteger(body.position, "Position", 0, 10000);
      if (position === null) {
        const { data: lastStage, error: lastStageError } = await supabase
          .from("company_pipeline_stages")
          .select("position")
          .eq("company_id", company.id)
          .eq("pipeline_id", pipelineId)
          .is("archived_at", null)
          .order("position", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (lastStageError) throw lastStageError;
        position = Math.min(10000, Number(lastStage?.position ?? 0) + 10);
      }
      if (
        body.requiresNote !== undefined &&
        typeof body.requiresNote !== "boolean"
      ) {
        throw new AuthError("Requires-note must be true or false.", 400);
      }
      const stageName = requiredName(body.name, "Stage");
      const stage = await applyConfigurationMutation(
        supabase,
        company.id,
        authenticatedActor,
        actor,
        "create_stage",
        null,
        {
          pipeline_id: pipelineId,
          name: stageName,
          color: stageColor(body.color),
          stage_type: type,
          position,
          requires_note: body.requiresNote ?? false,
          is_enabled: true,
          metadata: { created_from: "manage-company-pipeline" },
        },
        "company_pipeline_stage_created",
        "Pipeline stage created",
        `${stageName} was added to ${String(pipeline.name)}.`,
      );
      return respond({ ok: true, stage });
    }

    if (action === "update_stage") {
      const stageId = cleanText(body.stageId);
      if (!stageId) throw new AuthError("Missing stage id.", 400);
      const existing = await loadStage(supabase, company.id, stageId);
      if (existing.archived_at) throw new AuthError("Pipeline stage is archived.", 409);
      const pipeline = await loadPipeline(
        supabase,
        company.id,
        String(existing.pipeline_id),
      );
      if (pipeline.archived_at) throw new AuthError("Pipeline is archived.", 409);
      const update: Record<string, unknown> = {};
      if (body.name !== undefined) update.name = requiredName(body.name, "Stage");
      if (body.color !== undefined) update.color = stageColor(body.color);
      if (body.position !== undefined) {
        update.position = boundedInteger(body.position, "Position", 0, 10000);
      }
      if (body.requiresNote !== undefined) {
        if (typeof body.requiresNote !== "boolean") {
          throw new AuthError("Requires-note must be true or false.", 400);
        }
        update.requires_note = body.requiresNote;
      }
      if (body.stageType !== undefined) {
        const nextType = stageType(body.stageType);
        if (nextType !== existing.stage_type) {
          if (TERMINAL_STAGE_TYPES.has(String(existing.stage_type))) {
            throw new AuthError(
              "Won and Lost terminal stages cannot change type.",
              409,
            );
          }
          if (
            existing.stage_type === "open" &&
            pipeline.is_enabled === true
          ) {
            const openCount = await activeStageTypeCount(
              supabase,
              company.id,
              String(existing.pipeline_id),
              "open",
            );
            if (openCount <= 1) {
              throw new AuthError(
                "An enabled pipeline must keep at least one open stage.",
                409,
              );
            }
          }
          const itemCount = await nonArchivedItemCount(supabase, company.id, {
            stageId,
          });
          if (itemCount > 0) {
            return respond(
              {
                error: "Move or archive stage items before changing stage type.",
                itemCount,
              },
              409,
            );
          }
          await assertTerminalSlotAvailable(
            supabase,
            company.id,
            String(existing.pipeline_id),
            nextType,
            stageId,
          );
        }
        update.stage_type = nextType;
      }
      if (Object.keys(update).length === 0) {
        throw new AuthError("No stage changes were provided.", 400);
      }
      const stage = await applyConfigurationMutation(
        supabase,
        company.id,
        authenticatedActor,
        actor,
        "update_stage",
        stageId,
        update,
        "company_pipeline_stage_updated",
        "Pipeline stage updated",
        `${String(update.name ?? existing.name)} was updated.`,
      );
      return respond({ ok: true, stage });
    }

    if (action === "reorder_stages") {
      const pipelineId = cleanText(body.pipelineId);
      const stageIds = Array.isArray(body.stageIds)
        ? body.stageIds.map(cleanText).filter(Boolean)
        : [];
      if (!pipelineId) throw new AuthError("Missing pipeline id.", 400);
      if (stageIds.length === 0 || new Set(stageIds).size !== stageIds.length) {
        throw new AuthError("Provide a unique ordered list of active stage ids.", 400);
      }
      const pipeline = await loadPipeline(supabase, company.id, pipelineId);
      if (pipeline.archived_at) throw new AuthError("Pipeline is archived.", 409);
      const { data: siblings, error: siblingsError } = await supabase
        .from("company_pipeline_stages")
        .select("id, name, position")
        .eq("company_id", company.id)
        .eq("pipeline_id", pipelineId)
        .eq("is_enabled", true)
        .is("archived_at", null)
        .order("position", { ascending: true });
      if (siblingsError) throw siblingsError;
      const siblingIds = (siblings ?? []).map((stage) => stage.id as string);
      const requested = new Set(stageIds);
      const missingIds = siblingIds.filter((id) => !requested.has(id));
      const unknownIds = stageIds.filter((id) => !siblingIds.includes(id));
      if (missingIds.length > 0 || unknownIds.length > 0) {
        return respond(
          {
            error: "Reorder must include every active stage in this pipeline.",
            missingIds,
            unknownIds,
          },
          400,
        );
      }
      const stages = await applyConfigurationMutation(
        supabase,
        company.id,
        authenticatedActor,
        actor,
        "reorder_stages",
        pipelineId,
        { stage_ids: stageIds },
        "company_pipeline_stages_reordered",
        "Pipeline stages reordered",
        `${String(pipeline.name)} stages were reordered.`,
      );
      return respond({ ok: true, stages: Array.isArray(stages) ? stages : [] });
    }

    if (action === "archive_stage") {
      const stageId = cleanText(body.stageId);
      if (!stageId) throw new AuthError("Missing stage id.", 400);
      const existing = await loadStage(supabase, company.id, stageId);
      if (existing.archived_at) return respond({ ok: true, stage: existing });
      const itemCount = await nonArchivedItemCount(supabase, company.id, {
        stageId,
      });
      if (itemCount > 0) {
        return respond(
          {
            error: "Move or archive stage items before archiving this stage.",
            itemCount,
          },
          409,
        );
      }
      if (TERMINAL_STAGE_TYPES.has(String(existing.stage_type))) {
        return respond(
          {
            error: "Won and Lost terminal stages cannot be archived.",
            itemCount: 0,
            terminalStageCount: 1,
          },
          409,
        );
      }
      const pipeline = await loadPipeline(
        supabase,
        company.id,
        String(existing.pipeline_id),
      );
      if (existing.stage_type === "open" && pipeline.is_enabled === true) {
        const openCount = await activeStageTypeCount(
          supabase,
          company.id,
          String(existing.pipeline_id),
          "open",
        );
        if (openCount <= 1) {
          return respond(
            {
              error: "An enabled pipeline must keep at least one open stage.",
              itemCount: 0,
              openStageCount: openCount,
            },
            409,
          );
        }
      }
      const stage = await applyConfigurationMutation(
        supabase,
        company.id,
        authenticatedActor,
        actor,
        "archive_stage",
        stageId,
        { is_enabled: false, archived_at: new Date().toISOString() },
        "company_pipeline_stage_archived",
        "Pipeline stage archived",
        `${String(existing.name)} was archived.`,
      );
      return respond({ ok: true, stage, itemCount: 0 });
    }

    return respond({ error: "Unsupported pipeline configuration action." }, 400);
  } catch (error) {
    console.error("manage-company-pipeline failed", error);
    return sharedJsonResponse(
      req,
      {
        error: error instanceof AuthError
          ? error.message
          : "Unexpected pipeline configuration error.",
      },
      error instanceof AuthError ? error.status : 500,
    );
  }
});
