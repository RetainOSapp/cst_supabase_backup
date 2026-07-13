/// <reference path="../_shared/deno.d.ts" />

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const WRITER_ROLES = new Set(["director", "support", "csm"]);
const ALLOWED_STATUS_VALUES = new Set([
  "front-end",
  "back-end",
  "paused",
  "suspended",
  "off-boarded",
]);

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

function nullableBoolean(value: unknown) {
  if (typeof value === "boolean") return value;
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  if (["true", "yes", "1"].includes(normalized)) return true;
  if (["false", "no", "0"].includes(normalized)) return false;
  return null;
}

function recordFrom(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? { ...(value as Record<string, unknown>) }
    : {};
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

function isLegacyContractEndPlaceholder(value: unknown) {
  const date = normalizeDate(value);
  if (!date) return false;
  const parsed = new Date(date);
  return (
    parsed.getUTCFullYear() === 2075 &&
    parsed.getUTCMonth() === 0 &&
    parsed.getUTCDate() === 1
  );
}

function addDays(dateValue: unknown, days: number) {
  if (!dateValue || days <= 0) return null;
  const date = new Date(String(dateValue));
  if (Number.isNaN(date.getTime())) return null;
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString();
}

function resolvedContractEndDate(client: Record<string, unknown>) {
  const explicitEnd = normalizeDate(
    client.current_contract_end_date_for_filtering ??
      client.current_contract_end_date,
  );
  if (explicitEnd && !isLegacyContractEndPlaceholder(explicitEnd)) {
    return explicitEnd;
  }

  const contractDays = Number(client.current_contract_of_days);
  return Number.isFinite(contractDays) && contractDays > 0
    ? addDays(client.current_contract_start_date, contractDays)
    : null;
}

function daysBetween(startIso: string, endIso: string) {
  const start = new Date(startIso);
  const end = new Date(endIso);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 0;
  return Math.max(
    0,
    Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)),
  );
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
    .eq("status", "active")
    .limit(1)
    .maybeSingle();

  if (error) throw error;

  if (data && WRITER_ROLES.has(data.role)) {
    return {
      role: data.role as string,
      memberId: data.id as string,
      legacyMemberId: data.legacy_glide_row_id as string | null,
    };
  }

  throw new Error("You do not have permission to change this client status.");
}

