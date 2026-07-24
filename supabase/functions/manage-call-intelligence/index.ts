// @ts-nocheck
/// <reference path="../_shared/deno.d.ts" />

import {
  AuthError,
  createServiceClient,
  getBearerToken,
  isRegisteredSuperAdmin,
  requireAuthenticatedActor,
} from "../_shared/auth.ts";
import { jsonResponse, optionsResponse } from "../_shared/http.ts";
import { dispatchCallIntelligenceRun } from "../_shared/call-intelligence-dispatch.mjs";
import { STRUCTURED_V2_PROMPT_VERSION } from "../_shared/call-intelligence-version.mjs";
import { sha256Hex } from "../ingest-call-intelligence/_shared/contracts.mjs";

const ACTIONS = new Set([
  "access",
  "list",
  "detail",
  "manual_upload",
  "reconcile",
  "ignore",
  "assign_member",
  "run_on_demand",
  "reprocess",
]);
const MAX_TRANSCRIPT_CHARACTERS = 500_000;
const ACTIVE_CLIENT_STATUSES = new Set([
  "front-end",
  "back-end",
  "paused",
  "suspended",
]);

class ManageError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "ManageError";
    this.status = status;
  }
}

function cleanText(value: unknown, maxLength = 500) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function normalizeEmail(value: unknown) {
  return cleanText(value, 320).toLowerCase();
}

function normalizeProgramStatus(value: unknown) {
  return cleanText(value, 100).toLowerCase().replace(/[_\s]+/g, "-");
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

async function resolveCompany(supabase, rawId: string) {
  const query = supabase
    .from("companies")
    .select("id, legacy_glide_row_id, name, migration_status")
    .in("migration_status", ["pilot", "migrated"]);
  const { data, error } = isUuid(rawId)
    ? await query.eq("id", rawId).maybeSingle()
    : await query.eq("legacy_glide_row_id", rawId).maybeSingle();
  if (error) throw error;
  if (!data) throw new ManageError("Call Intelligence company not found.", 404);
  return data;
}

async function actorAccess(supabase, actor, companyId: string) {
  if (await isRegisteredSuperAdmin(supabase, actor)) {
    return { role: "super_admin", member: null, csmEnabled: true };
  }
  const select = "id, legacy_glide_row_id, role, status, email";
  let { data: membership, error } = await supabase
    .from("company_members")
    .select(select)
    .eq("company_id", companyId)
    .eq("auth_user_id", actor.id)
    .maybeSingle();
  if (error) throw error;
  if (!membership) {
    const result = await supabase
      .from("company_members")
      .select(select)
      .eq("company_id", companyId)
      .ilike("email", normalizeEmail(actor.email))
      .maybeSingle();
    if (result.error) throw result.error;
    membership = result.data;
  }
  if (
    !membership ||
    membership.status !== "active" ||
    !["director", "support", "csm"].includes(membership.role)
  ) {
    throw new AuthError("You do not have Call Intelligence access.", 403);
  }
  let csmEnabled = false;
  if (membership.role === "csm") {
    const { data: settings, error: settingsError } = await supabase
      .from("company_settings")
      .select("enable_call_ai_for_csms")
      .eq("company_id", companyId)
      .maybeSingle();
    if (settingsError) throw settingsError;
    csmEnabled = settings?.enable_call_ai_for_csms === true;
    if (!csmEnabled) {
      throw new AuthError("Call Intelligence is not enabled for CSMs.", 403);
    }
  }
  return { role: membership.role, member: membership, csmEnabled };
}

async function callIntelligenceEnabled(supabase, companyId: string) {
  const { data, error } = await supabase
    .from("company_ai_feature_entitlements")
    .select("status, effective_from, effective_until")
    .eq("company_id", companyId)
    .eq("feature_key", "call_analysis")
    .maybeSingle();
  if (error) throw error;
  if (!data || !["pilot", "enabled"].includes(data.status)) return false;

  const now = Date.now();
  const effectiveFrom = data.effective_from
    ? Date.parse(data.effective_from)
    : null;
  const effectiveUntil = data.effective_until
    ? Date.parse(data.effective_until)
    : null;
  return (
    (effectiveFrom == null || effectiveFrom <= now) &&
    (effectiveUntil == null || effectiveUntil > now)
  );
}

function publicAccess(access) {
  const canUpload =
    access.role === "super_admin" || access.role === "director";
  return {
    role: access.role,
    canReconcile: canUpload,
    canUpload,
    canRun:
      access.role === "super_admin" ||
      access.role === "director" ||
      access.role === "csm",
  };
}

function memberAssignmentIds(access) {
  return [access.member?.id, access.member?.legacy_glide_row_id]
    .map((value) => cleanText(value))
    .filter(Boolean);
}

async function clientAuthorizedForCsm(supabase, access, clientId: string | null) {
  if (access.role !== "csm") return true;
  if (!clientId) return false;
  const { data, error } = await supabase
    .from("clients")
    .select("id, csm_team_member_id, csm_secondary_assignee_id")
    .eq("id", clientId)
    .maybeSingle();
  if (error) throw error;
  const ids = new Set(memberAssignmentIds(access));
  return Boolean(
    data &&
      (
        ids.has(String(data.csm_team_member_id ?? "")) ||
        ids.has(String(data.csm_secondary_assignee_id ?? ""))
      ),
  );
}

async function assertCallAccess(supabase, access, call, write = false) {
  if (access.role === "super_admin" || access.role === "director") return;
  if (write && access.role === "support") {
    throw new AuthError("Support access is read-only for Call Intelligence.", 403);
  }
  if (call.match_status !== "matched") {
    throw new AuthError("Reconciliation is restricted to Directors.", 403);
  }
  if (access.role === "support") return;
  if (
    access.role === "csm" &&
    await clientAuthorizedForCsm(supabase, access, call.client_id)
  ) {
    return;
  }
  throw new AuthError("You do not have access to this call.", 403);
}

function assertDirector(access) {
  if (access.role !== "super_admin" && access.role !== "director") {
    throw new AuthError(
      "Only Directors can reconcile or change Call Intelligence records.",
      403,
    );
  }
}

function requiredManualText(
  value: unknown,
  field: string,
  maxLength: number,
) {
  if (typeof value !== "string") {
    throw new ManageError(`${field} is required.`);
  }
  const text = value.trim();
  if (!text) throw new ManageError(`${field} is required.`);
  if (text.length > maxLength) {
    throw new ManageError(`${field} is too long.`);
  }
  return text;
}

function manualOccurredAt(value: unknown) {
  const text = requiredManualText(value, "occurredAt", 100);
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) {
    throw new ManageError("Choose a valid call date and time.");
  }
  return date.toISOString();
}

