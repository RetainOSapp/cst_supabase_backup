import { resolveBeaconAccess } from "./_shared/access.mjs";
import { LIMITS, OPENAI_MODEL } from "./_shared/contracts.mjs";
import { finalizeUsage, reserveUsage } from "./_shared/database.mjs";
import { BeaconError } from "./_shared/errors.mjs";
import { runBeaconTurn } from "./_shared/orchestrator.mjs";
import { withDeadline } from "./_shared/request.mjs";
import { parseChatBody } from "./_shared/validation.mjs";

function emptyUsage() {
  return {
    model: OPENAI_MODEL,
    inputTokens: 0,
    cachedInputTokens: 0,
    outputTokens: 0,
    reasoningTokens: 0,
    estimatedCostMicros: 0,
  };
}

function accessError(reasonCode) {
  if (reasonCode === "global_unavailable") {
    return new BeaconError(
      reasonCode,
      503,
      "Beacon is temporarily unavailable for all companies.",
    );
  }
  if (
    reasonCode === "allowance_exhausted" ||
    reasonCode === "allowance_paused"
  ) {
    return new BeaconError(
      reasonCode,
      429,
      "Beacon's current usage allowance is not available.",
      { retryAfterSeconds: 60 },
    );
  }
  return new BeaconError(
    reasonCode ?? "access_denied",
    403,
    "Beacon access is not available for this account or company.",
  );
}

async function safetyIdentifier(actorId, companyId) {
  const bytes = new TextEncoder().encode(`beacon:${actorId}:${companyId}`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return `beacon_${Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")}`;
}

function inputCharacters(request) {
  return request.message.length + request.history.reduce(
    (total, item) => total + item.content.length,
    0,
  );
}

function publicToolActivity(activity) {
  return activity.map((entry) => ({
    tool: entry.tool,
    status: entry.status === "error"
      ? "failed"
      : entry.truncated
        ? "limited"
        : "completed",
  }));
}

export async function handleBeaconChat({
  body,
  token,
  requestId,
  serviceClient,
  authenticate,
  checkRegisteredSuperAdmin,
  providerFactory,
  now = () => Date.now(),
}) {
  const startedAt = now();
  const totalDeadlineMs = startedAt + LIMITS.totalRequestTimeoutMs;
  const workDeadlineMs = totalDeadlineMs - 3_000;
  const request = parseChatBody(body);
  let reservationId = null;
  let thrown = null;
  let outcome = "error";
  let result = null;
  let progress = {
    usage: emptyUsage(),
    toolActivity: [],
    providerResponseId: null,
    truncated: request.historyTruncated,
    costUncertain: false,
  };

  try {
    const access = await withDeadline(
      resolveBeaconAccess({
        serviceClient,
        token,
        companyId: request.companyId,
        authenticate,
        checkRegisteredSuperAdmin,
      }),
      workDeadlineMs,
      now,
    );
    if (!access.decision.allowed) {
      throw accessError(access.decision.reasonCode);
    }

    const reservation = await withDeadline(
      reserveUsage({
        serviceClient,
        requestId,
        actor: access.actor,
        context: access.context,
        inputChars: inputCharacters(request),
      }),
      workDeadlineMs,
      now,
    );
    reservationId = reservation.reservationId;

    const provider = providerFactory();
    result = await runBeaconTurn({
      provider,
      serviceClient,
      context: {
        ...access.context,
        actorAuthUserId: access.actor.id,
      },
      history: request.history,
      message: request.message,
      safetyIdentifier: await safetyIdentifier(
        access.actor.id,
        access.context.companyId,
      ),
      deadlineMs: workDeadlineMs,
      now,
      onProgress: (current) => {
        progress = {
          usage: current.usage,
          toolActivity: current.toolActivity,
          providerResponseId: current.providerResponseId,
          truncated: request.historyTruncated || current.truncated,
          costUncertain: false,
        };
      },
    });
    progress = {
      usage: result.usage,
      toolActivity: result.toolActivity,
      providerResponseId: result.providerResponseId,
      truncated: request.historyTruncated || result.truncated,
      costUncertain: false,
    };
    outcome = "success";
  } catch (error) {
    if (error instanceof BeaconError && error.costUncertain === true) {
      progress.costUncertain = true;
    }
    thrown = error;
    outcome = error instanceof BeaconError && error.category.startsWith("provider_")
      ? error.category
      : error instanceof BeaconError
        ? error.code
        : "error";
  } finally {
    if (reservationId) {
      try {
        await withDeadline(
          finalizeUsage({
            serviceClient,
            reservationId,
            requestId,
            outcome,
            usage: progress.usage,
            toolActivity: progress.toolActivity,
            latencyMs: now() - startedAt,
            providerResponseId: progress.providerResponseId,
            truncated: progress.truncated,
            costUncertain: progress.costUncertain,
          }),
          totalDeadlineMs,
          now,
        );
      } catch {
        thrown = new BeaconError(
          "usage_finalize_failed",
          503,
          "Beacon is temporarily unavailable.",
        );
      }
    }
  }

  if (thrown) throw thrown;
  return {
    requestId,
    answer: result.answer,
    toolActivity: publicToolActivity(result.toolActivity),
    ...(result.links.length > 0 ? { links: result.links } : {}),
    ...(progress.truncated ? { truncated: true } : {}),
  };
}
