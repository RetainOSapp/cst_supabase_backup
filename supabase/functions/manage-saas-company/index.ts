/// <reference path="../_shared/deno.d.ts" />

import {
  AuthError,
  createServiceClient,
  requireSuperAdmin,
} from "../_shared/auth.ts";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUBSCRIPTION_TIERS = new Set([
  "starter",
  "growth",
  "pro_enterprise_dfy",
]);

const DEFAULT_OUTCOME_DEFINITIONS = [
  { outcome_type: "success", value: "yes", label: "Yes", position: 10, positive_rank: 2 },
  { outcome_type: "success", value: "no", label: "No", position: 20, positive_rank: 1 },
  { outcome_type: "progress", value: "green", label: "Green", position: 10, positive_rank: 3 },
  { outcome_type: "progress", value: "yellow", label: "Yellow", position: 20, positive_rank: 2 },
  { outcome_type: "progress", value: "red", label: "Red", position: 30, positive_rank: 1 },
  { outcome_type: "buy_in", value: "green", label: "Green", position: 10, positive_rank: 3 },
  { outcome_type: "buy_in", value: "yellow", label: "Yellow", position: 20, positive_rank: 2 },
  { outcome_type: "buy_in", value: "red", label: "Red", position: 30, positive_rank: 1 },
] as const;

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

function getBearerToken(req: Request) {
  const auth = req.headers.get("Authorization") ?? "";
  return auth.match(/^Bearer\s+(.+)$/i)?.[1]?.trim() ?? "";
}

function retainOsKey(prefix: "ret" | "retm") {
  return `${prefix}_${crypto.randomUUID().replaceAll("-", "").slice(0, 16)}`;
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
  return "Unable to complete the workspace request.";
}

