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
import { jsonResponse, optionsResponse } from "../_shared/http.ts";

const ACTIONS = new Set([
  "access",
  "workspace",
  "create_item",
  "update_item",
  "move_stage",
  "archive_item",
  "resolve_pipeline_won",
  "resolve_pipeline_lost",
  "run_renewal_scan",
]);
const OPERATOR_ROLES = new Set(["director", "support", "csm"]);
const ACTIVE_CLIENT_STATUSES = new Set(["front-end", "back-end", "paused", "suspended"]);

type ActorContext = {
  role: "super_admin" | "director" | "support" | "csm" | "viewer";
  memberId: string | null;
  legacyMemberId: string | null;
};

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

function boundedInteger(value: unknown, min: number, max: number) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  const rounded = Math.round(parsed);
  return rounded >= min && rounded <= max ? rounded : null;
}

function nonnegativeCents(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new AuthError("Value must be non-negative whole cents.", 400);
  }
  return parsed;
}

function optionalDate(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = new Date(String(value));
  if (Number.isNaN(parsed.getTime())) {
    throw new AuthError("Choose a valid date.", 400);
  }
  return parsed.toISOString();
}

function currencyCode(value: unknown, fallback = "USD") {
  const code = (cleanText(value) || fallback).toUpperCase();
  if (!/^[A-Z]{3}$/.test(code)) {
    throw new AuthError("Currency must be a three-letter code such as USD.", 400);
  }
  return code;
}

function assignmentIds(actor: ActorContext) {
  return [actor.memberId, actor.legacyMemberId].filter(
    (value): value is string => Boolean(value),
  );
}

async function resolveActor(
  supabase: SupabaseServiceClient,
  authenticatedActor: AuthenticatedActor,
  companyId: string,
): Promise<ActorContext> {
  if (await isRegisteredSuperAdmin(supabase, authenticatedActor)) {
    return { role: "super_admin", memberId: null, legacyMemberId: null };
  }

  const select = "id, legacy_glide_row_id, role, status, is_read_only";
  const { data: byAuth, error: byAuthError } = await supabase
    .from("company_members")
    .select(select)
    .eq("company_id", companyId)
    .eq("auth_user_id", authenticatedActor.id)
    .maybeSingle();
  if (byAuthError) throw byAuthError;

  let membership = byAuth;
  if (!membership) {
    const { data: byEmail, error: byEmailError } = await supabase
      .from("company_members")
      .select(select)
      .eq("company_id", companyId)
      .eq("email", normalizeEmail(authenticatedActor.email))
      .maybeSingle();
    if (byEmailError) throw byEmailError;
    membership = byEmail;
  }

  if (!membership || membership.status !== "active") {
    throw new AuthError("No active Pipeline membership was found.", 403);
  }
  const role = membership.is_read_only === true || membership.role === "viewer"
    ? "viewer"
    : membership.role;
  if (!["director", "support", "csm", "viewer"].includes(role)) {
    throw new AuthError("Your role cannot access Pipeline.", 403);
  }
  return {
    role: role as ActorContext["role"],
    memberId: membership.id as string,
    legacyMemberId: membership.legacy_glide_row_id as string | null,
  };
}

async function loadCompany(
  supabase: SupabaseServiceClient,
  companyLegacyId: string,
) {
  const { data, error } = await supabase
    .from("companies")
    .select("id, legacy_glide_row_id, migration_status")
    .eq("legacy_glide_row_id", companyLegacyId)
    .in("migration_status", ["pilot", "migrated"])
    .maybeSingle();
  if (error) throw error;
  if (!data) {
    throw new AuthError("Pipeline requires an app-owned company.", 400);
  }
  return data;
}

async function loadSettings(supabase: SupabaseServiceClient, companyId: string) {
  const { data, error } = await supabase
    .from("company_settings")
    .select("enable_pipeline, enable_pipeline_viewer_access")
    .eq("company_id", companyId)
    .maybeSingle();
  if (error) throw error;
  return {
    enabled: data?.enable_pipeline === true,
    viewerAccess: data?.enable_pipeline_viewer_access === true,
  };
}

function assertReadable(actor: ActorContext, settings: { enabled: boolean; viewerAccess: boolean }) {
  if (!settings.enabled) throw new AuthError("Pipeline is disabled for this company.", 403);
  if (actor.role === "viewer" && !settings.viewerAccess) {
    throw new AuthError("Viewer Pipeline access is disabled.", 403);
  }
}

