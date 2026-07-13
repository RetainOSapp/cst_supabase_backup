import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export type SupabaseServiceClient = ReturnType<typeof createClient>;

export type AuthenticatedActor = {
  id: string;
  email: string;
};

export class AuthError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "AuthError";
    this.status = status;
  }
}

export function cleanText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export function normalizeEmail(value: unknown) {
  return cleanText(value).toLowerCase();
}

export function getBearerToken(req: Request) {
  const auth = req.headers.get("Authorization") ?? "";
  return auth.match(/^Bearer\s+(.+)$/i)?.[1]?.trim() ?? "";
}

export function getEnabledGlobalWebhookFallbackSecret(...envNames: string[]) {
  if (Deno.env.get("ALLOW_GLOBAL_WEBHOOK_FALLBACK") !== "true") {
    return undefined;
  }
  for (const envName of envNames) {
    const value = Deno.env.get(envName)?.trim();
    if (value) return value;
  }
  return undefined;
}

export function createServiceClient() {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey =
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ??
    Deno.env.get("supabase_service_role");
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Missing Supabase configuration.");
  }
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });
}

async function sha256Hex(input: string) {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function timingSafeEqual(left: string, right: string) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

function extractJwtRole(token: string) {
  const parts = token.split(".");
  if (parts.length !== 3) return "";

  try {
    const normalized = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    const payload = JSON.parse(atob(padded)) as { role?: unknown };
    return typeof payload.role === "string" ? payload.role : "";
  } catch {
    return "";
  }
}

async function hasServiceRoleDatabaseAccess(token: string) {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!supabaseUrl || !anonKey) return false;

  try {
    const url = new URL("/rest/v1/security_rollout_history", supabaseUrl);
    url.searchParams.set("select", "version");
    url.searchParams.set("limit", "1");
    const response = await fetch(url, {
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${token}`,
      },
    });
    return response.ok;
  } catch {
    return false;
  }
}

export async function isServiceRoleRequest(req: Request) {
  const token = getBearerToken(req);
  const serviceRoleKey =
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ??
    Deno.env.get("supabase_service_role") ??
    "";
  if (!token || !serviceRoleKey) return false;

  const [submittedHash, configuredHash] = await Promise.all([
    sha256Hex(token),
    sha256Hex(serviceRoleKey),
  ]);
  if (timingSafeEqual(submittedHash, configuredHash)) return true;
  if (extractJwtRole(token) !== "service_role") return false;
  return hasServiceRoleDatabaseAccess(token);
}

export async function requireAuthenticatedActor(
  supabase: SupabaseServiceClient,
  token: string,
) {
  if (!token) throw new AuthError("Missing authorization.", 401);
  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  if (userError || !userData.user?.email) {
    throw new AuthError("Invalid session.", 401);
  }
  return {
    id: userData.user.id,
    email: userData.user.email,
  } satisfies AuthenticatedActor;
}

export async function isRegisteredSuperAdmin(
  supabase: SupabaseServiceClient,
  actor: AuthenticatedActor,
) {
  const { data, error } = await supabase
    .from("retainos_super_admins")
    .select("auth_user_id")
    .eq("auth_user_id", actor.id)
    .eq("status", "active")
    .maybeSingle();
  if (error) throw new Error("Could not verify Super Admin access.");
  return Boolean(data);
}

export async function requireSuperAdmin(
  supabase: SupabaseServiceClient,
  token: string,
) {
  const actor = await requireAuthenticatedActor(supabase, token);
  if (!await isRegisteredSuperAdmin(supabase, actor)) {
    throw new AuthError("Only Super Admins can perform this action.", 403);
  }
  return actor;
}
