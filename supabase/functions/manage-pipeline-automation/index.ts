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

const ACTIONS = new Set(["preview_renewals", "run_renewals"]);

function cleanText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeEmail(value: unknown) {
  return cleanText(value).toLowerCase();
}

function optionalDate(value: unknown) {
  const text = cleanText(value);
  if (!text) return new Date().toISOString();
  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) {
    throw new AuthError("Choose a valid automation date.", 400);
  }
  return parsed.toISOString();
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
      return respond({ error: "Choose preview_renewals or run_renewals." }, 400);
    }
    if (!companyLegacyId) return respond({ error: "Missing company." }, 400);

    const company = await loadCompany(supabase, companyLegacyId);
    const actor = await resolveManager(supabase, authenticatedActor, company.id);
    const asOf = optionalDate(body.asOf);
    const pipelineAccess = await loadPipelineAccess(supabase, company.id);

    if (!pipelineAccess.enabled) {
      if (action === "preview_renewals") {
        return respond({
          ok: true,
          enabled: false,
          asOf,
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
      const { data: pipeline, error: pipelineError } = await supabase
        .from("company_pipelines")
        .select("renewal_lead_days, automation_settings")
        .eq("company_id", company.id)
        .eq("id", pipelineId)
        .eq("pipeline_type", "renewal")
        .maybeSingle();
      if (pipelineError) throw pipelineError;
      if (!pipeline) throw new AuthError("Choose an enabled Renewal pipeline.", 400);

      const rows: Record<string, unknown>[] = [];
      const pageSize = 1000;
      for (let from = 0;; from += pageSize) {
        const { data, error } = await supabase
          .rpc(
            "preview_due_renewal_pipeline_items",
            { p_company_id: company.id, p_pipeline_id: pipelineId, p_as_of: asOf },
          )
          .order("client_id")
          .range(from, from + pageSize - 1);
        if (error) throw error;
        const page = (data ?? []) as Record<string, unknown>[];
        rows.push(...page);
        if (page.length < pageSize) break;
      }

      const candidates = rows.filter((row) => row.eligibility_status === "eligible");
      const exclusionCounts = rows.reduce<Record<string, number>>((counts, row) => {
        if (row.eligibility_status !== "excluded") return counts;
        const reason = cleanText(row.exclusion_reason) || "other";
        counts[reason] = (counts[reason] ?? 0) + 1;
        return counts;
      }, {});
      const leadDays = Math.max(0, Number(pipeline.renewal_lead_days) || 0);
      const settings = pipeline.automation_settings &&
          typeof pipeline.automation_settings === "object" &&
          !Array.isArray(pipeline.automation_settings)
        ? pipeline.automation_settings as Record<string, unknown>
        : {};
      const catchUpDays = Math.min(
        365,
        Math.max(0, Number(settings.catch_up_days) || 30),
      );
      const windowStart = new Date(asOf);
      windowStart.setUTCDate(windowStart.getUTCDate() - catchUpDays);
      const windowEnd = new Date(asOf);
      windowEnd.setUTCDate(windowEnd.getUTCDate() + leadDays);
      return respond({
        ok: true,
        enabled: true,
        pipelineId,
        asOf,
        windowStart: windowStart.toISOString(),
        windowEnd: windowEnd.toISOString(),
        leadDays,
        catchUpDays,
        totalEvaluated: rows.length,
        eligibleCount: candidates.length,
        excludedCount: rows.length - candidates.length,
        exclusionCounts,
        candidates,
      });
    }

    if (actor.role !== "super_admin") {
      throw new AuthError(
        "Only a Super Admin can run the local/manual renewal materialization step.",
        403,
      );
    }
    const runKey = cleanText(body.runKey) ||
      `manual-once:${cleanText(body.pipelineId)}:${asOf.slice(0, 10)}:${crypto.randomUUID()}`;
    const { data, error } = await supabase.rpc(
      "generate_due_renewal_pipeline_items",
      {
        p_company_id: company.id,
        p_as_of: asOf,
        p_run_key: runKey,
        p_requested_by_auth_user_id: authenticatedActor.id,
        p_requested_by_member_id: actor.memberId,
      },
    );
    if (error) throw error;
    const result = (Array.isArray(data) ? data[0] : data) as
      | Record<string, unknown>
      | null;
    if (typeof result?.error === "string" && result.error) {
      throw new AuthError(result.error, 500);
    }
    return respond({ ok: true, asOf, runKey, result });
  } catch (error) {
    console.error(error);
    const status = error instanceof AuthError ? error.status : 500;
    return respond(
      { error: error instanceof AuthError ? error.message : "Unexpected Pipeline automation error." },
      status,
    );
  }
});