function assertWritable(actor: ActorContext) {
  if (actor.role === "viewer" || !OPERATOR_ROLES.has(actor.role) && actor.role !== "super_admin") {
    throw new AuthError("You have read-only Pipeline access.", 403);
  }
}

function clientAssignedToActor(client: Record<string, unknown>, actor: ActorContext) {
  if (actor.role !== "csm") return true;
  const ids = assignmentIds(actor);
  return ids.includes(String(client.csm_team_member_id ?? "")) ||
    ids.includes(String(client.csm_secondary_assignee_id ?? ""));
}

async function loadScopedClients(
  supabase: SupabaseServiceClient,
  companyId: string,
  actor: ActorContext,
) {
  if (actor.role === "viewer") return [];
  const rows: Record<string, unknown>[] = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from("clients")
      .select(
        "id, glide_row_id, client_name, client_business, client_image, program_status_value, offer_milestones_current_offer_id, csm_team_member_id, csm_secondary_assignee_id, current_contract_end_date, current_contract_end_date_for_filtering, current_contract_monthly_value",
      )
      .eq("company_id", companyId)
      .is("archived_at", null)
      .range(from, from + pageSize - 1);
    if (error) throw error;
    const page = (data ?? []) as Record<string, unknown>[];
    rows.push(
      ...page.filter(
        (client) =>
          ACTIVE_CLIENT_STATUSES.has(String(client.program_status_value ?? "")) &&
          clientAssignedToActor(client, actor),
      ),
    );
    if (page.length < pageSize) break;
  }
  return rows;
}

async function loadWorkspace(
  supabase: SupabaseServiceClient,
  company: Record<string, unknown>,
  actor: ActorContext,
  settings: { enabled: boolean; viewerAccess: boolean },
) {
  assertReadable(actor, settings);
  const companyId = String(company.id);
  const clients = await loadScopedClients(supabase, companyId, actor);
  const allowedClientIds = new Set(clients.map((client) => String(client.id)));

  const [pipelinesResult, stagesResult, itemsResult, membersResult, offersResult] =
    await Promise.all([
      supabase.from("company_pipelines").select("*").eq("company_id", companyId).eq("is_enabled", true).is("archived_at", null).order("position"),
      supabase.from("company_pipeline_stages").select("*").eq("company_id", companyId).eq("is_enabled", true).is("archived_at", null).order("position"),
      supabase.from("client_pipeline_items").select("*").eq("company_id", companyId).is("archived_at", null).order("updated_at", { ascending: false }),
      supabase.from("company_members").select("id, legacy_glide_row_id, name, role, status, is_read_only, hide_from_csm_list").eq("company_id", companyId).eq("status", "active").eq("is_read_only", false).neq("role", "viewer").order("name"),
      supabase.from("company_offers").select("glide_row_id, name").eq("company_id", companyId).eq("status", "active"),
    ]);
  for (const result of [pipelinesResult, stagesResult, itemsResult, membersResult, offersResult]) {
    if (result.error) throw result.error;
  }

  const offers = new Map(
    (offersResult.data ?? []).map((offer) => [String(offer.glide_row_id), offer.name]),
  );
  const clientPayload = clients.map((client) => ({
    ...client,
    pathway_id: client.offer_milestones_current_offer_id ?? null,
    pathway_name: offers.get(String(client.offer_milestones_current_offer_id ?? "")) ?? null,
  }));
  const rawItems = (itemsResult.data ?? []) as Record<string, unknown>[];
  const items = actor.role === "csm"
    ? rawItems.filter((item) => allowedClientIds.has(String(item.client_id)))
    : rawItems;

  return {
    enabled: true,
    viewerAccess: settings.viewerAccess,
    canWrite: actor.role !== "viewer",
    actorRole: actor.role,
    pipelines: pipelinesResult.data ?? [],
    stages: stagesResult.data ?? [],
    items,
    clients: clientPayload,
    members: membersResult.data ?? [],
    offers: offersResult.data ?? [],
  };
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
    .eq("is_enabled", true)
    .is("archived_at", null)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new AuthError("Pipeline is not enabled.", 400);
  return data;
}

