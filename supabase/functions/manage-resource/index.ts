/// <reference path="../_shared/deno.d.ts" />

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const ACTIONS = new Set(["create_resource", "update_resource", "archive_resource"]);
const RESOURCE_TYPES = new Set(["guide", "video", "template"]);
const STATUSES = new Set(["draft", "published", "archived"]);
const RESOURCE_SCOPES = new Set(["retainos_help", "company"]);

interface ResourceActor {
  id: string;
  role: "super_admin" | "director";
  companyLegacyIds: Set<string>;
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

function slugify(value: string) {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function optionalInteger(value: unknown) {
  if (value === null || value === undefined || value === "") return 0;
  const number = Number(value);
  return Number.isFinite(number) ? Math.round(number) : 0;
}

async function resolveActor(
  supabase: ReturnType<typeof createClient>,
  token: string,
) {
  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  if (userError || !userData.user?.email) {
    throw new Error("Invalid session.");
  }

  const superAdminEmails = parseAllowlist(
    Deno.env.get("SUPER_ADMIN_EMAILS") ??
      Deno.env.get("VITE_SUPER_ADMIN_EMAILS"),
  );
  const email = normalizeEmail(userData.user.email);
  if (!superAdminEmails.has(email)) {
    const { data: memberships, error: membershipError } = await supabase
      .from("company_members")
      .select("company_id, role, status")
      .ilike("email", email)
      .eq("status", "active")
      .eq("role", "director");

    if (membershipError) throw membershipError;

    const companyIds = [
      ...new Set(
        (memberships ?? [])
          .map((membership) => membership.company_id)
          .filter((id): id is string => Boolean(id)),
      ),
    ];

    if (companyIds.length === 0) {
      throw new Error("Only Super Admins and Directors can manage resources.");
    }

    const { data: companies, error: companyError } = await supabase
      .from("companies")
      .select("id, legacy_glide_row_id")
      .in("id", companyIds);

    if (companyError) throw companyError;

    const companyLegacyIds = new Set(
      (companies ?? [])
        .map((company) => company.legacy_glide_row_id)
        .filter((id): id is string => Boolean(id)),
    );

    if (companyLegacyIds.size === 0) {
      throw new Error("Director access is missing a company workspace.");
    }

    return {
      id: userData.user.id,
      role: "director",
      companyLegacyIds,
    } satisfies ResourceActor;
  }

  return {
    id: userData.user.id,
    role: "super_admin",
    companyLegacyIds: new Set<string>(),
  } satisfies ResourceActor;
}

function assertCanManageResourceScope(
  actor: ResourceActor,
  scope: string,
  companyLegacyId: string,
) {
  if (actor.role === "super_admin") return;
  if (scope !== "company") {
    throw new Error("Directors can only manage company resources.");
  }
  if (!companyLegacyId || !actor.companyLegacyIds.has(companyLegacyId)) {
    throw new Error("Directors can only manage resources for their company.");
  }
}

function assertCanManageExistingResource(
  actor: ResourceActor,
  resource: { scope?: string | null; company_legacy_id?: string | null } | null,
) {
  if (actor.role === "super_admin") return;
  if (!resource) throw new Error("Resource not found.");
  assertCanManageResourceScope(
    actor,
    resource.scope ?? "retainos_help",
    resource.company_legacy_id ?? "",
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
      return jsonResponse({ error: "Missing Supabase configuration." }, 500);
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });
    const token = getBearerToken(req);
    if (!token) return jsonResponse({ error: "Missing authorization." }, 401);

    const actor = await resolveActor(supabase, token);
    const body = await req.json().catch(() => ({}));
    const action = cleanText(body.action);
    if (!ACTIONS.has(action)) {
      return jsonResponse({ error: "Choose a valid resource action." }, 400);
    }

    const resourceId = cleanText(body.resourceId);
    const now = new Date().toISOString();

    if (action === "archive_resource") {
      if (!resourceId) return jsonResponse({ error: "Missing resource id." }, 400);

      const { data: beforeData, error: beforeError } = await supabase
        .from("resources")
        .select("id, title, scope, company_legacy_id")
        .eq("id", resourceId)
        .maybeSingle();
      if (beforeError) throw beforeError;
      assertCanManageExistingResource(actor, beforeData);

      const { data, error } = await supabase
        .from("resources")
        .update({ status: "archived", updated_at: now })
        .eq("id", resourceId)
        .select("*")
        .single();
      if (error) throw error;

      return jsonResponse({ ok: true, resource: data });
    }

    const title = cleanText(body.title);
    const type = cleanText(body.type) || "guide";
    const status = cleanText(body.status) || "draft";
    const description = cleanText(body.description);
    const content = cleanText(body.content);
    const loomEmbedUrl = cleanText(body.loomEmbedUrl);
    const sortOrder = optionalInteger(body.sortOrder);
    const slug = slugify(cleanText(body.slug) || title);
    const scope = cleanText(body.scope) || "retainos_help";
    const companyLegacyId = cleanText(body.companyLegacyId);

    if (!title) return jsonResponse({ error: "Title is required." }, 400);
    if (!slug) return jsonResponse({ error: "Slug is required." }, 400);
    if (!RESOURCE_TYPES.has(type)) {
      return jsonResponse({ error: "Choose a valid resource type." }, 400);
    }
    if (!STATUSES.has(status)) {
      return jsonResponse({ error: "Choose a valid resource status." }, 400);
    }
    if (!RESOURCE_SCOPES.has(scope)) {
      return jsonResponse({ error: "Choose a valid resource library." }, 400);
    }
    if (scope === "company" && !companyLegacyId) {
      return jsonResponse({ error: "Choose a company for company resources." }, 400);
    }
    assertCanManageResourceScope(actor, scope, companyLegacyId);

    const payload = {
      slug,
      title,
      type,
      description,
      content,
      loom_embed_url: loomEmbedUrl || null,
      status,
      sort_order: sortOrder,
      is_dynamic: Boolean(body.isDynamic),
      dynamic_key: cleanText(body.dynamicKey) || null,
      scope,
      company_legacy_id: scope === "company" ? companyLegacyId : null,
      updated_at: now,
    };

    if (action === "create_resource") {
      const { data, error } = await supabase
        .from("resources")
        .insert(payload)
        .select("*")
        .single();
      if (error) throw error;

      await supabase.from("app_audit_events").insert({
        actor_auth_user_id: actor.id,
        event_type: "resource_create",
        source: "resources_admin",
        entity_table: "resources",
        entity_id: data.id,
        title: "resource created",
        summary: `${data.title} was created.`,
        after_data: data,
      });

      return jsonResponse({ ok: true, resource: data });
    }

    if (!resourceId) return jsonResponse({ error: "Missing resource id." }, 400);

    const { data: beforeData } = await supabase
      .from("resources")
      .select("*")
      .eq("id", resourceId)
      .maybeSingle();
    assertCanManageExistingResource(actor, beforeData);
    if (
      actor.role === "director" &&
      beforeData?.company_legacy_id &&
      beforeData.company_legacy_id !== companyLegacyId
    ) {
      throw new Error("Directors cannot move resources between companies.");
    }

    const { data, error } = await supabase
      .from("resources")
      .update(payload)
      .eq("id", resourceId)
      .select("*")
      .single();
    if (error) throw error;

    await supabase.from("app_audit_events").insert({
      actor_auth_user_id: actor.id,
      event_type: "resource_update",
      source: "resources_admin",
      entity_table: "resources",
      entity_id: data.id,
      title: "resource updated",
      summary: `${data.title} was updated.`,
      before_data: beforeData,
      after_data: data,
    });

    return jsonResponse({ ok: true, resource: data });
  } catch (error) {
    console.error(error);
    return jsonResponse(
      { error: error instanceof Error ? error.message : "Unexpected error." },
      500,
    );
  }
});