async function sendLoginInvite(
  supabase: ReturnType<typeof createServiceClient>,
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
    return { sent: false, provisioned: false, error: createError.message };
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  let createdCompanyId = "";
  try {
    const supabase = createServiceClient();
    const actor = await requireSuperAdmin(supabase, getBearerToken(req));
    const body = await req.json().catch(() => ({}));
    const action = cleanText(body.action) || "create_private_setup";

    if (action === "activate_and_invite_director") {
      const companyKey = cleanText(body.companyKey);
      if (!companyKey) return jsonResponse({ error: "Missing company id." }, 400);

      const { data: company, error: companyError } = await supabase
        .from("companies")
        .select("id, name, public_company_id, legacy_glide_row_id, metadata")
        .eq("legacy_glide_row_id", companyKey)
        .eq("migration_status", "migrated")
        .maybeSingle();
      if (companyError) throw companyError;
      if (!company) return jsonResponse({ error: "Workspace not found." }, 404);

      const metadata =
        company.metadata && typeof company.metadata === "object"
          ? company.metadata as Record<string, unknown>
          : {};
      const pendingDirector =
        metadata.pending_director && typeof metadata.pending_director === "object"
          ? metadata.pending_director as Record<string, unknown>
          : null;
      const directorName = cleanText(pendingDirector?.name);
      const directorEmail = normalizeEmail(pendingDirector?.email);
      if (metadata.data_origin !== "retainos_native" ||
          metadata.onboarding_state !== "private_setup" ||
          !directorName || !directorEmail) {
        return jsonResponse(
          { error: "This workspace is not awaiting a private-setup Director invite." },
          400,
        );
      }

      const { data: existingMember, error: existingMemberError } = await supabase
        .from("company_members")
        .select("id, email")
        .eq("company_id", company.id)
        .ilike("email", directorEmail)
        .eq("status", "active")
        .maybeSingle();
      if (existingMemberError) throw existingMemberError;
      if (existingMember) {
        return jsonResponse(
          { error: "This Director is already active in the workspace." },
          409,
        );
      }

      const { data: member, error: memberError } = await supabase
        .from("company_members")
        .insert({
          company_id: company.id,
          legacy_glide_row_id: retainOsKey("retm"),
          email: directorEmail,
          name: directorName,
          role: "director",
          is_read_only: false,
          hide_from_csm_list: false,
          status: "active",
          metadata: { created_from: "manage-saas-company", invite_status: "sent" },
        })
        .select("id, legacy_glide_row_id, email, name, role")
        .single();
      if (memberError) throw memberError;

      const invite = await sendLoginInvite(supabase, directorEmail);
      const nextMetadata = {
        ...metadata,
        onboarding_state: "active",
        director_invite_status: invite.sent ? "sent" : "delivery_failed",
        director_activated_at: new Date().toISOString(),
        director_activated_by: actor.id,
      };
      const { error: updateError } = await supabase
        .from("companies")
        .update({ metadata: nextMetadata })
        .eq("id", company.id);
      if (updateError) throw updateError;

      await supabase.from("app_audit_events").insert({
        company_id: company.id,
        actor_auth_user_id: actor.id,
        event_type: "company_private_setup_activated",
        source: "saas_client_onboarding",
        entity_table: "company_members",
        entity_id: member.id,
        legacy_glide_row_id: member.legacy_glide_row_id,
        title: "Private RetainOS workspace activated",
        summary: `${directorName} was activated as Director.${invite.sent ? " Login email sent." : " Login email delivery failed."}`,
        after_data: member,
        metadata: { invite },
      });

      return jsonResponse({ ok: true, member, invite });
    }

    if (action !== "create_private_setup") {
      return jsonResponse({ error: "Unsupported workspace action." }, 400);
    }

    const name = cleanText(body.name);
    const directorName = cleanText(body.directorName);
    const directorEmail = normalizeEmail(body.directorEmail);
    const logoUrl = cleanText(body.logoUrl) || null;
    const subscriptionTier = cleanText(body.subscriptionTier) || "pro_enterprise_dfy";

    if (!name) return jsonResponse({ error: "Company name is required." }, 400);
    if (!directorName) {
      return jsonResponse({ error: "First Director name is required." }, 400);
    }
    if (!directorEmail || !directorEmail.includes("@")) {
      return jsonResponse({ error: "A valid First Director email is required." }, 400);
    }
    if (!SUBSCRIPTION_TIERS.has(subscriptionTier)) {
      return jsonResponse({ error: "Choose a valid subscription tier." }, 400);
    }

    const { data: matchingCompany, error: matchingCompanyError } = await supabase
      .from("companies")
      .select("id, public_company_id, legacy_glide_row_id, status")
      .ilike("name", name)
      .is("archived_at", null)
      .limit(1)
      .maybeSingle();
    if (matchingCompanyError) throw matchingCompanyError;
    if (matchingCompany) {
      return jsonResponse(
        {
          error: "An active RetainOS workspace already uses this company name.",
          companyKey:
            matchingCompany.legacy_glide_row_id ?? matchingCompany.public_company_id,
        },
        409,
      );
    }

    // Existing routes and authorization scopes use this stable company key.
    // It is RetainOS-generated and never refers to a Glide record.
    const companyKey = retainOsKey("ret");
    const { data: company, error: companyError } = await supabase
      .from("companies")
      .insert({
        public_company_id: companyKey,
        legacy_glide_row_id: companyKey,
        name,
        status: "active",
        migration_status: "migrated",
        subscription_tier: subscriptionTier,
        logo_url: logoUrl,
        metadata: {
          data_origin: "retainos_native",
          onboarding_state: "private_setup",
          director_invite_status: "held",
          pending_director: { name: directorName, email: directorEmail },
          created_from: "manage-saas-company",
        },
      })
      .select("id, public_company_id, legacy_glide_row_id, name")
      .single();
    if (companyError) throw companyError;
    createdCompanyId = company.id;

    const { error: settingsError } = await supabase.from("company_settings").insert({
      company_id: company.id,
      metadata: {
        onboarding_state: "private_setup",
        initialized_by: "manage-saas-company",
      },
    });
    if (settingsError) throw settingsError;

    const { error: outcomeError } = await supabase
      .from("company_outcome_definitions")
      .insert(
        DEFAULT_OUTCOME_DEFINITIONS.map((definition) => ({
          company_id: company.id,
          ...definition,
          is_default: true,
          status: "active",
          metadata: { seeded_from: "manage-saas-company" },
        })),
      );
    if (outcomeError) throw outcomeError;

    await supabase.from("app_audit_events").insert({
      company_id: company.id,
      actor_auth_user_id: actor.id,
      event_type: "company_private_setup_created",
      source: "saas_client_onboarding",
      entity_table: "companies",
      entity_id: company.id,
      legacy_glide_row_id: company.legacy_glide_row_id,
      title: "Private RetainOS workspace created",
      summary: `${name} was created for private DFY setup. Director invite is held.`,
      after_data: company,
      metadata: { director_email: directorEmail, subscription_tier: subscriptionTier },
    });

    return jsonResponse({
      ok: true,
      company: {
        id: company.id,
        companyKey: company.legacy_glide_row_id,
        publicCompanyId: company.public_company_id,
        name: company.name,
      },
    });
  } catch (error) {
    if (createdCompanyId) {
      try {
        const supabase = createServiceClient();
        await supabase.from("companies").delete().eq("id", createdCompanyId);
      } catch {
        // Preserve the original creation failure; the company audit trail helps recovery.
      }
    }
    const status = error instanceof AuthError ? error.status : 500;
    return jsonResponse({ error: errorMessage(error) }, status);
  }
});