async function loadStage(
  supabase: SupabaseServiceClient,
  companyId: string,
  pipelineId: string,
  stageId: string,
) {
  const { data, error } = await supabase
    .from("company_pipeline_stages")
    .select("*")
    .eq("id", stageId)
    .eq("pipeline_id", pipelineId)
    .eq("company_id", companyId)
    .eq("is_enabled", true)
    .is("archived_at", null)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new AuthError("Pipeline stage was not found.", 400);
  return data;
}

async function loadClientForWrite(
  supabase: SupabaseServiceClient,
  companyId: string,
  clientId: string,
  actor: ActorContext,
) {
  const { data, error } = await supabase
    .from("clients")
    .select(
      "id, glide_row_id, client_name, client_business, program_status_value, offer_milestones_current_offer_id, csm_team_member_id, csm_secondary_assignee_id, current_contract_end_date, current_contract_end_date_for_filtering, current_contract_monthly_value",
    )
    .eq("id", clientId)
    .eq("company_id", companyId)
    .is("archived_at", null)
    .maybeSingle();
  if (error) throw error;
  if (!data || !ACTIVE_CLIENT_STATUSES.has(String(data.program_status_value ?? ""))) {
    throw new AuthError("Choose an active app-owned client.", 400);
  }
  if (!clientAssignedToActor(data as Record<string, unknown>, actor)) {
    throw new AuthError("CSMs can manage Pipeline items for assigned clients only.", 403);
  }
  return data;
}