function actorAssignmentIds(actor: {
  memberId: string | null;
  legacyMemberId: string | null;
}) {
  return [actor.legacyMemberId, actor.memberId].filter(
    (id): id is string => Boolean(id),
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
    const clientLegacyId = cleanText(body.clientLegacyId);
    const targetStatus = cleanText(body.targetStatus);
    const reason = nullableText(body.reason);
    const returnDate = normalizeDate(body.returnDate);

    if (!clientLegacyId) {
      return jsonResponse({ error: "Missing client id." }, 400);
    }
    if (!ALLOWED_STATUS_VALUES.has(targetStatus)) {
      return jsonResponse({ error: "Choose a valid program status." }, 400);
    }
    if (["paused", "suspended"].includes(targetStatus) && !reason) {
      return jsonResponse({ error: "Add a reason for this status change." }, 400);
    }
    if (targetStatus === "paused" && !returnDate) {
      return jsonResponse({ error: "Add a return date for paused clients." }, 400);
    }
    if (
      targetStatus === "paused" &&
      returnDate &&
      new Date(returnDate).getTime() <= Date.now()
    ) {
      return jsonResponse(
        { error: "Return date must be in the future for paused clients." },
        400,
      );
    }

    const { data: client, error: clientError } = await supabase
      .from("clients")
      .select("*")
      .eq("glide_row_id", clientLegacyId)
      .maybeSingle();

    if (clientError) throw clientError;
    if (!client) {
      return jsonResponse(
        { error: "This client is not enabled for RetainOS status writes." },
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
        { error: "This company is not enabled for RetainOS client writes." },
        400,
      );
    }

    const actor = await resolveActor(supabase, userEmail, company.id);

    if (actor.role === "csm") {
      const assignmentIds = actorAssignmentIds(actor);
      const isAssigned =
        assignmentIds.includes(client.csm_team_member_id ?? "") ||
        assignmentIds.includes(client.csm_secondary_assignee_id ?? "");
      if (!isAssigned) {
        return jsonResponse(
          { error: "CSMs can change assigned client statuses only." },
          403,
        );
      }
    }

    if (client.program_status_value === targetStatus) {
      return jsonResponse({ error: "This client already has that status." }, 400);
    }

    const requestedOffboardedAt =
      targetStatus === "off-boarded" ? normalizeDate(body.offboardedAt) : null;
    const contractEndForOffboarding =
      targetStatus === "off-boarded" ? resolvedContractEndDate(client) : null;
    const offboardingChurned =
      requestedOffboardedAt && contractEndForOffboarding
        ? new Date(requestedOffboardedAt).getTime() <
          new Date(contractEndForOffboarding).getTime()
        : null;
    const churnReason =
      targetStatus === "off-boarded"
        ? nullableText(body.churnReason) ?? reason
        : null;
    const churnReasonLabel =
      targetStatus === "off-boarded"
        ? nullableText(body.churnReasonLabel) ?? churnReason
        : null;
    const goodFitForOffer =
      targetStatus === "off-boarded" ? nullableBoolean(body.goodFit) : null;
    const offboardingNotes =
      targetStatus === "off-boarded" ? nullableText(body.notes) : null;

    if (targetStatus === "off-boarded" && !requestedOffboardedAt) {
      return jsonResponse({ error: "Add the client's actual end date." }, 400);
    }
    if (targetStatus === "off-boarded" && goodFitForOffer === null) {
      return jsonResponse(
        { error: "Choose whether this client was a good fit for the offer." },
        400,
      );
    }
    if (targetStatus === "off-boarded" && offboardingChurned === true && !churnReason) {
      return jsonResponse({ error: "Choose the churn reason." }, 400);
    }
    if (
      targetStatus === "off-boarded" &&
      offboardingChurned === true &&
      !offboardingNotes
    ) {
      return jsonResponse({ error: "Add churn notes for this offboarding." }, 400);
    }

    const now = new Date().toISOString();
    const pauseExtensionDays =
      targetStatus === "paused" && returnDate ? daysBetween(now, returnDate) : 0;
    const currentContractDays =
      client.current_contract_of_days === null ||
      client.current_contract_of_days === undefined
        ? null
        : Number(client.current_contract_of_days);
    const extendedContractEndDate =
      pauseExtensionDays > 0
        ? addDays(resolvedContractEndDate(client), pauseExtensionDays)
        : null;
    const extendedContractDays =
      pauseExtensionDays > 0 && Number.isFinite(currentContractDays)
        ? (currentContractDays as number) + pauseExtensionDays
        : client.current_contract_of_days;
    const offboardingStatus =
      offboardingChurned === true
        ? "churned"
        : offboardingChurned === false
          ? "completed"
          : "unknown";
    const offboardingStatusReason =
      targetStatus === "off-boarded"
        ? offboardingChurned === true
          ? churnReason
          : offboardingChurned === false
            ? "Completed contract / did not churn"
            : "Offboarded - churn status needs review"
        : reason;
    const offboardingPayload =
      targetStatus === "off-boarded"
        ? {
            ...recordFrom(recordFrom(client.metadata).offboarding),
            actual_end_date: requestedOffboardedAt,
            contract_end_date: contractEndForOffboarding,
            churned: offboardingChurned,
            churn_status: offboardingStatus,
            churn_reason: offboardingChurned === true ? churnReason : null,
            churn_reason_label:
              offboardingChurned === true ? churnReasonLabel : null,
            notes: offboardingNotes,
            good_fit_for_offer: goodFitForOffer,
            recorded_at: now,
            recorded_by_role: actor.role,
          }
        : null;

    const updatePayload: Record<string, unknown> = {
      program_status_value: targetStatus,
      program_status_reason: offboardingStatusReason,
      program_paused_return_date: targetStatus === "paused" ? returnDate : null,
      program_latest_paused_date: targetStatus === "paused" ? now : client.program_latest_paused_date,
      program_latest_suspended_date:
        targetStatus === "suspended" ? now : client.program_latest_suspended_date,
      program_latest_pause_extension_days:
        targetStatus === "paused" ? pauseExtensionDays : client.program_latest_pause_extension_days,
    };

    if (targetStatus === "back-end") {
      updatePayload.program_latest_back_end_start_date = now;
    }

    if (targetStatus === "off-boarded") {
      updatePayload.client_age_date_offboarded = requestedOffboardedAt;
      updatePayload.client_age_date_offboarded_for_filtering = requestedOffboardedAt;
      updatePayload.churn_reason_value =
        offboardingChurned === true ? churnReasonLabel ?? churnReason : null;
      updatePayload.churn_comments = offboardingNotes;
      updatePayload.metadata = {
        ...recordFrom(client.metadata),
        offboarding: offboardingPayload,
      };
    } else if (targetStatus === "front-end" || targetStatus === "back-end") {
      updatePayload.client_age_date_offboarded = null;
      updatePayload.client_age_date_offboarded_for_filtering = null;
    }

    if (extendedContractEndDate) {
      updatePayload.current_contract_end_date = extendedContractEndDate;
      updatePayload.current_contract_end_date_for_filtering =
        extendedContractEndDate;
      updatePayload.current_contract_of_days = extendedContractDays;
    }

    const { data: updatedClient, error: updateError } = await supabase
      .from("clients")
      .update(updatePayload)
      .eq("id", client.id)
      .select("*")
      .single();

    if (updateError) throw updateError;

    let updatedContract = null;
    if (extendedContractEndDate) {
      const { data: latestContract, error: latestContractError } = await supabase
        .from("client_contracts")
        .select("*")
        .eq("client_id", client.glide_row_id)
        .order("end_date", { ascending: false, nullsFirst: false })
        .limit(1)
        .maybeSingle();

      if (latestContractError) {
        console.warn("Could not load latest contract for pause extension:", latestContractError);
      } else if (latestContract) {
        const nextContractDays =
          latestContract.contract_days !== null
            ? Number(latestContract.contract_days) + pauseExtensionDays
            : null;
        const { data: contractAfter, error: contractError } = await supabase
          .from("client_contracts")
          .update({
            end_date: extendedContractEndDate,
            contract_days: nextContractDays,
            metadata: {
              ...(latestContract.metadata ?? {}),
              latest_pause_extension_days: pauseExtensionDays,
              latest_pause_extension_at: now,
            },
          })
          .eq("id", latestContract.id)
          .select("*")
          .single();
        if (contractError) {
          console.warn("Could not extend latest contract during status change:", contractError);
        } else {
          updatedContract = contractAfter;
        }
      }
    }

    const statusLabel = targetStatus
      .split("-")
      .map((part) => part[0]?.toUpperCase() + part.slice(1))
      .join(" ");
    const summaryParts = [
      `Changed status from ${client.program_status_value ?? "unset"} to ${targetStatus}.`,
      offboardingStatusReason ? `Reason: ${offboardingStatusReason}` : null,
      returnDate ? `Return date: ${returnDate.slice(0, 10)}` : null,
      requestedOffboardedAt
        ? `Actual end date: ${requestedOffboardedAt.slice(0, 10)}.`
        : null,
      targetStatus === "off-boarded"
        ? `Churn status: ${offboardingStatus}.`
        : null,
      targetStatus === "off-boarded"
        ? `Good fit: ${goodFitForOffer ? "Yes" : "No"}.`
        : null,
      pauseExtensionDays > 0
        ? `Extended contract by ${pauseExtensionDays} day${pauseExtensionDays === 1 ? "" : "s"}.`
        : null,
    ].filter(Boolean);

    const { data: event, error: historyError } = await supabase
      .from("client_history_events")
      .insert({
        company_id: company.id,
        legacy_client_glide_row_id: clientLegacyId,
        actor_auth_user_id: userData.user.id,
        actor_member_id: actor.memberId,
        event_type: "client_status_changed",
        source: "client_status",
        title: `Status changed to ${statusLabel}`,
        summary: summaryParts.join(" "),
        notes: nullableText(body.notes),
        payload: {
          actor_role: actor.role,
          from_status: client.program_status_value,
          to_status: targetStatus,
          reason: offboardingStatusReason,
          return_date: returnDate,
          offboarding: offboardingPayload,
          pause_extension_days: pauseExtensionDays,
          updated_contract: updatedContract,
          before: client,
          after: updatedClient,
        },
      })
      .select("*")
      .single();

    if (historyError) throw historyError;

    await supabase.from("app_audit_events").insert({
      company_id: company.id,
      actor_auth_user_id: userData.user.id,
      actor_member_id: actor.memberId,
      event_type: "client_status_changed",
      source: "client_status",
      entity_table: "clients",
      entity_id: updatedClient.id,
      legacy_glide_row_id: clientLegacyId,
      title: "Client status changed",
      summary: `Changed ${updatedClient.client_name ?? clientLegacyId} to ${targetStatus}.`,
      before_data: client,
      after_data: updatedClient,
      metadata: {
        history_event_id: event.id,
        actor_role: actor.role,
        from_status: client.program_status_value,
        to_status: targetStatus,
        reason: offboardingStatusReason,
        return_date: returnDate,
        offboarding: offboardingPayload,
        pause_extension_days: pauseExtensionDays,
        updated_contract_id: updatedContract?.id ?? null,
      },
    });

    return jsonResponse({
      ok: true,
      client: updatedClient,
      event,
      updatedContract,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    return jsonResponse({ error: message }, 500);
  }
});
