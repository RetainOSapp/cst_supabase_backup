/// <reference path="../_shared/deno.d.ts" />

import {
  AuthError,
  cleanText,
  createServiceClient,
  getBearerToken,
  isRegisteredSuperAdmin,
  normalizeEmail,
  requireAuthenticatedActor,
  type SupabaseServiceClient,
} from "../_shared/auth.ts";
import {
  jsonResponse as sharedJsonResponse,
  optionsResponse,
} from "../_shared/http.ts";

const ACTIONS = new Set(["create_resource", "update_resource", "archive_resource"]);
const RESOURCE_TYPES = new Set(["guide", "video", "template"]);
const STATUSES = new Set(["draft", "published", "archived"]);
const RESOURCE_SCOPES = new Set(["retainos_help", "company"]);

interface ResourceActor {
  id: string;
  role: "super_admin" | "director";
  companyLegacyIds: Set<string>;
}

class ResourceRequestError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

function jsonResponse(req: Request, body: unknown, status = 200) {
  return sharedJsonResponse(req, body, status);
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
  supabase: SupabaseServiceClient,
  token: string,
) {
  const actor = await requireAuthenticatedActor(supabase, token);
  const email = normalizeEmail(actor.email);
  if (!await isRegisteredSuperAdmin(supabase, actor)) {
    const { data: uuidMemberships, error: uuidMembershipError } = await supabase
      .from("company_members")
      .select("company_id, role, status")
      .eq("auth_user_id", actor.id)
      .eq("status", "active")
      .eq("role", "director");

    if (uuidMembershipError) throw uuidMembershipError;

    let memberships = uuidMemberships ?? [];
    if (memberships.length === 0) {
      const { data: emailMemberships, error: emailMembershipError } = await supabase
        .from("company_members")
        .select("company_id, role, status")
        .ilike("email", email)
        .eq("status", "active")
        .eq("role", "director");

      if (emailMembershipError) throw emailMembershipError;
      memberships = emailMemberships ?? [];
    }

    const companyIds: string[] = [
      ...new Set<string>(
        (memberships ?? [])
          .map((membership: { company_id?: unknown }) => membership.company_id)
          .filter((id: unknown): id is string => typeof id === "string" && Boolean(id)),
      ),
    ];

    if (companyIds.length === 0) {
      throw new AuthError(
        "Only Super Admins and Directors can manage resources.",
        403,
      );
    }

    const { data: companies, error: companyError } = await supabase
      .from("companies")
      .select("id, legacy_glide_row_id")
      .in("id", companyIds);

    if (companyError) throw companyError;

    const companyLegacyIds = new Set<string>(
      (companies ?? [])
        .map((company: { legacy_glide_row_id?: unknown }) => company.legacy_glide_row_id)
        .filter((id: unknown): id is string => typeof id === "string" && Boolean(id)),
    );

    if (companyLegacyIds.size === 0) {
      throw new AuthError("Director access is missing a company workspace.", 403);
    }

    return {
      id: actor.id,
      role: "director",
      companyLegacyIds,
    } satisfies ResourceActor;
  }

  return {
    id: actor.id,
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
    throw new AuthError("Directors can only manage company resources.", 403);
  }
  if (!companyLegacyId || !actor.companyLegacyIds.has(companyLegacyId)) {
    throw new AuthError(
      "Directors can only manage resources for their company.",
      403,
    );
  }
}

function assertCanManageExistingResource(
  actor: ResourceActor,
  resource: { scope?: string | null; company_legacy_id?: string | null } | null,
) {
  if (actor.role === "super_admin") return;
  if (!resource) throw new ResourceRequestError("Resource not found.", 404);
  assertCanManageResourceScope(
    actor,
    resource.scope ?? "retainos_help",
    resource.company_legacy_id ?? "",
  );
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return optionsResponse(req);
  }
  if (req.method !== "POST") {
    return jsonResponse(req, { error: "Method not allowed" }, 405);
  }

  try {
    const supabase = createServiceClient();
    const token = getBearerToken(req);
    if (!token) return jsonResponse(req, { error: "Missing authorization." }, 401);

    const actor = await resolveActor(supabase, token);
    const body = await req.json().catch(() => ({}));
    const action = cleanText(body.action);
    if (!ACTIONS.has(action)) {
      return jsonResponse(req, { error: "Choose a valid resource action." }, 400);
    }

    const resourceId = cleanText(body.resourceId);
    const now = new Date().toISOString();

    if (action === "archive_resource") {
      if (!resourceId) return jsonResponse(req, { error: "Missing resource id." }, 400);

      const { data: beforeData, error: beforeError } = await supabase
        .from("resources")
        .select("id, title, scope, company_legacy_id")
        .eq("id", resourceId)
        .maybeSingle();
      if (beforeError) throw beforeError;
      assertCanManageExistingResource(actor, beforeData);

      let archiveQuery = supabase
        .from("resources")
        .update({ status: "archived", updated_at: now })
        .eq("id", resourceId);

      if (actor.role === "director") {
        archiveQuery = archiveQuery
          .eq("scope", "company")
          .eq("company_legacy_id", beforeData?.company_legacy_id ?? "");
      }

      const { data, error } = await archiveQuery.select("*").single();
      if (error) throw error;

      return jsonResponse(req, { ok: true, resource: data });
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

    if (!title) return jsonResponse(req, { error: "Title is required." }, 400);
    if (!slug) return jsonResponse(req, { error: "Slug is required." }, 400);
    if (!RESOURCE_TYPES.has(type)) {
      return jsonResponse(req, { error: "Choose a valid resource type." }, 400);
    }
    if (!STATUSES.has(status)) {
      return jsonResponse(req, { error: "Choose a valid resource status." }, 400);
    }
    if (!RESOURCE_SCOPES.has(scope)) {
      return jsonResponse(req, { error: "Choose a valid resource library." }, 400);
    }
    if (scope === "company" && !companyLegacyId) {
      return jsonResponse(req, { error: "Choose a company for company resources." }, 400);
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

      return jsonResponse(req, { ok: true, resource: data });
    }

    if (!resourceId) return jsonResponse(req, { error: "Missing resource id." }, 400);

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
      throw new AuthError("Directors cannot move resources between companies.", 403);
    }

    let updateQuery = supabase
      .from("resources")
      .update(payload)
      .eq("id", resourceId);

    if (actor.role === "director") {
      updateQuery = updateQuery
        .eq("scope", "company")
        .eq("company_legacy_id", companyLegacyId);
    }

    const { data, error } = await updateQuery.select("*").single();
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

    return jsonResponse(req, { ok: true, resource: data });
  } catch (error) {
    console.error(error);
    const isAuthError = error instanceof AuthError;
    const isRequestError = error instanceof ResourceRequestError;
    return jsonResponse(
      req,
      {
        error: isAuthError || isRequestError
          ? error.message
          : "Unexpected resource management error.",
      },
      isAuthError ? error.status : isRequestError ? error.status : 500,
    );
  }
});
