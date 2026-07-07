/// <reference path="../_shared/deno.d.ts" />

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const WRITER_ROLES = new Set(["director", "support", "csm"]);
const LINK_TYPES = new Set(["audit", "drive", "supporting_doc", "other"]);

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

function normalizeUrl(value: unknown) {
  const text = cleanText(value);
  if (!text) return "";
  try {
    const url = new URL(text.startsWith("http") ? text : `https://${text}`);
    if (!["http:", "https:"].includes(url.protocol)) return "";
    return url.toString();
  } catch {
    return "";
  }
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

  throw new Error("You do not have permission to manage client links.");
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

    const body = await req.json().catch(() => ({}));
    const action = cleanText(body.action);
    const clientLegacyId = cleanText(body.clientLegacyId);

    if (!clientLegacyId) {
      return jsonResponse({ error: "Missing client id." }, 400);
    }

    const { data: client, error: clientError } = await supabase
      .from("clients")
      .select(
        "id, company_id, glide_row_id, client_name, csm_team_member_id, csm_secondary_assignee_id",
      )
      .eq("glide_row_id", clientLegacyId)
      .maybeSingle();

    if (clientError) throw clientError;
    if (!client) {
      return jsonResponse(
        { error: "Client links are available for RetainOS pilot clients only." },
        404,
      );
    }

    const { data: company, error: companyError } = await supabase
      .from("companies")
      .select("id, migration_status, legacy_glide_row_id")
      .eq("id", client.company_id)
      .in("migration_status", ["pilot", "migrated"])
      .maybeSingle();

    if (companyError) throw companyError;
    if (!company) {
      return jsonResponse(
        { error: "This company is not enabled for RetainOS client links." },
        400,
      );
    }

    const actor = await resolveActor(
      supabase,
      normalizeEmail(userData.user.email),
      company.id,
    );

    if (actor.role === "csm") {
      const legacyMemberId = actor.legacyMemberId;
      const isAssigned =
        legacyMemberId &&
        (client.csm_team_member_id === legacyMemberId ||
          client.csm_secondary_assignee_id === legacyMemberId);
      if (!isAssigned) {
        return jsonResponse(
          { error: "CSMs can manage links for assigned clients only." },
          403,
        );
      }
    }

    if (action === "archive") {
      const linkId = cleanText(body.linkId);
      if (!linkId) return jsonResponse({ error: "Missing link id." }, 400);

      const { data, error } = await supabase
        .from("client_links")
        .update({
          status: "archived",
          archived_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", linkId)
        .eq("company_id", company.id)
        .eq("legacy_client_glide_row_id", client.glide_row_id)
        .select("*")
        .single();

      if (error) throw error;
      return jsonResponse({ ok: true, item: data });
    }

    const label = cleanText(body.label);
    const url = normalizeUrl(body.url);
    const linkType = LINK_TYPES.has(cleanText(body.linkType))
      ? cleanText(body.linkType)
      : "supporting_doc";

    if (!label) return jsonResponse({ error: "Link label is required." }, 400);
    if (!url) return jsonResponse({ error: "Enter a valid http or https URL." }, 400);

    const { data, error } = await supabase
      .from("client_links")
      .insert({
        company_id: company.id,
        client_id: client.id,
        legacy_client_glide_row_id: client.glide_row_id,
        label,
        url,
        link_type: linkType,
        status: "active",
        metadata: { created_from: "client_detail" },
      })
      .select("*")
      .single();

    if (error) throw error;
    return jsonResponse({ ok: true, item: data });
  } catch (error) {
    console.error(error);
    return jsonResponse(
      { error: error instanceof Error ? error.message : "Unknown error" },
      500,
    );
  }
});
