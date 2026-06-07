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
  "create_milestone",
  "update_milestone",
  "archive_milestone",
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

    if (action.startsWith("create_")) {
      if (!name) return jsonResponse({ error: "Name is required." }, 400);
      const stableId = `${isOfferAction ? "offer" : "milestone"}_${crypto.randomUUID()}`;
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
            position: optionalInteger(body.position) ?? 0,
            target_days_to_complete: optionalInteger(body.targetDays),
            is_ttv_milestone: Boolean(body.isTtvMilestone),
            is_final_milestone: Boolean(body.isFinalMilestone),
            metadata: { created_from: "manage-company-pathway" },
          };
      if (!isOfferAction && !payload.offer_id) {
        return jsonResponse({ error: "Choose an offer first." }, 400);
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
          return jsonResponse(
            {
              error: `Move ${count} active client${count === 1 ? "" : "s"} off this ${
                action === "archive_offer" ? "offer" : "milestone"
              } before archiving it.`,
            },
            400,
          );
        }
      }

      const payload = action.startsWith("archive_")
        ? { status: "archived", archived_at: new Date().toISOString() }
        : isOfferAction
          ? { name }
          : {
              name,
              position: optionalInteger(body.position) ?? 0,
              target_days_to_complete: optionalInteger(body.targetDays),
              is_ttv_milestone: Boolean(body.isTtvMilestone),
              is_final_milestone: Boolean(body.isFinalMilestone),
            };
      if (!action.startsWith("archive_") && !name) {
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
