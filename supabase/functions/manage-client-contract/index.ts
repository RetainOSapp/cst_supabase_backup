/// <reference path="../_shared/deno.d.ts" />

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.101.1";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const WRITER_ROLES = new Set(["director", "support", "csm"]);
const ACTIVE_STATUS_VALUES = new Set(["front-end", "back-end"]);
const RETENTION_TYPES = new Set(["none", "renewal", "upsell"]);
const CONTRACT_ACTIONS = new Set(["create", "update", "archive", "delete"]);

class AuthError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "AuthError";
    this.status = status;
  }
}

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

function exactEmailQuery<T>(query: T, email: string) {
  const builder = query as T & {
    eq: (column: string, value: string) => T;
    ilike: (column: string, pattern: string) => T;
  };
  return /[\\%_*]/.test(email)
    ? builder.eq("email", email)
    : builder.ilike("email", email);
}

function getBearerToken(req: Request) {
  const auth = req.headers.get("Authorization") ?? "";
  const match = auth.match(/^Bearer\s+(.+)$/i);
  return match?.[1] ?? "";
}

function normalizeDate(value: unknown) {
  const text = cleanText(value);
  if (!text) return null;
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function nullableNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function normalizeContractType(value: unknown) {
  const text = cleanText(value).toLowerCase();
  return [
    "standard",
    "renewal",
    "upsell",
    "pause_extension",
    "add_on",
    "other",
  ].includes(text)
    ? text
    : "standard";
}

function persistedContractType(value: unknown, retentionType = "none") {
  if (retentionType === "renewal") return "renewal";
  // Client Detail's Front End -> Back End choice is the next primary renewal
  // contract. Expansion Pipeline purchases use the separate add_on path.
  if (retentionType === "upsell") return "renewal";
  const normalized = normalizeContractType(value);
  return normalized === "renewal" || normalized === "add_on"
    ? normalized
    : "standard";
}

function billingCadence(value: unknown, endDate: string | null) {
  const normalized = cleanText(value).toLowerCase();
  if (["fixed_term", "month_to_month", "open_ended", "unknown"].includes(normalized)) {
    return normalized;
  }
  return endDate ? "fixed_term" : "open_ended";
}

function contractCurrency(value: unknown) {
  const normalized = cleanText(value).toUpperCase();
  return /^[A-Z]{3}$/.test(normalized) ? normalized : "USD";
}

function calculateDays(startDate: string | null, endDate: string | null) {
  if (!startDate || !endDate) return null;
  const start = new Date(startDate);
  const end = new Date(endDate);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
  return Math.max(
    0,
    Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)),
  );
}

function calculateEndDate(startDate: string | null, contractDays: number | null) {
  if (!startDate || contractDays === null) return null;
  const start = new Date(startDate);
  if (Number.isNaN(start.getTime())) return null;
  start.setUTCDate(start.getUTCDate() + contractDays);
  return start.toISOString();
}

function dateKey(value: string | null | undefined) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

async function syncClientContractSummary(
  supabase: ReturnType<typeof createClient>,
  companyId: string,
  clientId: string,
  _clientLegacyId: string,
) {
  const { data, error } = await supabase.rpc(
    "refresh_client_contract_summary",
    { p_company_id: companyId, p_client_id: clientId, p_as_of: new Date().toISOString() },
  );
  if (error) throw error;
  const updatedClient = Array.isArray(data) ? data[0] : data;
  return { latestContract: null, updatedClient };
}

async function reconcileScheduledActivation(
  supabase: ReturnType<typeof createClient>,
  companyId: string,
  contractId: string,
  action: "archive" | "delete" | "update",
  scheduledFor: string | null,
  actor: { role: string; memberId: string | null },
  actorAuthUserId: string,
) {
  const { data, error } = await supabase.rpc(
    "reconcile_scheduled_contract_activation",
    {
      p_company_id: companyId,
      p_contract_id: contractId,
      p_action: action,
      p_scheduled_for: scheduledFor,
      p_actor_auth_user_id: actorAuthUserId,
      p_actor_member_id: actor.memberId,
      p_actor_role: actor.role,
    },
  );
  if (error) throw error;
  return Array.isArray(data) ? data[0] ?? null : data ?? null;
}

