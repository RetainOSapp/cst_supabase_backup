/// <reference path="../_shared/deno.d.ts" />

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const ACTIONS = new Set([
  "set_pathway",
  "set_secondary_pathway",
  "clear_secondary_pathway",
  "start_milestone",
  "complete_milestone",
  "start_secondary_milestone",
  "complete_secondary_milestone",
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
  if (action === "start_secondary_milestone")
    return `Secondary milestone started: ${milestoneName}`;
  if (action === "complete_secondary_milestone")
    return `Secondary milestone completed: ${milestoneName}`;
  if (action === "set_secondary_pathway")
    return `Secondary pathway changed: ${milestoneName}`;
  if (action === "clear_secondary_pathway") return "Secondary pathway cleared";
  return `Pathway changed: ${milestoneName}`;
}

function isStartAction(action: string) {
  return action === "start_milestone" || action === "start_secondary_milestone";
}

function isCompleteAction(action: string) {
  return (
    action === "complete_milestone" ||
    action === "complete_secondary_milestone"
  );
}

function isSecondaryMilestoneAction(action: string) {
  return (
    action === "start_secondary_milestone" ||
    action === "complete_secondary_milestone"
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

    const now = new Date().toISOString();
    const isPathwayChange =
      action === "set_pathway" ||
      action === "set_secondary_pathway" ||
      action === "clear_secondary_pathway";
    const isSecondaryMilestone = isSecondaryMilestoneAction(action);
    const isSecondaryWrite =
      action === "set_secondary_pathway" ||
      action === "clear_secondary_pathway" ||
      isSecondaryMilestone;
    const isComplete = isCompleteAction(action);
    const isStart = isStartAction(action);

    if (isPathwayChange && actor.role !== "super_admin" && actor.role !== "director") {
      return jsonResponse(
        { error: "Only Directors and Super Admins can change pathways." },
        403,
      );
    }

    if (isSecondaryWrite) {
      const { data: settings, error: settingsError } = await supabase
        .from("company_settings")
        .select("enable_secondary_offers")
        .eq("company_id", company.id)
        .maybeSingle();
      if (settingsError) throw settingsError;
      if (settings?.enable_secondary_offers !== true) {
        return jsonResponse(
          { error: "Enable Secondary Pathway in company settings first." },
          400,
        );
      }
    }

    if (action === "clear_secondary_pathway") {
      const beforeSecondary = {
        offer_id: client.secondary_offer_milestones_current_offer_id ?? null,
        milestone_id:
          client.secondary_offer_milestones_current_milestone_id ?? null,
      };
      const { data: updatedClient, error: updateError } = await supabase
        .from("clients")
        .update({
          secondary_offer_milestones_current_offer_id: null,
          secondary_offer_milestones_current_milestone_id: null,
          secondary_offer_milestones_current_milestone_change_date: now,
        })
        .eq("id", client.id)
        .select("*")
        .single();

      if (updateError) throw updateError;

      const { data: event, error: historyError } = await supabase
        .from("client_history_events")
        .insert({
          company_id: company.id,
          legacy_client_glide_row_id: clientLegacyId,
          actor_auth_user_id: userData.user.id,
          actor_member_id: actor.memberId,
          event_type: "client_secondary_pathway_cleared",
          source: "client_milestone",
          title: "Secondary pathway cleared",
          summary: "Cleared the client's secondary pathway.",
          notes: nullableText(body.notes),
          payload: {
            actor_role: actor.role,
            action,
            before_secondary: beforeSecondary,
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
        event_type: "client_secondary_pathway_cleared",
        source: "client_milestone",
        entity_table: "clients",
        entity_id: updatedClient.id,
        legacy_glide_row_id: updatedClient.glide_row_id,
        title: event.title,
        summary: event.summary,
        before_data: client,
        after_data: updatedClient,
        metadata: {
          history_event_id: event.id,
          actor_role: actor.role,
          action,
          client_id: updatedClient.id,
        },
      });

      return jsonResponse({
        ok: true,
        client: updatedClient,
        clientMilestone: null,
        event,
      });
    }

    const requestedOfferId =
      isPathwayChange
        ? cleanText(body.offerId)
        : cleanText(body.offerId) ||
          cleanText(
            isSecondaryMilestone
              ? client.secondary_offer_milestones_current_offer_id
              : client.offer_milestones_current_offer_id,
          );
    const requestedMilestoneId =
      isPathwayChange
        ? cleanText(body.milestoneId)
        : cleanText(body.milestoneId) ||
          cleanText(
            isSecondaryMilestone
              ? client.secondary_offer_milestones_current_milestone_id
              : client.offer_milestones_current_milestone_id,
          );

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
    const nextMilestone = isComplete ? milestones[selectedIndex + 1] : null;
    const startDate = normalizeDate(body.startDate, isStart ? now : undefined);
    const completionDate = normalizeDate(
      body.completionDate,
      isComplete ? now : undefined,
    );

    if (isStart && !startDate) {
      return jsonResponse({ error: "Add a valid start date." }, 400);
    }
    if (isComplete && !completionDate) {
      return jsonResponse({ error: "Add a valid completion date." }, 400);
    }

    const { data: existingProgress, error: existingError } =
      action === "set_secondary_pathway"
        ? { data: null, error: null }
        : await supabase
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
        isStart
          ? actor.memberId
          : existingProgress?.initiated_by_member_id ?? null,
      completed_by_member_id:
        isComplete
          ? actor.memberId
          : existingProgress?.completed_by_member_id ?? null,
      initiated_by_name:
        isStart
          ? actor.name
          : existingProgress?.initiated_by_name ?? null,
      completed_by_name:
        isComplete
          ? actor.name
          : existingProgress?.completed_by_name ?? null,
      metadata: {
        ...(existingProgress?.metadata ?? {}),
        actor_role: actor.role,
        latest_action: action,
        pathway_lane: isSecondaryMilestone ? "secondary" : "primary",
        created_or_updated_in: "retainos_milestone_write_pilot",
        mirrored_offer_name: offer.name,
        mirrored_milestone_name: selectedMilestone.name,
      },
    };

    const { data: progressRow, error: progressError } =
      action === "set_secondary_pathway"
        ? { data: null, error: null }
        : existingProgress
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
    } else if (action === "set_secondary_pathway") {
      clientUpdate.secondary_offer_milestones_current_offer_id = requestedOfferId;
      clientUpdate.secondary_offer_milestones_current_milestone_id =
        requestedMilestoneId;
      clientUpdate.secondary_offer_milestones_current_milestone_change_date = now;
    } else if (action === "start_milestone") {
      clientUpdate.offer_milestones_current_offer_id = requestedOfferId;
      clientUpdate.offer_milestones_current_milestone_id = requestedMilestoneId;
      clientUpdate.offer_milestones_current_milestone_change_date = startDate;
    } else if (action === "complete_milestone") {
      clientUpdate.offer_milestones_current_offer_id = requestedOfferId;
      clientUpdate.offer_milestones_current_milestone_id =
        nextMilestone?.glide_row_id ?? requestedMilestoneId;
      clientUpdate.offer_milestones_current_milestone_change_date = completionDate;
    } else if (action === "start_secondary_milestone") {
      clientUpdate.secondary_offer_milestones_current_offer_id = requestedOfferId;
      clientUpdate.secondary_offer_milestones_current_milestone_id =
        requestedMilestoneId;
      clientUpdate.secondary_offer_milestones_current_milestone_change_date =
        startDate;
    } else if (action === "complete_secondary_milestone") {
      clientUpdate.secondary_offer_milestones_current_offer_id = requestedOfferId;
      clientUpdate.secondary_offer_milestones_current_milestone_id =
        nextMilestone?.glide_row_id ?? requestedMilestoneId;
      clientUpdate.secondary_offer_milestones_current_milestone_change_date =
        completionDate;
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
      isStart
        ? "client_milestone_started"
        : isComplete
          ? "client_milestone_completed"
          : action === "set_secondary_pathway"
            ? "client_secondary_pathway_changed"
          : "client_pathway_changed";
    const laneLabel = isSecondaryMilestone ? "secondary " : "";
    const summaryParts = [
      action === "set_secondary_pathway"
        ? `Changed secondary pathway to ${offer.name} / ${selectedMilestoneName}.`
        : action === "set_pathway"
        ? `Changed pathway to ${offer.name} / ${selectedMilestoneName}.`
        : isStart
          ? `Started ${laneLabel}${selectedMilestoneName}.`
          : `Completed ${laneLabel}${selectedMilestoneName}.`,
      isComplete && nextMilestoneName
        ? `Moved ${isSecondaryMilestone ? "secondary pathway" : "client"} to ${nextMilestoneName}.`
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
          pathway_lane: isSecondaryMilestone ? "secondary" : "primary",
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
      entity_table:
        action === "set_secondary_pathway" ? "clients" : "client_milestones",
      entity_id:
        action === "set_secondary_pathway" ? updatedClient.id : progressRow.id,
      legacy_glide_row_id:
        action === "set_secondary_pathway"
          ? updatedClient.glide_row_id
          : progressRow.glide_row_id,
      title: event.title,
      summary: event.summary,
      before_data: existingProgress ?? client,
      after_data: action === "set_secondary_pathway" ? updatedClient : progressRow,
      metadata: {
        history_event_id: event.id,
        actor_role: actor.role,
        action,
        pathway_lane: isSecondaryMilestone ? "secondary" : "primary",
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
        isComplete &&
        (Boolean(selectedMilestone.is_final_milestone) || !nextMilestone),
      durationDays,
      timeToHitDays,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    return jsonResponse({ error: message }, 500);
  }
});
