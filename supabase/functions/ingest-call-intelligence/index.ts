// @ts-nocheck
/// <reference path="../_shared/deno.d.ts" />

import { createServiceClient } from "../_shared/auth.ts";
import {
  jsonResponse,
  optionsResponse,
} from "../_shared/http.ts";
import { dispatchCallIntelligenceRun } from "../_shared/call-intelligence-dispatch.mjs";
import {
  ContractError,
  parseInboundCall,
  sha256Hex,
} from "./_shared/contracts.mjs";
import { classifyCallParticipants } from "./_shared/matcher.mjs";

const INTEGRATION_TYPE = "call_ai_transcript";
class IngestError extends Error {
  status: number;
  category: string;

  constructor(message: string, status = 400, category = "invalid_request") {
    super(message);
    this.name = "IngestError";
    this.status = status;
    this.category = category;
  }
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    .test(value);
}

function getSubmittedToken(req: Request) {
  const bearer = (req.headers.get("Authorization") ?? "")
    .match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  return (
    bearer ??
    req.headers.get("x-retainos-integration-token")?.trim() ??
    req.headers.get("x-webhook-secret")?.trim() ??
    ""
  );
}

function getClientIp(req: Request) {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("cf-connecting-ip") ??
    null
  );
}

function timingSafeEqual(left: string, right: string) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

async function resolveCompany(supabase: ReturnType<typeof createServiceClient>, rawId: string) {
  const query = supabase
    .from("companies")
    .select("id, legacy_glide_row_id, name, migration_status")
    .in("migration_status", ["pilot", "migrated"]);
  const { data, error } = isUuid(rawId)
    ? await query.eq("id", rawId).maybeSingle()
    : await query.eq("legacy_glide_row_id", rawId).maybeSingle();
  if (error) throw error;
  if (!data) {
    throw new IngestError(
      "Company is not enabled for app-owned Call Intelligence.",
      400,
      "company_not_enabled",
    );
  }
  return data;
}

async function validateCompanyToken(
  supabase: ReturnType<typeof createServiceClient>,
  companyId: string,
  submittedToken: string,
  clientIp: string | null,
) {
  if (!submittedToken) {
    throw new IngestError(
      "Missing company integration token.",
      401,
      "missing_integration_token",
    );
  }
  const submittedHash = await sha256Hex(submittedToken);
  const { data, error } = await supabase
    .from("company_integration_secrets")
    .select("id, token_hash, token_prefix, expires_at")
    .eq("company_id", companyId)
    .eq("integration_type", INTEGRATION_TYPE)
    .eq("status", "active");
  if (error) throw error;

  const now = Date.now();
  const token = (data ?? []).find((candidate) =>
    (!candidate.expires_at || new Date(candidate.expires_at).getTime() > now) &&
    timingSafeEqual(String(candidate.token_hash ?? ""), submittedHash)
  );
  if (!token) {
    throw new IngestError(
      "Invalid company integration token.",
      401,
      "invalid_integration_token",
    );
  }

  const { error: updateError } = await supabase
    .from("company_integration_secrets")
    .update({
      last_used_at: new Date().toISOString(),
      last_used_from: clientIp,
    })
    .eq("id", token.id);
  if (updateError) throw updateError;
  return token;
}

async function loadMatchCandidates(
  supabase: ReturnType<typeof createServiceClient>,
  companyId: string,
) {
  const [clientsResult, membersResult] = await Promise.all([
    supabase
      .from("clients")
      .select(
        "id, client_name, client_email, client_email_secondary, client_email_tertiary, program_status_value, archived_at",
      )
      .eq("company_id", companyId)
      .is("archived_at", null)
      .limit(5000),
    supabase
      .from("company_members")
      .select("id, name, email, status, archived_at")
      .eq("company_id", companyId)
      .limit(1000),
  ]);
  if (clientsResult.error) throw clientsResult.error;
  if (membersResult.error) throw membersResult.error;
  return {
    clients: clientsResult.data ?? [],
    members: membersResult.data ?? [],
  };
}