function manualDurationSeconds(value: unknown) {
  if (value == null || value === "") return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 86_400) {
    throw new ManageError(
      "Duration must be a whole number of seconds between 0 and 86400.",
    );
  }
  return parsed;
}

async function loadCall(supabase, companyId: string, callId: string) {
  const { data, error } = await supabase
    .from("call_intelligence_calls")
    .select("*")
    .eq("id", callId)
    .eq("company_id", companyId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new ManageError("Call not found.", 404);
  return data;
}

async function loadClients(supabase, companyId: string, ids: string[]) {
  if (ids.length === 0) return new Map();
  const { data, error } = await supabase
    .from("clients")
    .select("id, glide_row_id, client_name, client_business, client_email, program_status_value, csm_team_member_id, csm_secondary_assignee_id")
    .eq("company_id", companyId)
    .in("id", [...new Set(ids)]);
  if (error) throw error;
  return new Map((data ?? []).map((row) => [row.id, row]));
}

async function loadMembers(supabase, companyId: string, ids: string[]) {
  if (ids.length === 0) return new Map();
  const { data, error } = await supabase
    .from("company_members")
    .select("id, legacy_glide_row_id, name, email, role, status")
    .eq("company_id", companyId)
    .in("id", [...new Set(ids)]);
  if (error) throw error;
  return new Map((data ?? []).map((row) => [row.id, row]));
}

function resultSummary(result) {
  if (!result || typeof result !== "object") return null;
  return {
    schemaVersion: result.schema_version ?? null,
    callType: result.call_type ?? null,
    titleLabel: result.title_label ?? null,
    summary: result.summary ?? null,
    clientSentiment: result.client_sentiment?.label ?? null,
    teamMemberSentiment: result.team_member_sentiment?.label ?? null,
    callScore: result.call_score?.total ?? null,
  };
}

async function listCalls(supabase, company, access, body) {
  const limit = Math.min(200, Math.max(1, Number(body.limit ?? 100)));
  const { data, error } = await supabase
    .from("call_intelligence_calls")
    .select(
      "id, client_id, assigned_member_id, provider, provider_call_id, title, occurred_at, duration_seconds, recording_url, share_url, match_status, processing_status, match_reason, last_error_category, created_at, updated_at",
    )
    .eq("company_id", company.id)
    .order("occurred_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  let calls = data ?? [];

  if (access.role === "support") {
    calls = calls.filter((call) => call.match_status === "matched");
  } else if (access.role === "csm") {
    const candidateClientIds = [
      ...new Set(calls.map((call) => call.client_id).filter(Boolean)),
    ];
    const clients = await loadClients(supabase, company.id, candidateClientIds);
    const ids = new Set(memberAssignmentIds(access));
    calls = calls.filter((call) => {
      if (call.match_status !== "matched") return false;
      const client = clients.get(call.client_id);
      return Boolean(
        client &&
          (
            ids.has(String(client.csm_team_member_id ?? "")) ||
            ids.has(String(client.csm_secondary_assignee_id ?? ""))
          ),
      );
    });
  }

  const clientIds = calls.map((call) => call.client_id).filter(Boolean);
  const memberIds = calls.map((call) => call.assigned_member_id).filter(Boolean);
  const callIds = calls.map((call) => call.id);
  const [clients, members, runsResult] = await Promise.all([
    loadClients(supabase, company.id, clientIds),
    loadMembers(supabase, company.id, memberIds),
    callIds.length === 0
      ? Promise.resolve({ data: [], error: null })
      : supabase
          .from("call_intelligence_runs")
          .select("id, call_id, status, model, result_schema_version, result_json, completed_at")
          .eq("company_id", company.id)
          .eq("status", "succeeded")
          .in("call_id", callIds)
          .order("completed_at", { ascending: false }),
  ]);
  if (runsResult.error) throw runsResult.error;
  const latestRun = new Map();
  for (const run of runsResult.data ?? []) {
    if (!latestRun.has(run.call_id)) latestRun.set(run.call_id, run);
  }

  const rows = calls.map((call) => ({
    ...call,
    client: call.client_id ? clients.get(call.client_id) ?? null : null,
    assignedMember: call.assigned_member_id
      ? members.get(call.assigned_member_id) ?? null
      : null,
    analysis: resultSummary(latestRun.get(call.id)?.result_json),
  }));

  const analyzed = rows.filter((row) => Number.isFinite(row.analysis?.callScore));
  const averageScore =
    analyzed.length === 0
      ? null
      : analyzed.reduce((sum, row) => sum + row.analysis.callScore, 0) /
        analyzed.length;
  const sentimentCounts = (key) =>
    rows.reduce(
      (counts, row) => {
        const value = row.analysis?.[key];
        if (value in counts) counts[value] += 1;
        return counts;
      },
      { positive: 0, neutral: 0, negative: 0, insufficient_evidence: 0 },
    );

  return {
    calls: rows,
    metrics: {
      totalCalls: rows.length,
      averageScore,
      clientSentiment: sentimentCounts("clientSentiment"),
      teamMemberSentiment: sentimentCounts("teamMemberSentiment"),
      needsReconciliation: rows.filter(
        (row) => row.processing_status === "needs_reconciliation",
      ).length,
    },
  };
}

async function detail(supabase, company, access, callId: string) {
  const call = await loadCall(supabase, company.id, callId);
  await assertCallAccess(supabase, access, call);
  const [
    clients,
    members,
    transcriptResult,
    participantsResult,
    runsResult,
    promptsResult,
  ] =
    await Promise.all([
      loadClients(supabase, company.id, call.client_id ? [call.client_id] : []),
      loadMembers(
        supabase,
        company.id,
        call.assigned_member_id ? [call.assigned_member_id] : [],
      ),
      supabase
        .from("call_intelligence_transcripts")
        .select("transcript_text, character_count, source_format")
        .eq("call_id", call.id)
        .maybeSingle(),
      supabase
        .from("call_intelligence_participants")
        .select(
          "id, name, email_normalized, participant_kind, provider_role, matched_client_id, matched_member_id",
        )
        .eq("call_id", call.id)
        .order("created_at"),
      supabase
        .from("call_intelligence_runs")
        .select(
          "id, prompt_definition_id, prompt_version, run_kind, status, model, reasoning_effort, result_schema_version, result_json, result_text, error_category, created_at, completed_at",
        )
        .eq("call_id", call.id)
        .order("created_at", { ascending: false }),
      supabase
        .from("call_intelligence_prompt_definitions")
        .select("id, prompt_key, name, version, scope")
        .eq("run_mode", "manual")
        .eq("status", "active")
        .or(`company_id.is.null,company_id.eq.${company.id}`)
        .order("name"),
    ]);
  for (const result of [
    transcriptResult,
    participantsResult,
    runsResult,
    promptsResult,
  ]) {
    if (result.error) throw result.error;
  }
  return {
    call: {
      ...call,
      client: call.client_id ? clients.get(call.client_id) ?? null : null,
      assignedMember: call.assigned_member_id
        ? members.get(call.assigned_member_id) ?? null
        : null,
    },
    transcript: transcriptResult.data ?? null,
    participants: participantsResult.data ?? [],
    runs: runsResult.data ?? [],
    onDemandPrompts: promptsResult.data ?? [],
  };
}

async function basePrompt(supabase) {
  const { data, error } = await supabase
    .from("call_intelligence_prompt_definitions")
    .select("id, prompt_text, version")
    .eq("scope", "fixed")
    .eq("prompt_key", "structured_v2_base")
    .eq("version", STRUCTURED_V2_PROMPT_VERSION)
    .eq("status", "active")
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new ManageError("Base analysis prompt is unavailable.", 503);
  return data;
}

async function manualUploadOptions(supabase, companyId: string) {
  const [clientsResult, membersResult] = await Promise.all([
    supabase
      .from("clients")
      .select("id, client_name, client_business, client_email, program_status_value")
      .eq("company_id", companyId)
      .is("archived_at", null)
      .order("client_name")
      .limit(2_000),
    supabase
      .from("company_members")
      .select("id, name, email, role")
      .eq("company_id", companyId)
      .eq("status", "active")
      .is("archived_at", null)
      .order("name")
      .limit(1_000),
  ]);
  if (clientsResult.error) throw clientsResult.error;
  if (membersResult.error) throw membersResult.error;
  return {
    clients: (clientsResult.data ?? []).filter((client) =>
      ACTIVE_CLIENT_STATUSES.has(
        normalizeProgramStatus(client.program_status_value),
      )
    ),
    members: membersResult.data ?? [],
  };
}

async function manualUpload(supabase, company, access, actor, body) {
  assertDirector(access);
  const clientId = cleanText(body.clientId);
  const assignedMemberId = cleanText(body.assignedMemberId);
  if (!clientId) throw new ManageError("Choose a client.");
  if (!assignedMemberId) throw new ManageError("Choose a company team member.");

  const [clientResult, memberResult] = await Promise.all([
    supabase
      .from("clients")
      .select(
        "id, client_name, client_business, client_email, program_status_value, archived_at",
      )
      .eq("id", clientId)
      .eq("company_id", company.id)
      .maybeSingle(),
    supabase
      .from("company_members")
      .select("id, name, email, role, status, archived_at")
      .eq("id", assignedMemberId)
      .eq("company_id", company.id)
      .maybeSingle(),
  ]);
  if (clientResult.error) throw clientResult.error;
  if (memberResult.error) throw memberResult.error;
  const client = clientResult.data;
  const member = memberResult.data;
  if (
    !client ||
    client.archived_at ||
    !ACTIVE_CLIENT_STATUSES.has(
      normalizeProgramStatus(client.program_status_value),
    )
  ) {
    throw new ManageError("Choose an active client.");
  }
  if (!member || member.archived_at || member.status !== "active") {
    throw new ManageError("Choose an active company team member.");
  }

  const title = requiredManualText(body.title, "title", 500);
  const transcript = requiredManualText(
    body.transcript,
    "transcript",
    MAX_TRANSCRIPT_CHARACTERS,
  );
  const occurredAt = manualOccurredAt(body.occurredAt);
  const durationSeconds = manualDurationSeconds(body.durationSeconds);
  const prompt = await basePrompt(supabase);
  const transcriptHash = await sha256Hex(transcript);
  const promptHash = await sha256Hex(String(prompt.prompt_text));
  const now = new Date().toISOString();
  const providerCallId = `manual:${crypto.randomUUID()}`;

  const { data: call, error: callError } = await supabase
    .from("call_intelligence_calls")
    .insert({
      company_id: company.id,
      client_id: client.id,
      assigned_member_id: member.id,
      schema_version: "call_intelligence.v1",
      provider: "manual",
      provider_call_id: providerCallId,
      title,
      occurred_at: occurredAt,
      duration_seconds: durationSeconds,
      host_name: member.name ?? null,
      host_email_normalized: normalizeEmail(member.email) || null,
      match_status: "matched",
      processing_status: "queued",
      matched_by: "manual_upload",
      match_reason: "Client selected by an authorized RetainOS reviewer.",
      transcript_sha256: transcriptHash,
      queued_at: now,
    })
    .select("id, match_status, processing_status")
    .single();
  if (callError) throw callError;

  let run;
  try {
    const { error: transcriptError } = await supabase
      .from("call_intelligence_transcripts")
      .insert({
        call_id: call.id,
        transcript_text: transcript,
        transcript_sha256: transcriptHash,
        character_count: transcript.length,
        source_format: "plaintext",
      });
    if (transcriptError) throw transcriptError;

    const participantRows = [
      {
        call_id: call.id,
        name: member.name ?? null,
        email_normalized: normalizeEmail(member.email) || null,
        participant_kind: "internal",
        provider_role: "host",
        matched_client_id: null,
        matched_member_id: member.id,
        metadata: { source: "manual_upload" },
      },
      {
        call_id: call.id,
        name: client.client_name || client.client_business || null,
        email_normalized: normalizeEmail(client.client_email) || null,
        participant_kind: "external",
        provider_role: "invitee",
        matched_client_id: client.id,
        matched_member_id: null,
        metadata: { source: "manual_upload" },
      },
    ];
    if (
      participantRows[0].email_normalized &&
      participantRows[0].email_normalized ===
        participantRows[1].email_normalized
    ) {
      participantRows[1].email_normalized = null;
    }
    const { error: participantError } = await supabase
      .from("call_intelligence_participants")
      .insert(participantRows);
    if (participantError) throw participantError;

    const runResult = await supabase
      .from("call_intelligence_runs")
      .insert({
        company_id: company.id,
        call_id: call.id,
        prompt_definition_id: prompt.id,
        prompt_version: prompt.version,
        prompt_snapshot_sha256: promptHash,
        run_kind: "fixed",
        request_key: "manual_upload",
        status: "queued",
        created_by_auth_user_id: actor.id,
      })
      .select("id, status, run_kind, created_at")
      .single();
    if (runResult.error) throw runResult.error;
    run = runResult.data;
  } catch (childError) {
    await supabase.from("call_intelligence_calls").delete().eq("id", call.id);
    throw childError;
  }

  await audit(supabase, {
    actor,
    companyId: company.id,
    callId: call.id,
    title: "Call Intelligence transcript uploaded",
    summary:
      "An authorized reviewer uploaded one transcript and queued analysis.",
    metadata: {
      run_id: run.id,
      provider: "manual",
      client_id: client.id,
      assigned_member_id: member.id,
      transcript_character_count: transcript.length,
      transcript_sha256: transcriptHash,
    },
  });
  dispatchCallIntelligenceRun(run.id);
  return { call, run };
}

async function enqueueRun(
  supabase,
  companyId,
  callId,
  prompt,
  runKind,
  actorId,
) {
  const promptHash = await sha256Hex(String(prompt.prompt_text));
  const requestKey = crypto.randomUUID();
  const { data, error } = await supabase
    .from("call_intelligence_runs")
    .insert({
      company_id: companyId,
      call_id: callId,
      prompt_definition_id: prompt.id,
      prompt_version: prompt.version,
      prompt_snapshot_sha256: promptHash,
      run_kind: runKind,
      request_key: requestKey,
      status: "queued",
      created_by_auth_user_id: actorId,
    })
    .select("id, status, run_kind, created_at")
    .single();
  if (error) throw error;
  return data;
}

async function audit(supabase, { actor, companyId, callId, title, summary, metadata }) {
  const { error } = await supabase.from("app_audit_events").insert({
    company_id: companyId,
    actor_auth_user_id: actor.id,
    event_type: "call_intelligence_managed",
    source: "manage-call-intelligence",
    entity_table: "call_intelligence_calls",
    entity_id: callId,
    title,
    summary,
    metadata,
  });
  if (error) throw error;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return optionsResponse(req);
  if (req.method !== "POST") {
    return jsonResponse(req, { error: "Method not allowed." }, 405);
  }

  try {
    const supabase = createServiceClient();
    const actor = await requireAuthenticatedActor(supabase, getBearerToken(req));
    const body = await req.json().catch(() => ({}));
    const action = cleanText(body.action);
    if (!ACTIONS.has(action)) {
      return jsonResponse(req, { error: "Choose a valid action." }, 400);
    }
    const company = await resolveCompany(
      supabase,
      cleanText(body.companyId ?? body.companyLegacyId),
    );
    const access = await actorAccess(supabase, actor, company.id);
    const featureEnabled = await callIntelligenceEnabled(supabase, company.id);

    if (action === "access") {
      return jsonResponse(req, {
        ok: true,
        featureEnabled,
        access: publicAccess(access),
      });
    }

    if (!featureEnabled) {
      throw new AuthError(
        "Call Intelligence is not enabled for this company.",
        403,
      );
    }

    if (action === "list") {
      const publicActorAccess = publicAccess(access);
      return jsonResponse(req, {
        ok: true,
        featureEnabled: true,
        access: publicActorAccess,
        uploadOptions: publicActorAccess.canUpload
          ? await manualUploadOptions(supabase, company.id)
          : { clients: [], members: [] },
        ...(await listCalls(supabase, company, access, body)),
      });
    }

    if (action === "manual_upload") {
      const result = await manualUpload(
        supabase,
        company,
        access,
        actor,
        body,
      );
      return jsonResponse(req, { ok: true, ...result }, 202);
    }

    const callId = cleanText(body.callId);
    if (!callId) throw new ManageError("callId is required.");

    if (action === "detail") {
      return jsonResponse(req, {
        ok: true,
        ...(await detail(supabase, company, access, callId)),
      });
    }

    const call = await loadCall(supabase, company.id, callId);

    if (action === "reconcile") {
      assertDirector(access);
      await assertCallAccess(supabase, access, call, true);
      if (call.match_status === "matched") {
        throw new ManageError("Call is already matched.");
      }
      const clientId = cleanText(body.clientId);
      const { data: client, error } = await supabase
        .from("clients")
        .select("id, program_status_value, archived_at")
        .eq("id", clientId)
        .eq("company_id", company.id)
        .maybeSingle();
      if (error) throw error;
      if (
        !client ||
        client.archived_at ||
        !ACTIVE_CLIENT_STATUSES.has(
          String(client.program_status_value ?? "").trim().toLowerCase(),
        )
      ) {
        throw new ManageError("Choose an active client.");
      }
      const prompt = await basePrompt(supabase);
      const now = new Date().toISOString();
      const { error: updateError } = await supabase
        .from("call_intelligence_calls")
        .update({
          client_id: client.id,
          match_status: "matched",
          processing_status: "queued",
          matched_by: "manual_review",
          match_reason: "Matched by an authorized RetainOS reviewer.",
          reconciliation_note: cleanText(body.note, 1_000) || null,
          queued_at: now,
          last_error_category: null,
        })
        .eq("id", call.id);
      if (updateError) throw updateError;
      if (call.integration_intake_event_id) {
        const { error: eventError } = await supabase
          .from("integration_intake_events")
          .update({
            status: "processed",
            match_status: "matched",
            matched_client_id: client.id,
            matched_by: "manual_review",
            error_message: null,
            processed_at: now,
          })
          .eq("id", call.integration_intake_event_id);
        if (eventError) throw eventError;
      }
      const run = await enqueueRun(
        supabase,
        company.id,
        call.id,
        prompt,
        "fixed",
        actor.id,
      );
      await audit(supabase, {
        actor,
        companyId: company.id,
        callId: call.id,
        title: "Call Intelligence call reconciled",
        summary: "A call was matched to one client and queued for analysis.",
        metadata: { client_id: client.id, run_id: run.id },
      });
      dispatchCallIntelligenceRun(run.id);
      return jsonResponse(req, { ok: true, run });
    }

    if (action === "ignore") {
      assertDirector(access);
      await assertCallAccess(supabase, access, call, true);
      const { error } = await supabase
        .from("call_intelligence_calls")
        .update({
          match_status: "ignored",
          processing_status: "ignored",
          reconciliation_note: cleanText(body.note, 1_000) || null,
        })
        .eq("id", call.id);
      if (error) throw error;
      if (call.integration_intake_event_id) {
        await supabase
          .from("integration_intake_events")
          .update({
            status: "ignored",
            error_message: null,
            processed_at: new Date().toISOString(),
          })
          .eq("id", call.integration_intake_event_id);
      }
      await audit(supabase, {
        actor,
        companyId: company.id,
        callId: call.id,
        title: "Call Intelligence call ignored",
        summary: "A call was intentionally excluded from analysis.",
        metadata: {},
      });
      return jsonResponse(req, { ok: true });
    }

    if (action === "assign_member") {
      assertDirector(access);
      await assertCallAccess(supabase, access, call, true);
      const memberId = cleanText(body.memberId);
      const { data: member, error } = await supabase
        .from("company_members")
        .select("id, status")
        .eq("id", memberId)
        .eq("company_id", company.id)
        .maybeSingle();
      if (error) throw error;
      if (!member || member.status !== "active") {
        throw new ManageError("Choose an active company team member.");
      }
      const { error: updateError } = await supabase
        .from("call_intelligence_calls")
        .update({ assigned_member_id: member.id })
        .eq("id", call.id);
      if (updateError) throw updateError;
      await audit(supabase, {
        actor,
        companyId: company.id,
        callId: call.id,
        title: "Call Intelligence owner assigned",
        summary: "A company team member was assigned to the call.",
        metadata: { assigned_member_id: member.id },
      });
      return jsonResponse(req, { ok: true });
    }

    if (action === "reprocess") {
      assertDirector(access);
      await assertCallAccess(supabase, access, call, true);
      if (call.match_status !== "matched") {
        throw new ManageError("Reconcile the call before reprocessing.");
      }
      const prompt = await basePrompt(supabase);
      const run = await enqueueRun(
        supabase,
        company.id,
        call.id,
        prompt,
        "reprocess",
        actor.id,
      );
      await supabase
        .from("call_intelligence_calls")
        .update({
          processing_status: "queued",
          queued_at: new Date().toISOString(),
          last_error_category: null,
        })
        .eq("id", call.id);
      await audit(supabase, {
        actor,
        companyId: company.id,
        callId: call.id,
        title: "Call Intelligence reprocess queued",
        summary: "A fresh base analysis run was queued.",
        metadata: { run_id: run.id },
      });
      dispatchCallIntelligenceRun(run.id);
      return jsonResponse(req, { ok: true, run });
    }

    if (action === "run_on_demand") {
      await assertCallAccess(supabase, access, call);
      if (access.role === "support") {
        throw new AuthError(
          "Support access is read-only for Call Intelligence.",
          403,
        );
      }
      if (call.match_status !== "matched") {
        throw new ManageError("Reconcile the call before running prompts.");
      }
      const promptId = cleanText(body.promptId);
      const { data: prompt, error } = await supabase
        .from("call_intelligence_prompt_definitions")
        .select("id, company_id, prompt_text, version, run_mode, status")
        .eq("id", promptId)
        .maybeSingle();
      if (error) throw error;
      if (
        !prompt ||
        prompt.run_mode !== "manual" ||
        prompt.status !== "active" ||
        (prompt.company_id && prompt.company_id !== company.id)
      ) {
        throw new ManageError("Choose an active on-demand prompt.");
      }
      const run = await enqueueRun(
        supabase,
        company.id,
        call.id,
        prompt,
        "on_demand",
        actor.id,
      );
      await audit(supabase, {
        actor,
        companyId: company.id,
        callId: call.id,
        title: "On-demand Call Intelligence prompt queued",
        summary: "An authorized user queued an on-demand analysis.",
        metadata: { run_id: run.id, prompt_id: prompt.id },
      });
      dispatchCallIntelligenceRun(run.id);
      return jsonResponse(req, { ok: true, run });
    }

    throw new ManageError("Unsupported action.");
  } catch (error) {
    const status =
      error instanceof AuthError
        ? error.status
        : error instanceof ManageError
          ? error.status
          : 500;
    if (status === 500) {
      console.error("Call Intelligence management failed", {
        category: "unexpected_management_error",
      });
    }
    return jsonResponse(
      req,
      {
        error:
          status === 500
            ? "Call Intelligence request failed."
            : error.message,
      },
      status,
    );
  }
});
