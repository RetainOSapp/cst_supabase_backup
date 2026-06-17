/// <reference path="../_shared/deno.d.ts" />

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const ACTIONS = new Set([
  "create_offer",
  "update_offer",
  "archive_offer",
  "unarchive_offer",
  "create_milestone",
  "update_milestone",
  "archive_milestone",
  "unarchive_milestone",
  "reorder_milestones",
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

function stringArray(value: unknown) {
  return Array.isArray(value)
    ? value.map((item) => cleanText(item)).filter(Boolean)
    : [];
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
  throw new Error("You do not have permission to manage company pathways.");
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
      return jsonResponse({ error: "Choose a valid pathway action." }, 400);
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
        { error: "This company is not enabled for RetainOS pathway writes." },
        400,
      );
    }

    const actor = await assertCanManageCompany(
      supabase,
      normalizeEmail(userData.user.email),
      company.id,
    );
    const isOfferAction = action.endsWith("_offer");
    const table = isOfferAction ? "company_offers" : "company_offer_milestones";
    const entityId = cleanText(body.entityId);
    const name = cleanText(body.name);

    let beforeData: Record<string, unknown> | null = null;
    let saved: Record<string, unknown> | null = null;
    let associatedRestoredMilestones: Record<string, unknown>[] | null = null;

    if (action === "reorder_milestones") {
      const offerId = cleanText(body.offerId);
      const milestoneIds = stringArray(body.milestoneIds);
      if (!offerId) return jsonResponse({ error: "Choose a pathway first." }, 400);
      if (milestoneIds.length === 0) {
        return jsonResponse({ error: "Provide the ordered milestone ids." }, 400);
      }
      if (new Set(milestoneIds).size !== milestoneIds.length) {
        return jsonResponse({ error: "Milestone order contains duplicates." }, 400);
      }

      const { data: offer, error: offerError } = await supabase
        .from("company_offers")
        .select("id, glide_row_id, name, status")
        .eq("company_id", company.id)
        .eq("glide_row_id", offerId)
        .eq("status", "active")
        .maybeSingle();
      if (offerError) throw offerError;
      if (!offer) return jsonResponse({ error: "Active pathway not found." }, 404);

      const { data: activeMilestones, error: milestoneError } = await supabase
        .from("company_offer_milestones")
        .select("id, glide_row_id, offer_id, name, position, status")
        .eq("company_id", company.id)
        .eq("offer_id", offerId)
        .eq("status", "active")
        .order("position", { ascending: true, nullsFirst: false });
      if (milestoneError) throw milestoneError;

      const existingIds = (activeMilestones ?? []).map((row) => row.glide_row_id);
      const requestedIds = new Set(milestoneIds);
      const missingIds = existingIds.filter((id) => !requestedIds.has(id));
      const unknownIds = milestoneIds.filter((id) => !existingIds.includes(id));
      if (missingIds.length > 0 || unknownIds.length > 0) {
        return jsonResponse(
          {
            error:
              "Reorder must include every active milestone for this pathway and no milestones from another pathway.",
            details: { missingIds, unknownIds },
          },
          400,
        );
      }

      const beforeOrder = (activeMilestones ?? []).map((row) => ({
        glide_row_id: row.glide_row_id,
        name: row.name,
        position: row.position,
      }));
      const originalPositions = new Map(
        (activeMilestones ?? []).map((row) => [row.glide_row_id, row.position ?? 0]),
      );

      try {
        for (const [index, milestoneId] of milestoneIds.entries()) {
          const { error: updateError } = await supabase
            .from("company_offer_milestones")
            .update({ position: index + 1 })
            .eq("company_id", company.id)
            .eq("offer_id", offerId)
            .eq("glide_row_id", milestoneId)
            .eq("status", "active");
          if (updateError) throw updateError;
        }
      } catch (updateError) {
        for (const [milestoneId, position] of originalPositions.entries()) {
          await supabase
            .from("company_offer_milestones")
            .update({ position })
            .eq("company_id", company.id)
            .eq("offer_id", offerId)
            .eq("glide_row_id", milestoneId);
        }
        throw updateError;
      }

      const { data: reordered, error: reorderedError } = await supabase
        .from("company_offer_milestones")
        .select("id, glide_row_id, offer_id, name, position, status")
        .eq("company_id", company.id)
        .eq("offer_id", offerId)
        .eq("status", "active")
        .order("position", { ascending: true, nullsFirst: false });
      if (reorderedError) throw reorderedError;

      await supabase.from("app_audit_events").insert({
        company_id: company.id,
        actor_auth_user_id: userData.user.id,
        actor_member_id: actor.memberId,
        event_type: "company_pathway_reorder_milestones",
        source: "company_pathway_admin",
        entity_table: "company_offer_milestones",
        entity_id: offer.id,
        legacy_glide_row_id: offerId,
        title: "reorder milestones",
        summary: `${offer.name ?? "Pathway"} milestones were reordered.`,
        before_data: { offer, order: beforeOrder },
        after_data: { offer, order: reordered ?? [] },
      });

      return jsonResponse({ ok: true, items: reordered ?? [] });
    }

    if (action.startsWith("create_")) {
      if (!name) return jsonResponse({ error: "Name is required." }, 400);
      const stableId = `${isOfferAction ? "offer" : "milestone"}_${crypto.randomUUID()}`;
      let nextMilestonePosition = optionalInteger(body.position);
      if (!isOfferAction && nextMilestonePosition === null) {
        const offerId = cleanText(body.offerId);
        const { data: existingMilestones, error: existingMilestonesError } =
          await supabase
            .from("company_offer_milestones")
            .select("position")
            .eq("company_id", company.id)
            .eq("offer_id", offerId)
            .eq("status", "active")
            .order("position", { ascending: false, nullsFirst: false })
            .limit(1);
        if (existingMilestonesError) throw existingMilestonesError;
        const maxPosition = Number(existingMilestones?.[0]?.position ?? 0);
        nextMilestonePosition = Number.isFinite(maxPosition) ? maxPosition + 1 : 1;
      }
      const payload = isOfferAction
        ? {
            company_id: company.id,
            company_glide_row_id: companyLegacyId,
            glide_row_id: stableId,
            name,
            metadata: { created_from: "manage-company-pathway" },
          }
        : {
            company_id: company.id,
            company_glide_row_id: companyLegacyId,
            offer_id: cleanText(body.offerId),
            glide_row_id: stableId,
            name,
            position: nextMilestonePosition ?? 0,
            target_days_to_complete: optionalInteger(body.targetDays),
            is_ttv_milestone: Boolean(body.isTtvMilestone),
            is_final_milestone: Boolean(body.isFinalMilestone),
            metadata: { created_from: "manage-company-pathway" },
          };
      if (!isOfferAction && !payload.offer_id) {
        return jsonResponse({ error: "Choose a pathway first." }, 400);
      }
      const { data, error } = await supabase.from(table).insert(payload).select("*").single();
      if (error) throw error;
      saved = data;
    } else {
      if (!entityId) return jsonResponse({ error: "Missing item id." }, 400);
      const { data: existing, error: existingError } = await supabase
        .from(table)
        .select("*")
        .eq("glide_row_id", entityId)
        .eq("company_id", company.id)
        .maybeSingle();
      if (existingError) throw existingError;
      if (!existing) return jsonResponse({ error: "Item not found." }, 404);
      beforeData = existing;

      if (action === "archive_offer" || action === "archive_milestone") {
        const field =
          action === "archive_offer"
            ? "offer_milestones_current_offer_id"
            : "offer_milestones_current_milestone_id";
        const { count, error: usageError } = await supabase
          .from("clients")
          .select("id", { count: "exact", head: true })
          .eq("company_id", company.id)
          .eq(field, entityId)
          .is("archived_at", null);
        if (usageError) throw usageError;
        if ((count ?? 0) > 0) {
          const { data: affectedClients, error: sampleError } = await supabase
            .from("clients")
            .select("glide_row_id, client_name, client_business")
            .eq("company_id", company.id)
            .eq(field, entityId)
            .is("archived_at", null)
            .order("client_name", { ascending: true })
            .limit(5);
          if (sampleError) throw sampleError;
          return jsonResponse(
            {
              error: `Move ${count} active client${count === 1 ? "" : "s"} off this ${
                action === "archive_offer" ? "pathway" : "milestone"
              } before archiving it.`,
              affectedCount: count ?? 0,
              affectedEntity: action === "archive_offer" ? "pathway" : "milestone",
              affectedClients: affectedClients ?? [],
            },
            400,
          );
        }
      }

      if (action === "unarchive_milestone") {
        const offerId = cleanText(existing.offer_id);
        if (!offerId) {
          return jsonResponse({ error: "Milestone is missing a pathway." }, 400);
        }
        const { data: parentOffer, error: parentOfferError } = await supabase
          .from("company_offers")
          .select("glide_row_id, status")
          .eq("company_id", company.id)
          .eq("glide_row_id", offerId)
          .maybeSingle();
        if (parentOfferError) throw parentOfferError;
        if (!parentOffer || parentOffer.status !== "active") {
          return jsonResponse(
            { error: "Restore the parent pathway before restoring this milestone." },
            400,
          );
        }
      }

      let payload: Record<string, unknown>;
      if (action.startsWith("archive_")) {
        payload = { status: "archived", archived_at: new Date().toISOString() };
      } else if (action.startsWith("unarchive_")) {
        payload = { status: "active", archived_at: null };
        if (action === "unarchive_milestone") {
          const { data: existingMilestones, error: existingMilestonesError } =
            await supabase
              .from("company_offer_milestones")
              .select("position")
              .eq("company_id", company.id)
              .eq("offer_id", cleanText(existing.offer_id))
              .eq("status", "active")
              .order("position", { ascending: false, nullsFirst: false })
              .limit(1);
          if (existingMilestonesError) throw existingMilestonesError;
          const maxPosition = Number(existingMilestones?.[0]?.position ?? 0);
          payload.position = Number.isFinite(maxPosition) ? maxPosition + 1 : 1;
        }
      } else {
        payload = isOfferAction
          ? { name }
          : {
              name,
              position: optionalInteger(body.position) ?? existing.position ?? 0,
              target_days_to_complete: optionalInteger(body.targetDays),
              is_ttv_milestone: Boolean(body.isTtvMilestone),
              is_final_milestone: Boolean(body.isFinalMilestone),
            };
      }
      if (
        !action.startsWith("archive_") &&
        !action.startsWith("unarchive_") &&
        !name
      ) {
        return jsonResponse({ error: "Name is required." }, 400);
      }
      const { data, error } = await supabase
        .from(table)
        .update(payload)
        .eq("glide_row_id", entityId)
        .eq("company_id", company.id)
        .select("*")
        .single();
      if (error) throw error;
      saved = data;

      if (action === "archive_offer") {
        await supabase
          .from("company_offer_milestones")
          .update({ status: "archived", archived_at: new Date().toISOString() })
          .eq("company_id", company.id)
          .eq("offer_id", entityId)
          .eq("status", "active");
      }
      if (action === "unarchive_offer") {
        const { data: restoredMilestones, error: restoreMilestonesError } =
          await supabase
            .from("company_offer_milestones")
            .update({ status: "active", archived_at: null })
            .eq("company_id", company.id)
            .eq("offer_id", entityId)
            .eq("status", "archived")
            .select("*");
        if (restoreMilestonesError) throw restoreMilestonesError;
        associatedRestoredMilestones = restoredMilestones ?? [];
      }
    }

    await supabase.from("app_audit_events").insert({
      company_id: company.id,
      actor_auth_user_id: userData.user.id,
      actor_member_id: actor.memberId,
      event_type: `company_pathway_${action}`,
      source: "company_pathway_admin",
      entity_table: table,
      entity_id: saved?.id ?? null,
      legacy_glide_row_id: (saved?.glide_row_id ?? entityId) || null,
      title: action.replaceAll("_", " "),
      summary: `${saved?.name ?? beforeData?.name ?? "Journey configuration"} was ${action.replaceAll("_", " ")}.`,
      before_data: beforeData,
      after_data: associatedRestoredMilestones
        ? { ...saved, restored_milestones: associatedRestoredMilestones }
        : saved,
    });

    return jsonResponse({
      ok: true,
      item: saved,
      restoredMilestones: associatedRestoredMilestones,
    });
  } catch (error) {
    console.error(error);
    const message =
      error instanceof Error
        ? error.message
        : typeof (error as { message?: unknown } | null)?.message === "string"
          ? String((error as { message: unknown }).message)
          : "Unexpected error.";
    return jsonResponse(
      { error: message },
      500,
    );
  }
});
