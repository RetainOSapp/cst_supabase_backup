/// <reference path="../_shared/deno.d.ts" />

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const ACTIONS = new Set(["set_pathway", "start_milestone", "complete_milestone"]);

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

function normalizeDate(value: unknown, fallbackIso?: string) {
  const text = cleanText(value);
  const date = text ? new Date(text) : fallbackIso ? new Date(fallbackIso) : null;
  if (!date || Number.isNaN(date.getTime())) return null;
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

function titleForAction(action: string, milestoneName: string) {
  if (action === "start_milestone") return `Milestone started: ${milestoneName}`;
  if (action === "complete_milestone")
    return `Milestone completed: ${milestoneName}`;
  return `Pathway changed: ${milestoneName}`;
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
    return {
      role: "super_admin",
      memberId: null,
      legacyMemberId: null,
      name: "Super Admin",
    };
  }

  const { data, error } = await supabase
    .from("company_members")
    .select("id, legacy_glide_row_id, role, status, name")
    .eq("company_id", companyId)
    .ilike("email", userEmail)
    .maybeSingle();

  if (error) throw error;

  if (
    data?.status === "active" &&
    (data.role === "director" || data.role === "csm")
  ) {
    return {
      role: data.role as string,
      memberId: data.id as string,
      legacyMemberId: data.legacy_glide_row_id as string | null,
      name: (data.name as string | null) ?? userEmail,
    };
  }

  throw new Error("You do not have permission to manage milestones.");
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
    const action = cleanText(body.action);
    const clientLegacyId = cleanText(body.clientLegacyId);

    if (!ACTIONS.has(action)) {
      return jsonResponse({ error: "Choose a valid milestone action." }, 400);
    }
    if (!clientLegacyId) {
      return jsonResponse({ error: "Missing client id." }, 400);
    }

    const { data: client, error: clientError } = await supabase
      .from("clients")
      .select("*")
      .eq("glide_row_id", clientLegacyId)
      .maybeSingle();

    if (clientError) throw clientError;
    if (!client) {
      return jsonResponse(
        { error: "This client is not enabled for RetainOS milestone writes." },
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
        { error: "This company is not enabled for RetainOS milestone writes." },
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
          { error: "CSMs can update assigned client milestones only." },
          403,
        );
      }
    }

    if (action === "set_pathway" && actor.role !== "super_admin" && actor.role !== "director") {
      return jsonResponse(
        { error: "Only Directors and Super Admins can change pathways." },
        403,
      );
    }

    const requestedOfferId =
      action === "set_pathway"
        ? cleanText(body.offerId)
        : cleanText(body.offerId) || cleanText(client.offer_milestones_current_offer_id);
    const requestedMilestoneId =
      action === "set_pathway"
        ? cleanText(body.milestoneId)
        : cleanText(body.milestoneId) ||
          cleanText(client.offer_milestones_current_milestone_id);

    if (!requestedOfferId) {
      return jsonResponse({ error: "Choose a pathway first." }, 400);
    }
    if (!requestedMilestoneId) {
      return jsonResponse({ error: "Choose a milestone first." }, 400);
    }

    const { data: offer, error: offerError } = await supabase
      .from("company_offers")
      .select("glide_row_id, company_glide_row_id, name, status")
      .eq("glide_row_id", requestedOfferId)
      .eq("company_id", company.id)
      .eq("status", "active")
      .maybeSingle();

    if (offerError) throw offerError;
    if (!offer) {
      return jsonResponse(
        { error: "That pathway does not belong to this company." },
        400,
      );
    }

    const { data: offerMilestones, error: milestonesError } = await supabase
      .from("company_offer_milestones")
      .select("*")
      .eq("company_id", company.id)
      .eq("offer_id", requestedOfferId)
      .eq("status", "active")
      .order("position", { ascending: true, nullsFirst: false });

    if (milestonesError) throw milestonesError;

    const milestones = (offerMilestones ?? []) as Record<string, unknown>[];
    const selectedIndex = milestones.findIndex(
      (milestone) => milestone.glide_row_id === requestedMilestoneId,
    );

    if (selectedIndex < 0) {
      return jsonResponse(
        { error: "That milestone does not belong to the selected pathway." },
        400,
      );
    }

    const selectedMilestone = milestones[selectedIndex];
    const nextMilestone =
      action === "complete_milestone" ? milestones[selectedIndex + 1] : null;
    const now = new Date().toISOString();
    const startDate = normalizeDate(body.startDate, action === "start_milestone" ? now : undefined);
    const completionDate = normalizeDate(
      body.completionDate,
      action === "complete_milestone" ? now : undefined,
    );

    if (action === "start_milestone" && !startDate) {
      return jsonResponse({ error: "Add a valid start date." }, 400);
    }
    if (action === "complete_milestone" && !completionDate) {
      return jsonResponse({ error: "Add a valid completion date." }, 400);
    }

    const { data: existingProgress, error: existingError } = await supabase
      .from("client_milestones")
      .select("*")
      .eq("client_id", client.glide_row_id)
      .eq("milestone_id", requestedMilestoneId)
      .is("archived_at", null)
      .maybeSingle();

    if (existingError) throw existingError;

    const nextStartDate =
      startDate ?? (existingProgress?.start_date as string | null | undefined) ?? null;
    const nextCompletionDate =
      completionDate ??
      (existingProgress?.completion_date as string | null | undefined) ??
      null;
    const durationDays = daysBetween(nextStartDate, nextCompletionDate);
    const timeToHitDays = daysBetween(
      (client.client_age_date_onboarded as string | null | undefined) ?? null,
      nextCompletionDate,
    );
    const progressPayload = {
      company_id: company.id,
      company_glide_row_id: client.company_glide_row_id,
      glide_row_id:
        existingProgress?.glide_row_id ??
        `client_milestone_${crypto.randomUUID()}`,
      client_id: client.glide_row_id,
      offer_id: requestedOfferId,
      milestone_id: requestedMilestoneId,
      start_date: nextStartDate,
      completion_date: nextCompletionDate,
      duration_days: durationDays,
      time_to_hit_days: timeToHitDays,
      initiated_by_member_id:
        action === "start_milestone"
          ? actor.memberId
          : existingProgress?.initiated_by_member_id ?? null,
      completed_by_member_id:
        action === "complete_milestone"
          ? actor.memberId
          : existingProgress?.completed_by_member_id ?? null,
      initiated_by_name:
        action === "start_milestone"
          ? actor.name
          : existingProgress?.initiated_by_name ?? null,
      completed_by_name:
        action === "complete_milestone"
          ? actor.name
          : existingProgress?.completed_by_name ?? null,
      metadata: {
        ...(existingProgress?.metadata ?? {}),
        actor_role: actor.role,
        latest_action: action,
        created_or_updated_in: "retainos_milestone_write_pilot",
        mirrored_offer_name: offer.name,
        mirrored_milestone_name: selectedMilestone.name,
      },
    };

    const { data: progressRow, error: progressError } = existingProgress
      ? await supabase
          .from("client_milestones")
          .update(progressPayload)
          .eq("id", existingProgress.id)
          .select("*")
          .single()
      : await supabase
          .from("client_milestones")
          .insert(progressPayload)
          .select("*")
          .single();

    if (progressError) throw progressError;

    const clientUpdate: Record<string, unknown> = {};
    if (action === "set_pathway") {
      clientUpdate.offer_milestones_current_offer_id = requestedOfferId;
      clientUpdate.offer_milestones_current_milestone_id = requestedMilestoneId;
      clientUpdate.offer_milestones_current_milestone_change_date = now;
    } else if (action === "start_milestone") {
      clientUpdate.offer_milestones_current_offer_id = requestedOfferId;
      clientUpdate.offer_milestones_current_milestone_id = requestedMilestoneId;
      clientUpdate.offer_milestones_current_milestone_change_date = startDate;
    } else if (action === "complete_milestone") {
      clientUpdate.offer_milestones_current_offer_id = requestedOfferId;
      clientUpdate.offer_milestones_current_milestone_id =
        nextMilestone?.glide_row_id ?? requestedMilestoneId;
      clientUpdate.offer_milestones_current_milestone_change_date = completionDate;
    }

    const { data: updatedClient, error: updateError } = await supabase
      .from("clients")
      .update(clientUpdate)
      .eq("id", client.id)
      .select("*")
      .single();

    if (updateError) throw updateError;

    const selectedMilestoneName =
      (selectedMilestone.name as string | null) ?? requestedMilestoneId;
    const nextMilestoneName =
      (nextMilestone?.name as string | null | undefined) ?? null;
    const eventType =
      action === "start_milestone"
        ? "client_milestone_started"
        : action === "complete_milestone"
          ? "client_milestone_completed"
          : "client_pathway_changed";
    const summaryParts = [
      action === "set_pathway"
        ? `Changed pathway to ${offer.name} / ${selectedMilestoneName}.`
        : action === "start_milestone"
          ? `Started ${selectedMilestoneName}.`
          : `Completed ${selectedMilestoneName}.`,
      action === "complete_milestone" && nextMilestoneName
        ? `Moved client to ${nextMilestoneName}.`
        : null,
      durationDays !== null
        ? `Milestone duration: ${durationDays} day${durationDays === 1 ? "" : "s"}.`
        : null,
      timeToHitDays !== null
        ? `Time to hit from onboarding: ${timeToHitDays} day${timeToHitDays === 1 ? "" : "s"}.`
        : null,
    ].filter(Boolean);

    const { data: event, error: historyError } = await supabase
      .from("client_history_events")
      .insert({
        company_id: company.id,
        legacy_client_glide_row_id: clientLegacyId,
        actor_auth_user_id: userData.user.id,
        actor_member_id: actor.memberId,
        event_type: eventType,
        source: "client_milestone",
        title: titleForAction(action, selectedMilestoneName),
        summary: summaryParts.join(" "),
        notes: nullableText(body.notes),
        payload: {
          actor_role: actor.role,
          action,
          offer,
          selected_milestone: selectedMilestone,
          next_milestone: nextMilestone,
          progress: progressRow,
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
      event_type: eventType,
      source: "client_milestone",
      entity_table: "client_milestones",
      entity_id: progressRow.id,
      legacy_glide_row_id: progressRow.glide_row_id,
      title: event.title,
      summary: event.summary,
      before_data: existingProgress ?? client,
      after_data: progressRow,
      metadata: {
        history_event_id: event.id,
        actor_role: actor.role,
        action,
        client_id: updatedClient.id,
        selected_offer_id: requestedOfferId,
        selected_milestone_id: requestedMilestoneId,
        next_milestone_id: nextMilestone?.glide_row_id ?? null,
      },
    });

    return jsonResponse({
      ok: true,
      client: updatedClient,
      clientMilestone: progressRow,
      event,
      selectedMilestone,
      nextMilestone,
      isFinalMilestone:
        action === "complete_milestone" &&
        (Boolean(selectedMilestone.is_final_milestone) || !nextMilestone),
      durationDays,
      timeToHitDays,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    return jsonResponse({ error: message }, 500);
  }
});
