/// <reference path="../_shared/deno.d.ts" />

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const CREATOR_ROLES = new Set(["director", "support", "csm"]);

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

  if (data?.status === "active" && CREATOR_ROLES.has(data.role)) {
    return {
      role: data.role as string,
      memberId: data.id as string,
      legacyMemberId: data.legacy_glide_row_id as string | null,
    };
  }

  throw new Error("You do not have permission to create clients.");
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
    const companyGlideId = cleanText(body.companyGlideId);
    const clientName = cleanText(body.clientName);

    if (!companyGlideId) return jsonResponse({ error: "Missing company." }, 400);
    if (!clientName) return jsonResponse({ error: "Client name is required." }, 400);

    const { data: company, error: companyError } = await supabase
      .from("companies")
      .select("id, legacy_glide_row_id, migration_status")
      .eq("legacy_glide_row_id", companyGlideId)
      .in("migration_status", ["pilot", "migrated"])
      .maybeSingle();

    if (companyError) throw companyError;
    if (!company) {
      return jsonResponse(
        { error: "This company is not enabled for RetainOS client creation." },
        400,
      );
    }

    const actor = await resolveActor(supabase, userEmail, company.id);
    const requestedCsmId = nullableText(body.csmTeamMemberId);
    const assignedCsmId =
      actor.role === "csm" ? actor.legacyMemberId : requestedCsmId;

    if (actor.role === "csm" && !assignedCsmId) {
      return jsonResponse(
        { error: "Your account is missing a team member assignment." },
        403,
      );
    }

    if (assignedCsmId) {
      const { data: members, error: memberError } = await supabase
        .from("company_members")
        .select("id, legacy_glide_row_id, status, hide_from_csm_list")
        .eq("company_id", company.id)
        .eq("status", "active");
      if (memberError) throw memberError;
      const member = members?.find(
        (candidate) =>
          candidate.id === assignedCsmId ||
          candidate.legacy_glide_row_id === assignedCsmId,
      );
      if (!member || member.hide_from_csm_list === true) {
        return jsonResponse(
          { error: "Assigned CSM is not an active client manager." },
          400,
        );
      }
    }

    const glideRowId = `ro_${crypto.randomUUID()}`;
    const now = new Date().toISOString();
    const onboardedAt = normalizeDate(body.dateOnboarded) ?? now;
    const programStatus = nullableText(body.programStatusValue) ?? "front-end";
    const requestedOfferId = nullableText(body.offerId);
    const requestedMilestoneId = nullableText(body.milestoneId);
    const contractStartDate = normalizeDate(body.contractStartDate);
    const contractEndDate = normalizeDate(body.contractEndDate);

    let selectedOffer: Record<string, unknown> | null = null;
    let selectedMilestone: Record<string, unknown> | null = null;
    if (requestedOfferId) {
      const { data: offer, error: offerError } = await supabase
        .from("backup_company_offers")
        .select("glide_row_id, company_id, name")
        .eq("glide_row_id", requestedOfferId)
        .eq("company_id", companyGlideId)
        .maybeSingle();
      if (offerError) throw offerError;
      if (!offer) {
        return jsonResponse({ error: "That offer does not belong to this company." }, 400);
      }
      selectedOffer = offer;
      if (requestedMilestoneId) {
        const { data: milestone, error: milestoneError } = await supabase
          .from("backup_company_offer_milestones")
          .select("glide_row_id, offer_id, name, order")
          .eq("glide_row_id", requestedMilestoneId)
          .eq("offer_id", requestedOfferId)
          .maybeSingle();
        if (milestoneError) throw milestoneError;
        if (!milestone) {
          return jsonResponse(
            { error: "That milestone does not belong to the selected offer." },
            400,
          );
        }
        selectedMilestone = milestone;
      }
    }

    const insertPayload = {
      glide_row_id: glideRowId,
      company_id: company.id,
      company_glide_row_id: company.legacy_glide_row_id,
      client_name: clientName,
      client_business: nullableText(body.clientBusiness),
      client_email: nullableText(body.clientEmail),
      client_archetype_value: nullableText(body.clientArchetype),
      north_star_value: nullableText(body.northStar),
      csm_team_member_id: assignedCsmId,
      csm_secondary_assignee_id:
        actor.role === "csm" ? null : nullableText(body.secondaryAssigneeId),
      client_age_date_onboarded: onboardedAt,
      program_status_value: programStatus,
      offer_milestones_current_offer_id: requestedOfferId,
      offer_milestones_current_milestone_id: requestedMilestoneId,
      offer_milestones_current_milestone_change_date: requestedMilestoneId
        ? now
        : null,
      current_contract_start_date: contractStartDate,
      current_contract_end_date: contractEndDate,
      current_contract_end_date_for_filtering: contractEndDate,
      current_contract_of_days: daysBetween(contractStartDate, contractEndDate),
      metadata: {
        created_in: "retainos_client_create_pilot",
        actor_role: actor.role,
      },
    };

    const { data: client, error: createError } = await supabase
      .from("clients")
      .insert(insertPayload)
      .select("*")
      .single();

    if (createError) throw createError;

    let clientMilestone = null;
    if (requestedOfferId && requestedMilestoneId) {
      const { data, error } = await supabase
        .from("client_milestones")
        .insert({
          company_id: company.id,
          company_glide_row_id: company.legacy_glide_row_id,
          glide_row_id: `client_milestone_${crypto.randomUUID()}`,
          client_id: glideRowId,
          offer_id: requestedOfferId,
          milestone_id: requestedMilestoneId,
          start_date: onboardedAt,
          initiated_by_member_id: actor.memberId,
          initiated_by_name: userEmail,
          metadata: {
            actor_role: actor.role,
            created_in: "retainos_client_create_pilot",
            mirrored_offer_name: selectedOffer?.name ?? null,
            mirrored_milestone_name: selectedMilestone?.name ?? null,
          },
        })
        .select("*")
        .single();
      if (error) throw error;
      clientMilestone = data;
    }

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
          contract_days: daysBetween(contractStartDate, contractEndDate),
          status: "active",
          metadata: {
            actor_role: actor.role,
            created_in: "retainos_client_create_pilot",
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
        actor_auth_user_id: userData.user.id,
        actor_member_id: actor.memberId,
        event_type: "client_created",
        source: "client_create",
        title: `Client created: ${client.client_name}`,
        summary: `Created ${client.client_name} in RetainOS pilot client data.`,
        payload: {
          actor_role: actor.role,
          client,
          initial_offer: selectedOffer,
          initial_milestone: selectedMilestone,
          client_milestone: clientMilestone,
          initial_contract: contract,
        },
      })
      .select("*")
      .single();

    if (historyError) throw historyError;

    await supabase.from("app_audit_events").insert({
      company_id: company.id,
      actor_auth_user_id: userData.user.id,
      actor_member_id: actor.memberId,
      event_type: "client_created",
      source: "client_create",
      entity_table: "clients",
      entity_id: client.id,
      legacy_glide_row_id: glideRowId,
      title: "Client created",
      summary: `Created ${client.client_name}.`,
      after_data: client,
      metadata: {
        history_event_id: event.id,
        actor_role: actor.role,
      },
    });

    return jsonResponse({ ok: true, client, event, clientMilestone, contract });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    return jsonResponse({ error: message }, 500);
  }
});
