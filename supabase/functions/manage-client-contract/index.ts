/// <reference path="../_shared/deno.d.ts" />

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const WRITER_ROLES = new Set(["director", "support", "csm"]);
const ACTIVE_STATUS_VALUES = new Set(["front-end", "back-end"]);
const RETENTION_TYPES = new Set(["none", "renewal", "upsell"]);
const CONTRACT_ACTIONS = new Set(["create", "update", "archive"]);

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

async function syncClientContractSummary(
  supabase: ReturnType<typeof createClient>,
  clientId: string,
  clientLegacyId: string,
) {
  const { data: latestContract, error: latestError } = await supabase
    .from("client_contracts")
    .select("*")
    .eq("client_id", clientLegacyId)
    .is("archived_at", null)
    .neq("status", "archived")
    .order("end_date", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (latestError) throw latestError;

  const updatePayload: Record<string, unknown> = latestContract
    ? {
        current_contract_start_date: latestContract.start_date,
        current_contract_of_days: latestContract.contract_days,
        current_contract_end_date: latestContract.end_date,
        current_contract_end_date_for_filtering: latestContract.end_date,
        current_contract_monthly_value: latestContract.monthly_value,
        current_contract_reference_link: latestContract.reference_link,
        current_contract_notes: latestContract.notes,
        current_contract_auto_renew: latestContract.auto_renew,
      }
    : {
        current_contract_start_date: null,
        current_contract_of_days: null,
        current_contract_end_date: null,
        current_contract_end_date_for_filtering: null,
        current_contract_monthly_value: null,
        current_contract_reference_link: null,
        current_contract_notes: null,
        current_contract_auto_renew: null,
      };

  const { data: updatedClient, error: updateClientError } = await supabase
    .from("clients")
    .update(updatePayload)
    .eq("id", clientId)
    .select("*")
    .single();

  if (updateClientError) throw updateClientError;
  return { latestContract, updatedClient };
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

  throw new Error("You do not have permission to manage contracts.");
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

    const actor = await resolveActor(supabase, userEmail, company.id);

    if (actor.role === "csm") {
      const isAssigned =
        actor.legacyMemberId &&
        (client.csm_team_member_id === actor.legacyMemberId ||
          client.csm_secondary_assignee_id === actor.legacyMemberId);
      if (!isAssigned) {
        return jsonResponse(
          { error: "CSMs can create contracts for assigned clients only." },
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
    const monthlyValue = nullableNumber(body.monthlyValue);
    const totalContractValue =
      nullableNumber(body.totalContractValue) ??
      (monthlyValue !== null && contractDays !== null
        ? Number(((monthlyValue / 30) * contractDays).toFixed(2))
        : null);

    if (action !== "archive" && !startDate && !endDate) {
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

      const { updatedClient } = await syncClientContractSummary(
        supabase,
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

      const updatePayload = {
        start_date: startDate,
        end_date: endDate,
        contract_days: contractDays,
        monthly_value: monthlyValue,
        total_contract_value: totalContractValue,
        reference_link: nullableText(body.referenceLink),
        notes: nullableText(body.notes),
        auto_renew: body.autoRenew === true,
        status: nullableText(body.status) ?? "active",
        metadata: {
          ...(existingContract.metadata ?? {}),
          contract_type: normalizeContractType(body.contractType),
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

      const { updatedClient } = await syncClientContractSummary(
        supabase,
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
          summary: endDate
            ? `Updated contract ending ${endDate.slice(0, 10)}.`
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
      metadata: {
        contract_type: normalizeContractType(body.contractType),
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

    const clientUpdatePayload: Record<string, unknown> = {
      current_contract_start_date: startDate,
      current_contract_of_days: contractDays,
      current_contract_end_date: endDate,
      current_contract_end_date_for_filtering: endDate,
      current_contract_monthly_value: monthlyValue,
      current_contract_reference_link: nullableText(body.referenceLink),
      current_contract_notes: nullableText(body.notes),
      current_contract_auto_renew: body.autoRenew === true,
    };

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

    const { data: updatedClient, error: updateClientError } = await supabase
      .from("clients")
      .update(clientUpdatePayload)
      .eq("id", client.id)
      .select("*")
      .single();

    if (updateClientError) throw updateClientError;

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
        summary: endDate
          ? `Created contract ending ${endDate.slice(0, 10)}.`
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
        endDate ? `New renewal date: ${endDate.slice(0, 10)}.` : null,
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
    const message = error instanceof Error ? error.message : "Unexpected error";
    return jsonResponse({ error: message }, 500);
  }
});
