/// <reference path="../_shared/deno.d.ts" />

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const ROLES = new Set(["director", "support", "csm", "viewer"]);

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

function normalizeEmail(value: unknown) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function cleanText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
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

function normalizeRole(value: unknown) {
  const role = cleanText(value).toLowerCase();
  return ROLES.has(role) ? role : "";
}

function normalizeCapacity(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const num = Number(value);
  if (!Number.isFinite(num)) return null;
  return Math.max(0, Math.min(1000, num));
}

function wantsHeldInvite(value: unknown) {
  return value === true;
}

function errorMessage(error: unknown) {
  if (error instanceof Error && error.message) return error.message;
  if (
    error &&
    typeof error === "object" &&
    "message" in error &&
    typeof error.message === "string" &&
    error.message
  ) {
    return error.message;
  }
  return "Unexpected error";
}

async function sendLoginInvite(
  supabase: ReturnType<typeof createClient>,
  email: string,
) {
  const appUrl =
    Deno.env.get("RETAINOS_APP_URL") ??
    Deno.env.get("SITE_URL") ??
    Deno.env.get("APP_URL") ??
    "https://app.retainos.ai";
  const loginUrl = `${appUrl.replace(/\/$/, "")}/login`;
  const { error: createError } = await supabase.auth.admin.createUser({
    email,
    email_confirm: true,
  });
  const alreadyExists =
    createError?.message.toLowerCase().includes("already") ?? false;

  if (createError && !alreadyExists) {
    return {
      sent: false,
      provisioned: false,
      error: createError.message,
    };
  }

  const { error: otpError } = await supabase.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: false, emailRedirectTo: loginUrl },
  });

  if (otpError) {
    return {
      sent: false,
      provisioned: !alreadyExists,
      error: otpError.message,
    };
  }

  return {
    sent: true,
    provisioned: !alreadyExists,
    method: "email_otp",
    loginUrl,
  };
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
    .eq("status", "active")
    .limit(1)
    .maybeSingle();

  if (error) throw error;

  if (data && data.role === "director") {
    return { role: "director", memberId: data.id as string };
  }

  throw new Error("You do not have permission to manage this company team.");
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
    const companyLegacyId = cleanText(body.companyLegacyId);

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
        { error: "This company is not enabled for RetainOS team writes." },
        400,
      );
    }

    const actor = await assertCanManageCompany(supabase, userEmail, company.id);

    if (action === "create") {
      const name = cleanText(body.name);
      const email = normalizeEmail(body.email);
      const role = normalizeRole(body.role);
      if (!name) return jsonResponse({ error: "Name is required." }, 400);
      if (!email || !email.includes("@")) {
        return jsonResponse({ error: "Valid email is required." }, 400);
      }
      if (!role) return jsonResponse({ error: "Valid role is required." }, 400);

      const holdInvite = wantsHeldInvite(body.holdInvite);
      if (holdInvite && actor.role !== "super_admin") {
        return jsonResponse(
          { error: "Only a SuperAdmin can hold a team invite during private setup." },
          403,
        );
      }

      const payload = {
        company_id: company.id,
        email,
        name,
        photo_url: cleanText(body.photoUrl) || null,
        role,
        is_read_only: role === "viewer",
        hide_from_csm_list: Boolean(body.hideFromCsmList),
        capacity_number: normalizeCapacity(body.capacityNumber),
        status: holdInvite ? "pending" : "active",
        metadata: {
          created_from: "manage-company-member",
          actor_role: actor.role,
          invite_status: holdInvite ? "held" : "sent",
        },
      };

      const { data: member, error } = await supabase
        .from("company_members")
        .insert(payload)
        .select("*")
        .single();
      if (error) throw error;

      const invite = holdInvite
        ? { sent: false, held: true, provisioned: false }
        : await sendLoginInvite(supabase, email);

      await supabase.from("app_audit_events").insert({
        company_id: company.id,
        actor_auth_user_id: userData.user.id,
        actor_member_id: actor.memberId,
        event_type: "company_member_created",
        source: "team_admin",
        entity_table: "company_members",
        entity_id: member.id,
        title: "Company member created",
        summary: holdInvite
          ? `${name} was added as ${role}; the login invite is held.`
          : `${name} was added as ${role}.${
              invite.sent ? " Login email sent." : " Login email failed."
            }`,
        after_data: member,
        metadata: { invite },
      });

      return jsonResponse({ ok: true, member, invite });
    }

    if (action === "update") {
      const memberId = cleanText(body.memberId);
      if (!memberId) return jsonResponse({ error: "Missing member id." }, 400);

      const { data: existing, error: existingError } = await supabase
        .from("company_members")
        .select("*")
        .eq("id", memberId)
        .eq("company_id", company.id)
        .maybeSingle();
      if (existingError) throw existingError;
      if (!existing) return jsonResponse({ error: "Member not found." }, 404);

      const name = cleanText(body.name);
      const email = normalizeEmail(body.email);
      const role = normalizeRole(body.role);
      if (!name) return jsonResponse({ error: "Name is required." }, 400);
      if (!email || !email.includes("@")) {
        return jsonResponse({ error: "Valid email is required." }, 400);
      }
      if (!role) return jsonResponse({ error: "Valid role is required." }, 400);

      const payload = {
        email,
        name,
        photo_url: cleanText(body.photoUrl) || null,
        role,
        is_read_only: role === "viewer",
        hide_from_csm_list: Boolean(body.hideFromCsmList),
        capacity_number: normalizeCapacity(body.capacityNumber),
      };

      const { data: member, error } = await supabase
        .from("company_members")
        .update(payload)
        .eq("id", memberId)
        .eq("company_id", company.id)
        .select("*")
        .single();
      if (error) throw error;

      await supabase.from("app_audit_events").insert({
        company_id: company.id,
        actor_auth_user_id: userData.user.id,
        actor_member_id: actor.memberId,
        event_type: "company_member_updated",
        source: "team_admin",
        entity_table: "company_members",
        entity_id: member.id,
        legacy_glide_row_id: member.legacy_glide_row_id,
        title: "Company member updated",
        summary: `${member.name ?? member.email} was updated.`,
        before_data: existing,
        after_data: member,
      });

      return jsonResponse({ ok: true, member });
    }

    if (action === "send_invite") {
      const memberId = cleanText(body.memberId);
      if (!memberId) return jsonResponse({ error: "Missing member id." }, 400);

      const { data: member, error: memberError } = await supabase
        .from("company_members")
        .select("*")
        .eq("id", memberId)
        .eq("company_id", company.id)
        .maybeSingle();
      if (memberError) throw memberError;
      if (!member) return jsonResponse({ error: "Member not found." }, 404);
      if (member.status !== "active" && member.status !== "pending") {
        return jsonResponse(
          { error: "Only current team members can receive login invites." },
          400,
        );
      }

      const email = normalizeEmail(member.email);
      if (!email || !email.includes("@")) {
        return jsonResponse(
          { error: "This team member does not have a valid email." },
          400,
        );
      }

      const invite = await sendLoginInvite(supabase, email);

      let activatedMember = member;
      if (invite.sent && member.status === "pending") {
        const { data, error: activationError } = await supabase
          .from("company_members")
          .update({
            status: "active",
            metadata: {
              ...(member.metadata && typeof member.metadata === "object"
                ? member.metadata
                : {}),
              invite_status: "sent",
              invite_sent_at: new Date().toISOString(),
            },
          })
          .eq("id", member.id)
          .eq("company_id", company.id)
          .select("*")
          .single();
        if (activationError) throw activationError;
        activatedMember = data;
      }

      await supabase.from("app_audit_events").insert({
        company_id: company.id,
        actor_auth_user_id: userData.user.id,
        actor_member_id: actor.memberId,
        event_type: "company_member_invite_sent",
        source: "team_admin",
        entity_table: "company_members",
        entity_id: member.id,
        legacy_glide_row_id: member.legacy_glide_row_id,
        title: invite.sent ? "Company member invite sent" : "Company member invite failed",
        summary: invite.sent
          ? `Login email sent to ${member.name ?? member.email}.`
          : `Login email failed for ${member.name ?? member.email}.`,
        after_data: activatedMember,
        metadata: { invite },
      });

      return jsonResponse({ ok: true, member: activatedMember, invite });
    }

    if (action === "archive") {
      const memberId = cleanText(body.memberId);
      if (!memberId) return jsonResponse({ error: "Missing member id." }, 400);

      const { data: existing, error: existingError } = await supabase
        .from("company_members")
        .select("*")
        .eq("id", memberId)
        .eq("company_id", company.id)
        .maybeSingle();
      if (existingError) throw existingError;
      if (!existing) return jsonResponse({ error: "Member not found." }, 404);

      const { data: member, error } = await supabase
        .from("company_members")
        .update({
          status: "archived",
          archived_at: new Date().toISOString(),
        })
        .eq("id", memberId)
        .eq("company_id", company.id)
        .select("*")
        .single();
      if (error) throw error;

      await supabase.from("app_audit_events").insert({
        company_id: company.id,
        actor_auth_user_id: userData.user.id,
        actor_member_id: actor.memberId,
        event_type: "company_member_archived",
        source: "team_admin",
        entity_table: "company_members",
        entity_id: member.id,
        legacy_glide_row_id: member.legacy_glide_row_id,
        title: "Company member archived",
        summary: `${member.name ?? member.email} was archived.`,
        before_data: existing,
        after_data: member,
      });

      return jsonResponse({ ok: true, member });
    }

    return jsonResponse({ error: "Unsupported action." }, 400);
  } catch (error) {
    return jsonResponse({ error: errorMessage(error) }, 500);
  }
});
