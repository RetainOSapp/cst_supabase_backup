/// <reference path="../_shared/deno.d.ts" />

import {
  AuthError,
  createServiceClient,
  getBearerToken,
  isRegisteredSuperAdmin,
  requireAuthenticatedActor,
  type AuthenticatedActor,
  type SupabaseServiceClient,
} from "../_shared/auth.ts";
import { jsonResponse, optionsResponse } from "../_shared/http.ts";

const ACTIONS = new Set(["preview_renewals", "run_renewals", "status"]);
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function cleanText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeEmail(value: unknown) {
  return cleanText(value).toLowerCase();
}

function requiredIsoDate(value: unknown, label: string) {
  const date = cleanText(value);
  const parsed = new Date(`${date}T00:00:00.000Z`);
  if (
    !ISO_DATE_PATTERN.test(date) ||
    Number.isNaN(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== date
  ) {
    throw new AuthError(`${label} must be an ISO date.`, 400);
  }
  return date;
}

function boundedMaxItems(value: unknown) {
  const text = typeof value === "number" ? String(value) : cleanText(value);
  if (!/^\d+$/.test(text)) {
    throw new AuthError("Maximum items must be a whole number from 1 to 100.", 400);
  }
  const maxItems = Number(text);
  if (!Number.isSafeInteger(maxItems) || maxItems < 1 || maxItems > 100) {
    throw new AuthError("Maximum items must be a whole number from 1 to 100.", 400);
  }
  return maxItems;
}

function renewalCohort(body: Record<string, unknown>) {
  const renewalDateFrom = requiredIsoDate(body.renewalDateFrom, "Renewal from");
  const renewalDateTo = requiredIsoDate(body.renewalDateTo, "Renewal through");
  if (renewalDateFrom > renewalDateTo) {
    throw new AuthError("Renewal from must not be after renewal through.", 400);
  }
  const fromMs = Date.parse(`${renewalDateFrom}T00:00:00.000Z`);
  const toMs = Date.parse(`${renewalDateTo}T00:00:00.000Z`);
  if ((toMs - fromMs) / 86_400_000 > 366) {
    throw new AuthError("Renewal cohort dates cannot span more than 366 days.", 400);
  }
  return { renewalDateFrom, renewalDateTo, maxItems: boundedMaxItems(body.maxItems) };
}

async function loadCompany(
  supabase: SupabaseServiceClient,
  companyLegacyId: string,
) {
  const { data, error } = await supabase
    .from("companies")
    .select("id, legacy_glide_row_id, migration_status")
    .eq("legacy_glide_row_id", companyLegacyId)
    .in("migration_status", ["pilot", "migrated"])
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new AuthError("Renewal automation requires an app-owned company.", 400);
  return data;
}

async function resolveManager(
  supabase: SupabaseServiceClient,
  authenticatedActor: AuthenticatedActor,
  companyId: string,
) {
  if (await isRegisteredSuperAdmin(supabase, authenticatedActor)) {
    return { role: "super_admin", memberId: null };
  }

  const select = "id, role, status, is_read_only";
  const { data: byAuth, error: byAuthError } = await supabase
    .from("company_members")
    .select(select)
    .eq("company_id", companyId)
    .eq("auth_user_id", authenticatedActor.id)
    .maybeSingle();
  if (byAuthError) throw byAuthError;

  let membership = byAuth;
  if (!membership) {
    const { data: byEmail, error: byEmailError } = await supabase
      .from("company_members")
      .select(select)
      .eq("company_id", companyId)
      .eq("email", normalizeEmail(authenticatedActor.email))
      .maybeSingle();
    if (byEmailError) throw byEmailError;
    membership = byEmail;
  }

  if (
    !membership ||
    membership.status !== "active" ||
    membership.role !== "director" ||
    membership.is_read_only === true
  ) {
    throw new AuthError("Only a Super Admin or writable Director can preview renewal automation.", 403);
  }
  return { role: "director", memberId: membership.id as string };
}

async function loadPipelineAccess(
  supabase: SupabaseServiceClient,
  companyId: string,
) {
  const { data, error } = await supabase
    .from("company_settings")
    .select("enable_pipeline, enable_pipeline_director_access")
    .eq("company_id", companyId)
    .maybeSingle();
  if (error) throw error;
  return {
    enabled: data?.enable_pipeline === true,
    directorAccess: data?.enable_pipeline_director_access !== false,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return optionsResponse(req);
  const respond = (body: unknown, status = 200) => jsonResponse(req, body, status);
  if (req.method !== "POST") return respond({ error: "Method not allowed" }, 405);

  try {
    const supabase = createServiceClient();
    const authenticatedActor = await requireAuthenticatedActor(
      supabase,
      getBearerToken(req),
    );
    const body = await req.json().catch(() => ({}));
    const action = cleanText(body.action);
    const companyLegacyId = cleanText(body.companyLegacyId);
    if (!ACTIONS.has(action)) {
      return respond({ error: "Choose preview_renewals, run_renewals, or status." }, 400);
    }
    if (!companyLegacyId) return respond({ error: "Missing company." }, 400);

    const company = await loadCompany(supabase, companyLegacyId);
    const actor = await resolveManager(supabase, authenticatedActor, company.id);
    const pipelineAccess = await loadPipelineAccess(supabase, company.id);

    if (action === "status") {
      const { data, error } = await supabase.rpc("get_pipeline_automation_status", {
        p_company_id: company.id,
      });
      if (error) throw error;
      const result = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | null;
      if (!result) throw new Error("Pipeline automation status returned no result.");
      return respond(result);
    }

    if (!pipelineAccess.enabled) {
      if (action === "preview_renewals") {
        return respond({
          ok: true,
          enabled: false,
          asOf: new Date().toISOString(),
          candidates: [],
          totalEvaluated: 0,
          eligibleCount: 0,
          excludedCount: 0,
          exclusionCounts: {},
        });
      }
      throw new AuthError("Pipeline is disabled for this company.", 403);
    }
    if (actor.role === "director" && !pipelineAccess.directorAccess) {
      throw new AuthError("Pipeline access is disabled for Directors.", 403);
    }

    if (action === "preview_renewals") {
      const pipelineId = cleanText(body.pipelineId);
      if (!pipelineId) {
        return respond({ error: "Choose the Renewal pipeline to preview." }, 400);
      }
      const cohort = renewalCohort(body);
      const { data, error } = await supabase.rpc("preview_renewal_pipeline_cohort", {
        p_company_id: company.id,
        p_pipeline_id: pipelineId,
        p_renewal_date_from: cohort.renewalDateFrom,
        p_renewal_date_to: cohort.renewalDateTo,
        p_max_items: cohort.maxItems,
        p_actor_auth_user_id: authenticatedActor.id,
        p_actor_member_id: actor.memberId,
      });
      if (error) throw error;
      const result = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | null;
      if (!result) throw new Error("Cohort preview returned no result.");
      return respond({
        ok: true,
        enabled: true,
        pipelineId,
        asOf: result.previewed_at ?? new Date().toISOString(),
        windowStart: `${cohort.renewalDateFrom}T00:00:00.000Z`,
        windowEnd: `${cohort.renewalDateTo}T23:59:59.999Z`,
        leadDays: 0,
        catchUpDays: 0,
        totalEvaluated: Number(result.total_evaluated ?? 0),
        eligibleCount: Number(result.eligible_count ?? 0),
        selectedCount: Number(result.selected_count ?? 0),
        excludedCount: Number(result.excluded_count ?? 0),
        exclusionCounts: result.exclusion_counts ?? {},
        candidates: result.candidates ?? [],
        binding: result.binding ?? null,
      });
    }

    if (actor.role !== "super_admin") {
      throw new AuthError(
        "Only a Super Admin can run the local/manual renewal materialization step.",
        403,
      );
    }
    const pipelineId = cleanText(body.pipelineId);
    if (!pipelineId) return respond({ error: "Choose the Renewal pipeline to materialize." }, 400);
    const cohort = renewalCohort(body);
    const previewToken = cleanText(body.previewToken);
    if (!previewToken || previewToken.length > 256) {
      return respond({ error: "A valid renewal preview token is required." }, 400);
    }
    const { data, error } = await supabase.rpc("consume_renewal_pipeline_cohort", {
      p_company_id: company.id,
      p_pipeline_id: pipelineId,
      p_renewal_date_from: cohort.renewalDateFrom,
      p_renewal_date_to: cohort.renewalDateTo,
      p_max_items: cohort.maxItems,
      p_preview_token: previewToken,
      p_actor_auth_user_id: authenticatedActor.id,
      p_actor_member_id: actor.memberId,
    });
    if (error) throw error;
    const result = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | null;
    if (!result) throw new Error("Cohort materialization returned no result.");
    return respond({
      ok: true,
      pipelineId,
      createdCount: Number(result.created_count ?? 0),
      skippedCount: Number(result.skipped_count ?? 0),
      runId: result.run_id ?? null,
      idempotent: result.idempotent === true,
    });
  } catch (error) {
    console.error(error);
    const status = error instanceof AuthError ? error.status : 500;
    return respond(
      { error: error instanceof AuthError ? error.message : "Unexpected Pipeline automation error." },
      status,
    );
  }
});
