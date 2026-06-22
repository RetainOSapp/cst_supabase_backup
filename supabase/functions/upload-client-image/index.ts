/// <reference path="../_shared/deno.d.ts" />

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const BUCKET = "client-images";
const MAX_SIZE = 5 * 1024 * 1024;
const ALLOWED_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);
const UPLOADER_ROLES = new Set(["director", "support", "csm"]);

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
  return auth.match(/^Bearer\s+(.+)$/i)?.[1] ?? "";
}

function safePathPart(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function extensionFromFile(file: File) {
  const fromName = file.name.split(".").pop()?.toLowerCase();
  if (fromName && /^[a-z0-9]+$/.test(fromName)) return fromName;
  if (file.type === "image/png") return "png";
  if (file.type === "image/webp") return "webp";
  if (file.type === "image/gif") return "gif";
  return "jpg";
}

async function ensureBucket(supabase: ReturnType<typeof createClient>) {
  const { data } = await supabase.storage.getBucket(BUCKET);
  if (data) return;
  const { error } = await supabase.storage.createBucket(BUCKET, {
    public: true,
    fileSizeLimit: MAX_SIZE,
    allowedMimeTypes: [...ALLOWED_TYPES],
  });
  if (error && !/already exists/i.test(error.message)) throw error;
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
    return { role: "super_admin", legacyMemberId: null };
  }

  const { data, error } = await supabase
    .from("company_members")
    .select("legacy_glide_row_id, role, status")
    .eq("company_id", companyId)
    .ilike("email", userEmail)
    .maybeSingle();

  if (error) throw error;
  if (data?.status === "active" && UPLOADER_ROLES.has(data.role)) {
    return {
      role: data.role as string,
      legacyMemberId: data.legacy_glide_row_id as string | null,
    };
  }

  throw new Error("You do not have permission to upload client images.");
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

    const formData = await req.formData();
    const file = formData.get("file");
    const companyLegacyId = cleanText(formData.get("companyLegacyId"));
    const clientLegacyId = cleanText(formData.get("clientLegacyId"));

    if (!(file instanceof File)) {
      return jsonResponse({ error: "Choose an image to upload." }, 400);
    }
    if (!companyLegacyId) {
      return jsonResponse({ error: "Missing company id." }, 400);
    }
    if (!ALLOWED_TYPES.has(file.type)) {
      return jsonResponse({ error: "Upload a JPG, PNG, WEBP, or GIF image." }, 400);
    }
    if (file.size > MAX_SIZE) {
      return jsonResponse({ error: "Client images must be 5 MB or smaller." }, 400);
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
        { error: "This company is not enabled for RetainOS image uploads." },
        400,
      );
    }

    const actor = await resolveActor(
      supabase,
      normalizeEmail(userData.user.email),
      company.id,
    );

    if (actor.role === "csm" && clientLegacyId) {
      const { data: client, error: clientError } = await supabase
        .from("clients")
        .select("csm_team_member_id, csm_secondary_assignee_id")
        .eq("company_id", company.id)
        .eq("glide_row_id", clientLegacyId)
        .maybeSingle();
      if (clientError) throw clientError;
      const isAssigned =
        actor.legacyMemberId &&
        (client?.csm_team_member_id === actor.legacyMemberId ||
          client?.csm_secondary_assignee_id === actor.legacyMemberId);
      if (!isAssigned) {
        return jsonResponse(
          { error: "CSMs can upload images for assigned clients only." },
          403,
        );
      }
    }

    await ensureBucket(supabase);

    const companyPath = safePathPart(companyLegacyId) || "company";
    const clientPath = safePathPart(clientLegacyId) || "new-client";
    const path = `${companyPath}/${clientPath}/${crypto.randomUUID()}.${extensionFromFile(file)}`;
    const bytes = new Uint8Array(await file.arrayBuffer());
    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(path, bytes, {
        cacheControl: "3600",
        upsert: false,
        contentType: file.type,
      });
    if (uploadError) throw uploadError;

    const { data: publicData } = supabase.storage.from(BUCKET).getPublicUrl(path);

    return jsonResponse({
      ok: true,
      publicUrl: publicData.publicUrl,
      path,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    return jsonResponse({ error: message }, 500);
  }
});