async function existingCall(
  supabase: ReturnType<typeof createServiceClient>,
  companyId: string,
  provider: string,
  providerCallId: string,
) {
  const { data, error } = await supabase
    .from("call_intelligence_calls")
    .select(
      "id, integration_intake_event_id, transcript_sha256, match_status, processing_status, created_at",
    )
    .eq("company_id", companyId)
    .eq("provider", provider)
    .eq("provider_call_id", providerCallId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

function duplicateResponse(
  req: Request,
  call: Record<string, unknown>,
  transcriptHash: string,
) {
  if (call.transcript_sha256 !== transcriptHash) {
    return jsonResponse(
      req,
      {
        ok: false,
        duplicate: true,
        needsReview: true,
        error:
          "This provider call ID already exists with different transcript content.",
        call: {
          id: call.id,
          matchStatus: call.match_status,
          processingStatus: call.processing_status,
        },
      },
      409,
    );
  }
  return jsonResponse(req, {
    ok: true,
    duplicate: true,
    call: {
      id: call.id,
      matchStatus: call.match_status,
      processingStatus: call.processing_status,
    },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return optionsResponse(
      req,
      "authorization, x-client-info, apikey, content-type, x-retainos-integration-token, x-webhook-secret",
    );
  }
  if (req.method !== "POST") {
    return jsonResponse(req, { error: "Method not allowed." }, 405);
  }

  let safeCategory = "unexpected_ingest_error";
  try {
    const body = await req.json().catch(() => {
      throw new IngestError("Request body must be valid JSON.", 400, "invalid_json");
    });
    const inbound = parseInboundCall(body);
    const transcriptHash = await sha256Hex(inbound.transcript);
    const supabase = createServiceClient();
    const company = await resolveCompany(supabase, inbound.companyId);
    const token = await validateCompanyToken(
      supabase,
      company.id,
      getSubmittedToken(req),
      getClientIp(req),
    );

    const duplicate = await existingCall(
      supabase,
      company.id,
      inbound.provider,
      inbound.externalCallId,
    );
    if (duplicate) {
      return duplicateResponse(req, duplicate, transcriptHash);
    }

    const { clients, members } = await loadMatchCandidates(supabase, company.id);
    const match = classifyCallParticipants({
      participants: inbound.participants,
      clients,
      members,
    });
    let basePrompt: Record<string, unknown> | null = null;
    let basePromptHash: string | null = null;
    if (match.processingStatus === "queued") {
      const { data, error } = await supabase
        .from("call_intelligence_prompt_definitions")
        .select("id, prompt_text, version")
        .eq("scope", "fixed")
        .eq("prompt_key", "structured_v2_base")
        .eq("version", "structured_v2_evidence_v1")
        .eq("status", "active")
        .maybeSingle();
      if (error) throw error;
      if (!data) {
        throw new IngestError(
          "Call Intelligence processing is not configured.",
          503,
          "processing_not_configured",
        );
      }
      basePrompt = data;
      basePromptHash = await sha256Hex(String(data.prompt_text));
    }

    const now = new Date().toISOString();
    const intakeStatus =
      match.processingStatus === "queued" ? "processed" : "needs_review";
    const intakePayload = {
      company_id: company.id,
      legacy_company_glide_row_id: company.legacy_glide_row_id,
      integration_type: INTEGRATION_TYPE,
      provider: inbound.provider,
      external_event_id: inbound.externalCallId,
      status: "received",
      match_status: match.matchStatus,
      matched_client_id: match.client?.id ?? null,
      matched_legacy_client_glide_row_id: null,
      matched_by: match.matchedBy,
      payload: {
        schema_version: inbound.schemaVersion,
        provider: inbound.provider,
        external_call_id: inbound.externalCallId,
        title: inbound.title,
        occurred_at: inbound.occurredAt,
        duration_seconds: inbound.durationSeconds,
        recording_url: inbound.recordingUrl,
        share_url: inbound.shareUrl,
        participant_count: inbound.participants.length,
      },
      metadata: {
        transcript_sha256: transcriptHash,
        transcript_character_count: inbound.transcript.length,
        integration_secret_id: token.id,
        integration_token_prefix: token.token_prefix,
        processing_contract: "call_intelligence.v1",
      },
    };
    let { data: intakeEvent, error: intakeError } = await supabase
      .from("integration_intake_events")
      .insert(intakePayload)
      .select("id, status")
      .single();

    if (intakeError) {
      if (String(intakeError.code) === "23505") {
        const concurrentDuplicate = await existingCall(
          supabase,
          company.id,
          inbound.provider,
          inbound.externalCallId,
        );
        if (concurrentDuplicate) {
          return duplicateResponse(req, concurrentDuplicate, transcriptHash);
        }
        const { data: existingEvent, error: existingEventError } = await supabase
          .from("integration_intake_events")
          .select("id, status, metadata")
          .eq("company_id", company.id)
          .eq("integration_type", INTEGRATION_TYPE)
          .eq("provider", inbound.provider)
          .eq("external_event_id", inbound.externalCallId)
          .maybeSingle();
        if (existingEventError) throw existingEventError;
        if (existingEvent?.status === "failed") {
          const { data: recoveredEvent, error: recoveryError } = await supabase
            .from("integration_intake_events")
            .update({
              ...intakePayload,
              error_message: null,
              processed_at: null,
              metadata: {
                ...intakePayload.metadata,
                recovered_from_failed_delivery: true,
              },
            })
            .eq("id", existingEvent.id)
            .eq("status", "failed")
            .select("id, status")
            .single();
          if (recoveryError) throw recoveryError;
          intakeEvent = recoveredEvent;
          intakeError = null;
        } else {
          return jsonResponse(
            req,
            {
              ok: true,
              duplicate: true,
              inProgress: true,
              eventId: existingEvent?.id ?? null,
            },
            202,
          );
        }
      }
      if (intakeError) throw intakeError;
    }

    const { data: call, error: callError } = await supabase
      .from("call_intelligence_calls")
      .insert({
        company_id: company.id,
        client_id: match.client?.id ?? null,
        integration_intake_event_id: intakeEvent.id,
        schema_version: inbound.schemaVersion,
        provider: inbound.provider,
        provider_call_id: inbound.externalCallId,
        title: inbound.title,
        occurred_at: inbound.occurredAt,
        duration_seconds: inbound.durationSeconds,
        recording_url: inbound.recordingUrl,
        share_url: inbound.shareUrl,
        host_name: inbound.host?.name ?? null,
        host_email_normalized: inbound.host?.email ?? null,
        match_status: match.matchStatus,
        processing_status: match.processingStatus,
        matched_by: match.matchedBy,
        match_reason: match.matchReason,
        transcript_sha256: transcriptHash,
        queued_at: match.processingStatus === "queued" ? now : null,
      })
      .select("id, match_status, processing_status")
      .single();
    if (callError) throw callError;

    let queuedRunId: string | null = null;
    try {
      const { error: transcriptError } = await supabase
        .from("call_intelligence_transcripts")
        .insert({
          call_id: call.id,
          transcript_text: inbound.transcript,
          transcript_sha256: transcriptHash,
          character_count: inbound.transcript.length,
          source_format: "plaintext",
        });
      if (transcriptError) throw transcriptError;

      if (match.participants.length > 0) {
        const { error: participantError } = await supabase
          .from("call_intelligence_participants")
          .insert(
            match.participants.map((participant) => ({
              call_id: call.id,
              name: participant.name,
              email_normalized: participant.email,
              participant_kind: participant.participantKind,
              provider_role: participant.provider_role ?? "invitee",
              matched_client_id: participant.matchedClientId,
              matched_member_id: participant.matchedMemberId,
              metadata: {
                provider_is_external: participant.is_external,
              },
            })),
          );
        if (participantError) throw participantError;
      }

      if (basePrompt && basePromptHash) {
        const { data: run, error: runError } = await supabase
          .from("call_intelligence_runs")
          .insert({
            company_id: company.id,
            call_id: call.id,
            prompt_definition_id: basePrompt.id,
            prompt_version: basePrompt.version,
            prompt_snapshot_sha256: basePromptHash,
            run_kind: "fixed",
            request_key: "auto",
            status: "queued",
          })
          .select("id")
          .single();
        if (runError) throw runError;
        queuedRunId = run.id;
      }
    } catch (childError) {
      await supabase.from("call_intelligence_calls").delete().eq("id", call.id);
      await supabase
        .from("integration_intake_events")
        .update({
          status: "failed",
          error_message: "Call Intelligence source storage failed.",
        })
        .eq("id", intakeEvent.id);
      throw childError;
    }

    const { error: finalizeError } = await supabase
      .from("integration_intake_events")
      .update({
        status: intakeStatus,
        match_status: match.matchStatus,
        matched_client_id: match.client?.id ?? null,
        matched_by: match.matchedBy,
        error_message:
          intakeStatus === "needs_review" ? match.matchReason : null,
        processed_at: now,
        metadata: {
          transcript_sha256: transcriptHash,
          transcript_character_count: inbound.transcript.length,
          integration_secret_id: token.id,
          integration_token_prefix: token.token_prefix,
          processing_contract: "call_intelligence.v1",
          call_intelligence_call_id: call.id,
        },
      })
      .eq("id", intakeEvent.id);
    if (finalizeError) throw finalizeError;

    await supabase.from("app_audit_events").insert({
      company_id: company.id,
      event_type: "call_intelligence_ingested",
      source: inbound.provider,
      entity_table: "call_intelligence_calls",
      entity_id: call.id,
      title: "Call Intelligence source ingested",
      summary:
        match.processingStatus === "queued"
          ? "A single-client call was queued for analysis."
          : "A call requires client reconciliation before analysis.",
      metadata: {
        integration_intake_event_id: intakeEvent.id,
        provider: inbound.provider,
        external_call_id: inbound.externalCallId,
        match_status: match.matchStatus,
        processing_status: match.processingStatus,
        participant_count: inbound.participants.length,
        transcript_character_count: inbound.transcript.length,
        transcript_sha256: transcriptHash,
      },
    });

    if (queuedRunId) {
      dispatchCallIntelligenceRun(queuedRunId);
    }

    return jsonResponse(
      req,
      {
        ok: true,
        duplicate: false,
        needsReview: match.processingStatus === "needs_reconciliation",
        call: {
          id: call.id,
          matchStatus: match.matchStatus,
          processingStatus: match.processingStatus,
        },
      },
      202,
    );
  } catch (error) {
    if (error instanceof ContractError) {
      safeCategory = "invalid_contract";
      return jsonResponse(
        req,
        { error: error.message, field: error.field },
        400,
      );
    }
    if (error instanceof IngestError) {
      safeCategory = error.category;
      return jsonResponse(req, { error: error.message }, error.status);
    }
    console.error("Call Intelligence ingest failed", { category: safeCategory });
    return jsonResponse(req, { error: "Call Intelligence ingestion failed." }, 500);
  }
});