async function resolveActor(
  supabase: ReturnType<typeof createClient>,
  authUserId: string,
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

  const selectFields = "id, legacy_glide_row_id, role, status, is_read_only";
  const { data: byAuthUserId, error: byAuthUserIdError } = await supabase
    .from("company_members")
    .select(selectFields)
    .eq("company_id", companyId)
    .eq("auth_user_id", authUserId)
    .maybeSingle();
  if (byAuthUserIdError) throw byAuthUserIdError;

  let data = byAuthUserId;
  if (!data) {
    const emailQuery = exactEmailQuery(
      supabase
        .from("company_members")
        .select(selectFields)
        .eq("company_id", companyId),
      userEmail,
    );
    const { data: byEmail, error: byEmailError } = await emailQuery.maybeSingle();
    if (byEmailError) throw byEmailError;
    data = byEmail;
  }

  if (
    data?.status === "active" &&
    data.is_read_only !== true &&
    WRITER_ROLES.has(data.role)
  ) {
    return {
      role: data.role as string,
      memberId: data.id as string,
      legacyMemberId: data.legacy_glide_row_id as string | null,
    };
  }

  throw new AuthError("You do not have permission to manage contracts.", 403);
}

function actorAssignmentIds(actor: Awaited<ReturnType<typeof resolveActor>>) {
  return [actor.legacyMemberId, actor.memberId].filter(
    (value): value is string => typeof value === "string" && value.trim() !== "",
  );
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
    const action = CONTRACT_ACTIONS.has(cleanText(body.action))
      ? cleanText(body.action)
      : "create";
    const clientLegacyId = cleanText(body.clientLegacyId);

    if (!clientLegacyId) {
      return jsonResponse({ error: "Missing client id." }, 400);
    }

    const { data: client, error: clientError } = await supabase
      .from("clients")
      .select(
        "id, company_id, glide_row_id, company_glide_row_id, client_name, csm_team_member_id, csm_secondary_assignee_id, program_status_value, program_latest_back_end_start_date",
      )
      .eq("glide_row_id", clientLegacyId)
      .maybeSingle();

    if (clientError) throw clientError;
    if (!client) {
      return jsonResponse(
        { error: "This client is not enabled for RetainOS contract writes." },
        404,
      );
    }

    const { data: company, error: companyError } = await supabase
      .from("companies")
      .select("id, migration_status")
      .eq("id", client.company_id)
      .in("migration_status", ["pilot", "migrated"])
      .maybeSingle();

    if (companyError) throw companyError;
    if (!company) {
      return jsonResponse(
        { error: "This company is not enabled for RetainOS contract writes." },
        400,
      );
    }

    const actor = await resolveActor(
      supabase,
      userData.user.id,
      userEmail,
      company.id,
    );

    if (actor.role === "csm") {
      const assignmentIds = actorAssignmentIds(actor);
      const isAssigned = assignmentIds.some(
        (assignmentId) =>
          client.csm_team_member_id === assignmentId ||
          client.csm_secondary_assignee_id === assignmentId,
      );
      if (!isAssigned) {
        return jsonResponse(
          { error: "CSMs can manage contracts for assigned clients only." },
          403,
        );
      }
    }

    const contractId = cleanText(body.contractId);

    if (action !== "create" && !contractId) {
      return jsonResponse({ error: "Missing contract id." }, 400);
    }

    const startDate = normalizeDate(body.startDate);
    const endDate = normalizeDate(body.endDate);
    const retentionType = RETENTION_TYPES.has(cleanText(body.retentionType))
      ? cleanText(body.retentionType)
      : "none";
    const retentionTargetStatus = cleanText(body.retentionTargetStatus);
    const requestedStatusTransition = cleanText(body.programStatusTransition) || "immediate";
    if (!["immediate", "on_contract_start"].includes(requestedStatusTransition)) {
      return jsonResponse({ error: "Choose when the Back End transition should happen." }, 400);
    }
    const markSuccess = body.markSuccess === true;
    const currentProgramStatus =
      typeof client.program_status_value === "string"
        ? client.program_status_value
        : null;
    const nextProgramStatus =
      retentionType === "upsell"
        ? "back-end"
        : retentionType === "renewal" && ACTIVE_STATUS_VALUES.has(retentionTargetStatus)
          ? retentionTargetStatus
          : currentProgramStatus;
    const contractDays =
      nullableNumber(body.contractDays) ?? calculateDays(startDate, endDate);
    const effectiveEndDate = endDate ?? calculateEndDate(startDate, contractDays);
    const today = new Date().toISOString().slice(0, 10);
    const startsInFuture = Boolean(startDate && dateKey(startDate)! > today);
    if (
      requestedStatusTransition === "on_contract_start" &&
      (retentionType !== "upsell" || currentProgramStatus !== "front-end" || !startsInFuture)
    ) {
      return jsonResponse(
        { error: "A scheduled Back End move requires a Front End client and a future contract start date." },
        400,
      );
    }
    const scheduleFutureActivation =
      startsInFuture && (retentionType === "renewal" || retentionType === "upsell");
    const applyTargetStatusNow =
      scheduleFutureActivation &&
      retentionType === "upsell" &&
      requestedStatusTransition === "immediate";
    const monthlyValue = nullableNumber(body.monthlyValue);
    const totalContractValue =
      nullableNumber(body.totalContractValue) ??
      (monthlyValue !== null && contractDays !== null
        ? Number(((monthlyValue / 30) * contractDays).toFixed(2))
        : null);

    if (!["archive", "delete"].includes(action) && !startDate && !endDate) {
      return jsonResponse(
        { error: "Add at least a start date or end date." },
        400,
      );
    }
    if (
      retentionType !== "none" &&
      !ACTIVE_STATUS_VALUES.has(currentProgramStatus ?? "")
    ) {
      return jsonResponse(
        { error: "Renewal/retention events can only be recorded for active clients." },
        400,
      );
    }
    if (retentionType === "upsell" && currentProgramStatus === "back-end") {
      return jsonResponse(
        { error: "Back End clients should be recorded as a renewal, not an upsell." },
        400,
      );
    }

    if (action === "archive") {
      const { data: existingContract, error: existingContractError } = await supabase
        .from("client_contracts")
        .select("*")
        .eq("glide_row_id", contractId)
        .eq("client_id", clientLegacyId)
        .eq("company_id", company.id)
        .is("archived_at", null)
        .maybeSingle();

      if (existingContractError) throw existingContractError;
      if (!existingContract) {
        return jsonResponse(
          { error: "Contract not found or already archived." },
          404,
        );
      }

      const { data: contract, error: contractError } = await supabase
        .from("client_contracts")
        .update({
          status: "archived",
          archived_at: new Date().toISOString(),
          metadata: {
            ...(existingContract.metadata ?? {}),
            archived_in: "retainos_contract_write_pilot",
            archived_by_role: actor.role,
          },
        })
        .eq("id", existingContract.id)
        .select("*")
        .single();

      if (contractError) throw contractError;

      await reconcileScheduledActivation(
        supabase,
        company.id,
        existingContract.id,
        "archive",
        null,
        actor,
        userData.user.id,
      );

      const { updatedClient } = await syncClientContractSummary(
        supabase,
        company.id,
        client.id,
        clientLegacyId,
      );

      const { data: event, error: historyError } = await supabase
        .from("client_history_events")
        .insert({
          company_id: company.id,
          legacy_client_glide_row_id: clientLegacyId,
          actor_auth_user_id: userData.user.id,
          actor_member_id: actor.memberId,
          event_type: "contract_archived",
          source: "contract_archive",
          title: `Contract archived for ${updatedClient.client_name ?? "client"}`,
          summary: endDate
            ? `Archived contract ending ${endDate.slice(0, 10)}.`
            : "Archived contract.",
          notes: nullableText(body.notes),
          payload: {
            actor_role: actor.role,
            contract,
            client: updatedClient,
          },
        })
        .select("*")
        .single();

      if (historyError) throw historyError;

      await supabase.from("app_audit_events").insert({
        company_id: company.id,
        actor_auth_user_id: userData.user.id,
        actor_member_id: actor.memberId,
        event_type: "contract_archived",
        source: "contract_archive",
        entity_table: "client_contracts",
        entity_id: contract.id,
        legacy_glide_row_id: contract.glide_row_id,
        title: "Contract archived",
        summary: `Archived contract for ${updatedClient.client_name ?? clientLegacyId}.`,
        before_data: existingContract,
        after_data: contract,
        metadata: {
          history_event_id: event.id,
          actor_role: actor.role,
          client_id: updatedClient.id,
        },
      });

      return jsonResponse({
        ok: true,
        contract,
        client: updatedClient,
        event,
      });
    }

    if (action === "delete") {
      const { data: existingContract, error: existingContractError } = await supabase
        .from("client_contracts")
        .select("*")
        .eq("glide_row_id", contractId)
        .eq("client_id", clientLegacyId)
        .eq("company_id", company.id)
        .maybeSingle();

      if (existingContractError) throw existingContractError;
      if (!existingContract) {
        return jsonResponse({ error: "Contract not found." }, 404);
      }

      const deletedAt = new Date().toISOString();
      const { data: event, error: historyError } = await supabase
        .from("client_history_events")
        .insert({
          company_id: company.id,
          legacy_client_glide_row_id: clientLegacyId,
          actor_auth_user_id: userData.user.id,
          actor_member_id: actor.memberId,
          event_type: "contract_archived",
          source: "contract_delete",
          title: `Contract deleted for ${client.client_name ?? "client"}`,
          summary: "Deleted an app-owned contract row.",
          notes: nullableText(body.notes),
          payload: {
            actor_role: actor.role,
            deleted_at: deletedAt,
            contract: existingContract,
            client,
          },
        })
        .select("*")
        .single();

      if (historyError) throw historyError;

      await reconcileScheduledActivation(
        supabase,
        company.id,
        existingContract.id,
        "delete",
        null,
        actor,
        userData.user.id,
      );

      const { error: deleteError } = await supabase
        .from("client_contracts")
        .delete()
        .eq("id", existingContract.id);

      if (deleteError) throw deleteError;

      const { updatedClient } = await syncClientContractSummary(
        supabase,
        company.id,
        client.id,
        clientLegacyId,
      );

      await supabase.from("app_audit_events").insert({
        company_id: company.id,
        actor_auth_user_id: userData.user.id,
        actor_member_id: actor.memberId,
        event_type: "contract_archived",
        source: "contract_delete",
        entity_table: "client_contracts",
        entity_id: existingContract.id,
        legacy_glide_row_id: existingContract.glide_row_id,
        title: "Contract deleted",
        summary: `Deleted contract for ${updatedClient.client_name ?? clientLegacyId}.`,
        before_data: existingContract,
        metadata: {
          history_event_id: event.id,
          actor_role: actor.role,
          client_id: updatedClient.id,
          deleted_at: deletedAt,
        },
      });

      return jsonResponse({
        ok: true,
        deletedContractId: existingContract.glide_row_id,
        client: updatedClient,
        event,
      });
    }

    if (action === "update") {
      const { data: existingContract, error: existingContractError } = await supabase
        .from("client_contracts")
        .select("*")
        .eq("glide_row_id", contractId)
        .eq("client_id", clientLegacyId)
        .eq("company_id", company.id)
        .is("archived_at", null)
        .maybeSingle();

      if (existingContractError) throw existingContractError;
      if (!existingContract) {
        return jsonResponse(
          { error: "Contract not found or archived contracts cannot be edited." },
          404,
        );
      }

      const { data: pendingActivation, error: pendingActivationError } = await supabase
        .from("scheduled_contract_activations")
        .select("id")
        .eq("company_id", company.id)
        .eq("contract_id", existingContract.id)
        .eq("status", "pending")
        .maybeSingle();
      if (pendingActivationError) throw pendingActivationError;

      const updatePayload = {
        start_date: startDate,
        end_date: endDate,
        contract_days: contractDays,
        monthly_value: monthlyValue,
        total_contract_value: totalContractValue,
        reference_link: nullableText(body.referenceLink),
        notes: nullableText(body.notes),
        auto_renew: body.autoRenew === true,
        status: pendingActivation ? "pending" : nullableText(body.status) ?? "active",
        contract_type: persistedContractType(
          body.contractType ?? existingContract.contract_type ??
            (existingContract.metadata as Record<string, unknown> | null)?.contract_type,
        ),
        billing_cadence: billingCadence(
          body.billingCadence ?? existingContract.billing_cadence,
          endDate,
        ),
        currency_code: contractCurrency(body.currencyCode ?? existingContract.currency_code),
        metadata: {
          ...(existingContract.metadata ?? {}),
          contract_type: normalizeContractType(
            body.contractType ??
              (existingContract.metadata as Record<string, unknown> | null)
                ?.contract_type,
          ),
          updated_in: "retainos_contract_write_pilot",
          updated_by_role: actor.role,
        },
      };

      const { data: contract, error: contractError } = await supabase
        .from("client_contracts")
        .update(updatePayload)
        .eq("id", existingContract.id)
        .select("*")
        .single();

      if (contractError) throw contractError;

      if (pendingActivation) {
        await reconcileScheduledActivation(
          supabase,
          company.id,
          existingContract.id,
          "update",
          startDate,
          actor,
          userData.user.id,
        );
      }

      const { updatedClient } = await syncClientContractSummary(
        supabase,
        company.id,
        client.id,
        clientLegacyId,
      );

      const { data: event, error: historyError } = await supabase
        .from("client_history_events")
        .insert({
          company_id: company.id,
          legacy_client_glide_row_id: clientLegacyId,
          actor_auth_user_id: userData.user.id,
          actor_member_id: actor.memberId,
          event_type: "contract_updated",
          source: "contract_update",
          title: `Contract updated for ${updatedClient.client_name ?? "client"}`,
          summary: effectiveEndDate
            ? `Updated contract ending ${effectiveEndDate.slice(0, 10)}.`
            : "Updated contract.",
          notes: nullableText(body.notes),
          payload: {
            actor_role: actor.role,
            before: existingContract,
            contract,
            client: updatedClient,
          },
        })
        .select("*")
        .single();

      if (historyError) throw historyError;

      // A retention event uses the contract start date as its reporting date. If a
      // retained contract is corrected later, keep that event aligned with the
      // corrected contract instead of leaving Dashboard on the original date.
      const { data: retentionEvent } = await supabase
        .from("client_history_events")
        .select("id, payload")
        .eq("company_id", company.id)
        .eq("legacy_client_glide_row_id", clientLegacyId)
        .eq("event_type", "client_retention_recorded")
        .contains("payload", { contract: { id: existingContract.id } })
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (retentionEvent) {
        const existingPayload =
          retentionEvent.payload && typeof retentionEvent.payload === "object"
            ? (retentionEvent.payload as Record<string, unknown>)
            : {};
        const { error: retentionUpdateError } = await supabase
          .from("client_history_events")
          .update({
            summary: effectiveEndDate
              ? `Retention contract corrected. New renewal date: ${effectiveEndDate.slice(0, 10)}.`
              : "Retention contract corrected.",
            payload: {
              ...existingPayload,
              retention_date: startDate,
              contract,
              client: updatedClient,
            },
          })
          .eq("id", retentionEvent.id);

        if (retentionUpdateError) throw retentionUpdateError;
      }

      await supabase.from("app_audit_events").insert({
        company_id: company.id,
        actor_auth_user_id: userData.user.id,
        actor_member_id: actor.memberId,
        event_type: "contract_updated",
        source: "contract_update",
        entity_table: "client_contracts",
        entity_id: contract.id,
        legacy_glide_row_id: contract.glide_row_id,
        title: "Contract updated",
        summary: `Updated contract for ${updatedClient.client_name ?? clientLegacyId}.`,
        before_data: existingContract,
        after_data: contract,
        metadata: {
          history_event_id: event.id,
          actor_role: actor.role,
          client_id: updatedClient.id,
        },
      });

      return jsonResponse({
        ok: true,
        contract,
        client: updatedClient,
        event,
      });
    }

    if (action === "create" && retentionType === "renewal") {
      const { data: pipelineSettings, error: pipelineSettingsError } = await supabase
        .from("company_settings")
        .select("enable_pipeline")
        .eq("company_id", company.id)
        .maybeSingle();
      if (pipelineSettingsError) throw pipelineSettingsError;

      if (pipelineSettings?.enable_pipeline === true) {
        const { data: renewalPipelines, error: renewalPipelinesError } = await supabase
          .from("company_pipelines")
          .select("id")
          .eq("company_id", company.id)
          .eq("pipeline_type", "renewal")
          .eq("is_enabled", true)
          .is("archived_at", null);
        if (renewalPipelinesError) throw renewalPipelinesError;

        const pipelineIds = (renewalPipelines ?? []).map((row) => row.id);
        if (pipelineIds.length > 0) {
          const { data: candidates, error: candidatesError } = await supabase
            .from("client_pipeline_items")
            .select("id")
            .eq("company_id", company.id)
            .eq("client_id", client.id)
            .eq("lifecycle_status", "open")
            .is("archived_at", null)
            .in("pipeline_id", pipelineIds)
            .limit(2);
          if (candidatesError) throw candidatesError;
          if ((candidates ?? []).length > 1) {
            return jsonResponse(
              {
                error:
                  "More than one open renewal item matches this client. Close the exact item from Pipeline before creating the renewal contract.",
              },
              409,
            );
          }
          if ((candidates ?? []).length === 1) {
            if (scheduleFutureActivation) {
              const { data: scheduledResult, error: scheduledError } = await supabase.rpc(
                "create_scheduled_retention_contract",
                {
                  p_company_id: company.id,
                  p_client_id: client.id,
                  p_pipeline_item_id: (candidates ?? [])[0].id,
                  p_start_date: startDate,
                  p_end_date: endDate,
                  p_contract_days: contractDays,
                  p_monthly_value: monthlyValue,
                  p_total_contract_value: totalContractValue,
                  p_reference_link: nullableText(body.referenceLink),
                  p_notes: nullableText(body.notes),
                  p_auto_renew: body.autoRenew === true,
                  p_currency_code: contractCurrency(body.currencyCode),
                  p_retention_type: retentionType,
                  p_target_status: nextProgramStatus,
                  p_apply_target_status_now: applyTargetStatusNow,
                  p_mark_success: markSuccess,
                  p_actor_auth_user_id: userData.user.id,
                  p_actor_member_id: actor.memberId,
                  p_actor_role: actor.role,
                  p_source: "pipeline_workspace",
                },
              );
              if (scheduledError) throw scheduledError;
              const scheduled = (Array.isArray(scheduledResult) ? scheduledResult[0] : scheduledResult) as Record<string, unknown> | null;
              return jsonResponse({ ok: true, ...(scheduled ?? {}), pipelineItem: scheduled?.item ?? null });
            }
            const { data: result, error: closeError } = await supabase.rpc(
              "create_contract_and_close_pipeline_item",
              {
                p_company_id: company.id,
                p_item_id: (candidates ?? [])[0].id,
                p_start_date: startDate,
                p_end_date: endDate,
                p_contract_days: contractDays,
                p_monthly_value: monthlyValue,
                p_total_contract_value: totalContractValue,
                p_auto_renew: body.autoRenew === true,
                p_note: nullableText(body.notes),
                p_target_offer_id: null,
                p_actor_auth_user_id: userData.user.id,
                p_actor_member_id: actor.memberId,
                p_actor_role: actor.role,
                p_retention_target_status: nextProgramStatus,
                p_mark_success: markSuccess,
              },
            );
            if (closeError) throw closeError;
            const resolved = (Array.isArray(result) ? result[0] : result) as
              | Record<string, unknown>
              | null;
            return jsonResponse({
              ok: true,
              ...(resolved ?? {}),
              event: null,
              retentionEvent: null,
              pipelineItem: resolved?.item ?? null,
            });
          }
        }
      }
    }

    if (action === "create" && scheduleFutureActivation) {
      const { data: scheduledResult, error: scheduledError } = await supabase.rpc(
        "create_scheduled_retention_contract",
        {
          p_company_id: company.id,
          p_client_id: client.id,
          p_pipeline_item_id: null,
          p_start_date: startDate,
          p_end_date: endDate,
          p_contract_days: contractDays,
          p_monthly_value: monthlyValue,
          p_total_contract_value: totalContractValue,
          p_reference_link: nullableText(body.referenceLink),
          p_notes: nullableText(body.notes),
          p_auto_renew: body.autoRenew === true,
          p_currency_code: contractCurrency(body.currencyCode),
          p_retention_type: retentionType,
          p_target_status: nextProgramStatus,
          p_apply_target_status_now: applyTargetStatusNow,
          p_mark_success: markSuccess,
          p_actor_auth_user_id: userData.user.id,
          p_actor_member_id: actor.memberId,
          p_actor_role: actor.role,
          p_source: "contract_create",
        },
      );
      if (scheduledError) throw scheduledError;
      const scheduled = (Array.isArray(scheduledResult) ? scheduledResult[0] : scheduledResult) as Record<string, unknown> | null;
      return jsonResponse({ ok: true, ...(scheduled ?? {}) });
    }

    const glideRowId = `contract_${crypto.randomUUID()}`;
    const contractPayload = {
      company_id: company.id,
      company_glide_row_id: client.company_glide_row_id,
      glide_row_id: glideRowId,
      client_id: client.glide_row_id,
      start_date: startDate,
      end_date: endDate,
      contract_days: contractDays,
      monthly_value: monthlyValue,
      total_contract_value: totalContractValue,
      reference_link: nullableText(body.referenceLink),
      notes: nullableText(body.notes),
      auto_renew: body.autoRenew === true,
      status: nullableText(body.status) ?? "active",
      contract_type: persistedContractType(body.contractType, retentionType),
      billing_cadence: billingCadence(body.billingCadence, endDate),
      currency_code: contractCurrency(body.currencyCode),
      metadata: {
        contract_type: persistedContractType(body.contractType, retentionType),
        created_in: "retainos_contract_write_pilot",
        actor_role: actor.role,
      },
    };

    const { data: contract, error: contractError } = await supabase
      .from("client_contracts")
      .insert(contractPayload)
      .select("*")
      .single();

    if (contractError) throw contractError;

    const clientUpdatePayload: Record<string, unknown> = {};

    if (retentionType !== "none" && nextProgramStatus) {
      clientUpdatePayload.program_status_value = nextProgramStatus;
      clientUpdatePayload.client_age_date_offboarded = null;
      clientUpdatePayload.client_age_date_offboarded_for_filtering = null;
      if (nextProgramStatus === "back-end" && currentProgramStatus !== "back-end") {
        clientUpdatePayload.program_latest_back_end_start_date =
          new Date().toISOString();
      }
    }
    if (markSuccess) {
      clientUpdatePayload.outcomes_success_value = "yes";
      clientUpdatePayload.outcomes_success_value_for_filtering = "yes";
      clientUpdatePayload.outcomes_success_date = new Date().toISOString();
    }

    if (Object.keys(clientUpdatePayload).length > 0) {
      const { error: updateClientError } = await supabase
        .from("clients")
        .update(clientUpdatePayload)
        .eq("id", client.id);

      if (updateClientError) throw updateClientError;
    }

    const { updatedClient } = await syncClientContractSummary(
      supabase,
      company.id,
      client.id,
      clientLegacyId,
    );

    const { data: event, error: historyError } = await supabase
      .from("client_history_events")
      .insert({
        company_id: company.id,
        legacy_client_glide_row_id: clientLegacyId,
        actor_auth_user_id: userData.user.id,
        actor_member_id: actor.memberId,
        event_type: "contract_created",
        source: "contract_create",
        title: `Contract created for ${updatedClient.client_name ?? "client"}`,
        summary: effectiveEndDate
          ? `Created contract ending ${effectiveEndDate.slice(0, 10)}.`
          : "Created contract.",
        payload: {
          actor_role: actor.role,
          contract,
          client: updatedClient,
        },
      })
      .select("*")
      .single();

    if (historyError) throw historyError;

    let retentionEvent = null;
    if (retentionType !== "none") {
      const retentionTitle =
        retentionType === "upsell"
          ? `Client retained via Back End upsell`
          : `Client retained via renewal`;
      const retentionSummaryParts = [
        retentionType === "upsell"
          ? `Recorded Front End to Back End renewal/upsell.`
          : `Recorded ${currentProgramStatus ?? "active"} renewal.`,
        effectiveEndDate
          ? `New renewal date: ${effectiveEndDate.slice(0, 10)}.`
          : null,
      ].filter(Boolean);

      const { data: insertedRetentionEvent, error: retentionHistoryError } =
        await supabase
          .from("client_history_events")
          .insert({
            company_id: company.id,
            legacy_client_glide_row_id: clientLegacyId,
            actor_auth_user_id: userData.user.id,
            actor_member_id: actor.memberId,
            event_type: "client_retention_recorded",
            source: "contract_create",
            title: retentionTitle,
            summary: retentionSummaryParts.join(" "),
            notes: nullableText(body.notes),
            success_status: markSuccess ? "yes" : null,
            payload: {
              actor_role: actor.role,
              retention_type: retentionType,
              retention_date: startDate,
              from_status: currentProgramStatus,
              to_status: nextProgramStatus,
              success_marked: markSuccess,
              contract,
              client: updatedClient,
            },
          })
          .select("*")
          .single();

      if (retentionHistoryError) throw retentionHistoryError;
      retentionEvent = insertedRetentionEvent;
    }

    await supabase.from("app_audit_events").insert({
      company_id: company.id,
      actor_auth_user_id: userData.user.id,
      actor_member_id: actor.memberId,
      event_type: "contract_created",
      source: "contract_create",
      entity_table: "client_contracts",
      entity_id: contract.id,
      legacy_glide_row_id: glideRowId,
      title: "Contract created",
      summary: `Created contract for ${updatedClient.client_name ?? clientLegacyId}.`,
      after_data: contract,
      metadata: {
        history_event_id: event.id,
        retention_history_event_id: retentionEvent?.id ?? null,
        actor_role: actor.role,
        client_id: updatedClient.id,
        retention_type: retentionType,
        from_status: currentProgramStatus,
        to_status: nextProgramStatus,
        success_marked: markSuccess,
      },
    });

    return jsonResponse({
      ok: true,
      contract,
      client: updatedClient,
      event,
      retentionEvent,
    });
  } catch (error) {
    const message = error instanceof AuthError
      ? error.message
      : error instanceof Error
      ? error.message
      : "Unexpected error";
    return jsonResponse(
      { error: message },
      error instanceof AuthError ? error.status : 500,
    );
  }
});