async function validateOwner(
  supabase: SupabaseServiceClient,
  companyId: string,
  ownerMemberId: string | null,
  actor: ActorContext,
) {
  if (actor.role === "csm") return actor.memberId;
  if (!ownerMemberId) return null;
  const { data, error } = await supabase
    .from("company_members")
    .select("id, status, role, is_read_only")
    .eq("id", ownerMemberId)
    .eq("company_id", companyId)
    .eq("status", "active")
    .maybeSingle();
  if (error) throw error;
  if (!data || data.is_read_only === true || data.role === "viewer") {
    throw new AuthError("Choose an active operational owner.", 400);
  }
  return data.id as string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return optionsResponse(req);
  const respond = (body: unknown, status = 200) => jsonResponse(req, body, status);
  if (req.method !== "POST") return respond({ error: "Method not allowed" }, 405);

  try {
    const supabase = createServiceClient();
    const authenticatedActor = await requireAuthenticatedActor(
      supabase,
      getBearerToken(req),
    );
    const body = await req.json().catch(() => ({}));
    const action = cleanText(body.action);
    const companyLegacyId = cleanText(body.companyLegacyId);
    if (!ACTIONS.has(action)) return respond({ error: "Choose a valid Pipeline action." }, 400);
    if (!companyLegacyId) return respond({ error: "Missing company." }, 400);

    const company = await loadCompany(supabase, companyLegacyId);
    const actor = await resolveActor(supabase, authenticatedActor, company.id);
    const settings = await loadSettings(supabase, company.id);

    if (action === "access") {
      return respond({
        enabled: settings.enabled,
        viewerAccess: settings.viewerAccess,
        actorRole: actor.role,
      });
    }

    if (action === "workspace") {
      if (!settings.enabled || actor.role === "viewer" && !settings.viewerAccess) {
        return respond({
          enabled: false,
          viewerAccess: settings.viewerAccess,
          canWrite: false,
          actorRole: actor.role,
          pipelines: [],
          stages: [],
          items: [],
          clients: [],
          members: [],
          offers: [],
        });
      }
      return respond(await loadWorkspace(supabase, company, actor, settings));
    }

    assertReadable(actor, settings);
    assertWritable(actor);

    if (action === "run_renewal_scan") {
      if (actor.role !== "super_admin") {
        throw new AuthError("Only a Super Admin can run renewal materialization during the local pilot.", 403);
      }
      const asOf = optionalDate(body.asOf) ?? new Date().toISOString();
      const runKey = cleanText(body.runKey) ||
        `manual:${company.id}:${asOf.slice(0, 10)}:${crypto.randomUUID()}`;
      const { data, error } = await supabase.rpc(
        "generate_due_renewal_pipeline_items",
        {
          p_company_id: company.id,
          p_as_of: asOf,
          p_run_key: runKey,
          p_requested_by_auth_user_id: authenticatedActor.id,
          p_requested_by_member_id: actor.memberId,
        },
      );
      if (error) throw error;
      const result = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | null;
      if (typeof result?.error === "string" && result.error) {
        throw new AuthError(result.error, 500);
      }
      return respond({
        ok: true,
        runKey,
        createdCount: Number(result?.created_count ?? 0),
        skippedCount: Number(result?.skipped_count ?? 0),
        items: result?.items ?? [],
      });
    }

    if (action === "create_item") {
      const pipelineId = cleanText(body.pipelineId);
      const clientId = cleanText(body.clientId);
      if (!pipelineId || !clientId) return respond({ error: "Choose a pipeline and client." }, 400);
      const pipeline = await loadPipeline(supabase, company.id, pipelineId);
      const client = await loadClientForWrite(supabase, company.id, clientId, actor);
      let stageId = cleanText(body.stageId);
      if (!stageId) {
        const { data: firstStage, error: firstStageError } = await supabase
          .from("company_pipeline_stages")
          .select("id")
          .eq("company_id", company.id)
          .eq("pipeline_id", pipeline.id)
          .eq("is_enabled", true)
          .is("archived_at", null)
          .order("position")
          .limit(1)
          .maybeSingle();
        if (firstStageError) throw firstStageError;
        stageId = firstStage?.id ?? "";
      }
      if (!stageId) return respond({ error: "Configure a stage before adding items." }, 400);
      const stage = await loadStage(supabase, company.id, pipeline.id, stageId);
      if (stage.stage_type !== "open") {
        return respond({ error: "New Pipeline items must start in an Open stage." }, 400);
      }
      if (stage.requires_note && !nullableText(body.note)) {
        return respond({ error: "This stage requires a note." }, 400);
      }
      const ownerMemberId = await validateOwner(
        supabase,
        company.id,
        nullableText(body.ownerMemberId),
        actor,
      );
      const { data: pathway } = client.offer_milestones_current_offer_id
        ? await supabase.from("company_offers").select("name").eq("company_id", company.id).eq("glide_row_id", client.offer_milestones_current_offer_id).maybeSingle()
        : { data: null };
      let estimatedValueCents = nonnegativeCents(body.estimatedValueCents);
      if (estimatedValueCents === null && pipeline.value_source === "fixed") {
        estimatedValueCents = pipeline.default_estimated_value_cents;
      }
      if (estimatedValueCents === null && pipeline.value_source === "current_contract") {
        const monthlyValue = Number(client.current_contract_monthly_value);
        estimatedValueCents = Number.isFinite(monthlyValue)
          ? Math.max(0, Math.round(monthlyValue * 100))
          : null;
      }
      const metadata = {
        created_in: "pipeline_phase_0_2",
        actor_role: actor.role,
        client_legacy_id: client.glide_row_id,
      };
      const createRpc = pipeline.pipeline_type === "expansion"
        ? "create_expansion_pipeline_item_with_target"
        : "create_pipeline_item_with_evidence";
      const createArgs = pipeline.pipeline_type === "expansion"
        ? {
          p_company_id: company.id,
          p_client_id: client.id,
          p_pipeline_id: pipeline.id,
          p_stage_id: stage.id,
          p_owner_member_id: ownerMemberId,
          p_client_name_snapshot: client.client_name || client.client_business || "Unnamed client",
          p_client_business_snapshot: client.client_business,
          p_pathway_id_snapshot: client.offer_milestones_current_offer_id,
          p_pathway_name_snapshot: pathway?.name ?? null,
          p_estimated_value_cents: estimatedValueCents,
          p_currency_code: currencyCode(body.currencyCode, pipeline.currency_code || "USD"),
          p_expected_close_at: optionalDate(body.expectedCloseDate ?? body.expectedCloseAt),
          p_follow_up_at: optionalDate(body.followUpDate ?? body.followUpAt),
          p_current_note: nullableText(body.note),
          p_metadata: metadata,
          p_target_offer_id: nullableText(body.targetOfferId),
          p_actor_auth_user_id: authenticatedActor.id,
          p_actor_member_id: actor.memberId,
          p_actor_role: actor.role,
        }
        : {
          p_company_id: company.id,
          p_client_id: client.id,
          p_pipeline_id: pipeline.id,
          p_stage_id: stage.id,
          p_owner_member_id: ownerMemberId,
          p_client_name_snapshot: client.client_name || client.client_business || "Unnamed client",
          p_client_business_snapshot: client.client_business,
          p_pathway_id_snapshot: client.offer_milestones_current_offer_id,
          p_pathway_name_snapshot: pathway?.name ?? null,
          p_estimated_value_cents: estimatedValueCents,
          p_currency_code: currencyCode(body.currencyCode, pipeline.currency_code || "USD"),
          p_renewal_at: optionalDate(body.renewalDate ?? body.renewalAt ?? client.current_contract_end_date_for_filtering ?? client.current_contract_end_date),
          p_expected_close_at: optionalDate(body.expectedCloseDate ?? body.expectedCloseAt),
          p_follow_up_at: optionalDate(body.followUpDate ?? body.followUpAt),
          p_outcome: nullableText(body.outcome),
          p_current_note: nullableText(body.note),
          p_lifecycle_status: stage.stage_type,
          p_metadata: metadata,
          p_actor_auth_user_id: authenticatedActor.id,
          p_actor_member_id: actor.memberId,
          p_actor_role: actor.role,
        };
      const { data: createdItem, error: itemError } = await supabase.rpc(
        createRpc,
        createArgs,
      );
      if (itemError) throw itemError;
      const item = Array.isArray(createdItem) ? createdItem[0] : createdItem;
      return respond({ ok: true, item });
    }

    const itemId = cleanText(body.itemId);
    if (!itemId) return respond({ error: "Missing pipeline item." }, 400);
    const { data: existing, error: existingError } = await supabase
      .from("client_pipeline_items")
      .select("*")
      .eq("id", itemId)
      .eq("company_id", company.id)
      .is("archived_at", null)
      .maybeSingle();
    if (existingError) throw existingError;
    if (!existing) return respond({ error: "Pipeline item was not found." }, 404);
    const existingPipeline = await loadPipeline(supabase, company.id, existing.pipeline_id);
    const existingClient = await loadClientForWrite(supabase, company.id, existing.client_id, actor);

    if (action === "resolve_pipeline_won") {
      const startDate = optionalDate(body.startDate);
      const endDate = optionalDate(body.endDate);
      if (!startDate && !endDate) {
        return respond({ error: "Add a contract start or end date." }, 400);
      }
      const contractDays = boundedInteger(body.contractDays, 1, 3650);
      const monthlyValue = body.monthlyValue === null || body.monthlyValue === undefined || body.monthlyValue === ""
        ? null
        : Number(body.monthlyValue);
      const totalContractValue = body.totalContractValue === null || body.totalContractValue === undefined || body.totalContractValue === ""
        ? null
        : Number(body.totalContractValue);
      if (monthlyValue !== null && (!Number.isFinite(monthlyValue) || monthlyValue < 0)) {
        return respond({ error: "Monthly value must be a non-negative amount." }, 400);
      }
      if (totalContractValue !== null && (!Number.isFinite(totalContractValue) || totalContractValue < 0)) {
        return respond({ error: "Total contract value must be a non-negative amount." }, 400);
      }
      if (existingPipeline.pipeline_type === "renewal") {
        const currentStatus = String(existingClient.program_status_value ?? "");
        const targetStatus = cleanText(body.retentionTargetStatus) || currentStatus;
        const transitionTiming = cleanText(body.programStatusTransition) || "on_contract_start";
        const startsInFuture = Boolean(
          startDate && startDate.slice(0, 10) > new Date().toISOString().slice(0, 10),
        );
        const validTarget = targetStatus === currentStatus ||
          (currentStatus === "front-end" && targetStatus === "back-end");
        if (!validTarget) {
          return respond({ error: "A renewal can continue the current program or move a Front End client to Back End." }, 400);
        }
        if (!["immediate", "on_contract_start"].includes(transitionTiming)) {
          return respond({ error: "Choose when the Back End transition should happen." }, 400);
        }
        if (transitionTiming === "on_contract_start" && targetStatus !== currentStatus && !startsInFuture) {
          return respond({ error: "A scheduled Back End move requires a future contract start date." }, 400);
        }
        if (startsInFuture) {
          const { data, error } = await supabase.rpc(
            "create_scheduled_retention_contract",
            {
              p_company_id: company.id,
              p_client_id: existingClient.id,
              p_pipeline_item_id: existing.id,
              p_start_date: startDate,
              p_end_date: endDate,
              p_contract_days: contractDays,
              p_monthly_value: monthlyValue,
              p_total_contract_value: totalContractValue,
              p_reference_link: null,
              p_notes: nullableText(body.note),
              p_auto_renew: body.autoRenew === true,
              p_currency_code: existingPipeline.currency_code || "USD",
              p_retention_type: targetStatus === currentStatus ? "renewal" : "upsell",
              p_target_status: targetStatus,
              p_apply_target_status_now: targetStatus !== currentStatus && transitionTiming === "immediate",
              p_mark_success: body.markSuccess === true,
              p_actor_auth_user_id: authenticatedActor.id,
              p_actor_member_id: actor.memberId,
              p_actor_role: actor.role,
              p_source: "pipeline_workspace",
            },
          );
          if (error) throw error;
          const result = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | null;
          return respond({ ok: true, ...(result ?? {}) });
        }
      }
      const { data, error } = await supabase.rpc(
        "create_contract_and_close_pipeline_item",
        {
          p_company_id: company.id,
          p_item_id: existing.id,
          p_start_date: startDate,
          p_end_date: endDate,
          p_contract_days: contractDays,
          p_monthly_value: monthlyValue,
          p_total_contract_value: totalContractValue,
          p_auto_renew: body.autoRenew === true,
          p_note: nullableText(body.note),
          p_target_offer_id: nullableText(body.targetOfferId),
          p_actor_auth_user_id: authenticatedActor.id,
          p_actor_member_id: actor.memberId,
          p_actor_role: actor.role,
          p_retention_target_status: existingPipeline.pipeline_type === "renewal"
            ? cleanText(body.retentionTargetStatus) || existingClient.program_status_value
            : null,
          p_mark_success: existingPipeline.pipeline_type === "renewal" && body.markSuccess === true,
        },
      );
      if (error) throw error;
      const result = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | null;
      return respond({ ok: true, ...(result ?? {}) });
    }

    if (action === "resolve_pipeline_lost") {
      const lossReason = cleanText(body.lossReason);
      if (!lossReason) return respond({ error: "Add a loss reason." }, 400);
      const { data, error } = await supabase.rpc(
        "resolve_pipeline_item_lost",
        {
          p_company_id: company.id,
          p_item_id: existing.id,
          p_loss_reason: lossReason,
          p_outcome: nullableText(body.outcome),
          p_note: nullableText(body.note),
          p_actor_auth_user_id: authenticatedActor.id,
          p_actor_member_id: actor.memberId,
          p_actor_role: actor.role,
        },
      );
      if (error) throw error;
      const item = Array.isArray(data) ? data[0] : data;
      return respond({ ok: true, item });
    }

    if (action === "move_stage") {
      const stageId = cleanText(body.stageId);
      const stage = await loadStage(supabase, company.id, existing.pipeline_id, stageId);
      if (stage.stage_type !== "open") {
        throw new AuthError("Won and Lost require the guided resolution flow.", 409);
      }
      const note = nullableText(body.note);
      if (stage.requires_note && !note) return respond({ error: "This stage requires a note." }, 400);
      if (stage.id === existing.stage_id) return respond({ ok: true, item: existing });
      const patch: Record<string, unknown> = {
        stage_id: stage.id,
        lifecycle_status: stage.stage_type,
      };
      if (note !== null) patch.current_note = note;
      const { data: changedItem, error } = await supabase.rpc(
        "mutate_pipeline_item_with_evidence",
        {
          p_company_id: company.id,
          p_item_id: existing.id,
          p_activity: "stage_changed",
          p_patch: patch,
          p_actor_auth_user_id: authenticatedActor.id,
          p_actor_member_id: actor.memberId,
          p_actor_role: actor.role,
          p_note: note,
        },
      );
      if (error) throw error;
      const item = Array.isArray(changedItem) ? changedItem[0] : changedItem;
      return respond({ ok: true, item });
    }

    if (action === "archive_item") {
      const now = new Date().toISOString();
      const { data: changedItem, error } = await supabase.rpc(
        "mutate_pipeline_item_with_evidence",
        {
          p_company_id: company.id,
          p_item_id: existing.id,
          p_activity: "archived",
          p_patch: { lifecycle_status: "archived", archived_at: now },
          p_actor_auth_user_id: authenticatedActor.id,
          p_actor_member_id: actor.memberId,
          p_actor_role: actor.role,
          p_note: nullableText(body.note),
        },
      );
      if (error) throw error;
      const item = Array.isArray(changedItem) ? changedItem[0] : changedItem;
      return respond({ ok: true, item });
    }

    const updatePayload: Record<string, unknown> = {};
    let updateActivity = "details_changed";

    if (body.targetOfferId !== undefined) {
      const targetOfferOnly = Object.keys(body).every((key) =>
        ["action", "companyLegacyId", "itemId", "targetOfferId"].includes(key)
      );
      if (!targetOfferOnly) {
        throw new AuthError(
          "Save the target offer separately from other Pipeline item changes.",
          400,
        );
      }
      const { data: targetUpdated, error: targetError } = await supabase.rpc(
        "set_pipeline_item_target_offer_with_evidence",
        {
          p_company_id: company.id,
          p_item_id: existing.id,
          p_target_offer_id: nullableText(body.targetOfferId),
          p_actor_auth_user_id: authenticatedActor.id,
          p_actor_member_id: actor.memberId,
          p_actor_role: actor.role,
        },
      );
      if (targetError) throw targetError;
      const item = Array.isArray(targetUpdated) ? targetUpdated[0] : targetUpdated;
      return respond({ ok: true, item });
    }
    if (body.stageId !== undefined) {
      const stage = await loadStage(
        supabase,
        company.id,
        existing.pipeline_id,
        cleanText(body.stageId),
      );
      if (stage.stage_type !== "open") {
        throw new AuthError("Won and Lost require the guided resolution flow.", 409);
      }
      const note = nullableText(body.note);
      if (stage.requires_note && !note) {
        return respond({ error: "This stage requires a note." }, 400);
      }
      if (stage.id !== existing.stage_id) {
        updatePayload.stage_id = stage.id;
        updatePayload.lifecycle_status = stage.stage_type;
        updateActivity = "stage_changed";
      }
    }
    if (body.ownerMemberId !== undefined) updatePayload.owner_member_id = await validateOwner(supabase, company.id, nullableText(body.ownerMemberId), actor);
    if (body.estimatedValueCents !== undefined) updatePayload.estimated_value_cents = nonnegativeCents(body.estimatedValueCents);
    if (body.actualValueCents !== undefined) updatePayload.actual_value_cents = nonnegativeCents(body.actualValueCents);
    if (body.currencyCode !== undefined) updatePayload.currency_code = currencyCode(body.currencyCode);
    if (body.followUpDate !== undefined || body.followUpAt !== undefined) updatePayload.follow_up_at = optionalDate(body.followUpDate ?? body.followUpAt);
    if (body.expectedCloseDate !== undefined || body.expectedCloseAt !== undefined) updatePayload.expected_close_at = optionalDate(body.expectedCloseDate ?? body.expectedCloseAt);
    if (body.renewalDate !== undefined || body.renewalAt !== undefined) updatePayload.renewal_at = optionalDate(body.renewalDate ?? body.renewalAt);
    if (body.outcome !== undefined) updatePayload.outcome = nullableText(body.outcome);
    if (body.note !== undefined) updatePayload.current_note = nullableText(body.note);
    if (Object.keys(updatePayload).length === 0) return respond({ error: "No pipeline changes to save." }, 400);
    const { data: changedItem, error } = await supabase.rpc(
      "mutate_pipeline_item_with_evidence",
      {
        p_company_id: company.id,
        p_item_id: existing.id,
        p_activity: updateActivity,
        p_patch: updatePayload,
        p_actor_auth_user_id: authenticatedActor.id,
        p_actor_member_id: actor.memberId,
        p_actor_role: actor.role,
        p_note: nullableText(body.note),
      },
    );
    if (error) throw error;
    const item = Array.isArray(changedItem) ? changedItem[0] : changedItem;
    return respond({ ok: true, item });
  } catch (error) {
    console.error(error);
    const status = error instanceof AuthError ? error.status : 500;
    return respond(
      {
        error: error instanceof AuthError
          ? error.message
          : "Unexpected Pipeline workspace error.",
      },
      status,
    );
  }
});
