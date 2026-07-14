import {
  LIMITS,
  OPENAI_MODEL,
  OPENAI_TOOLS,
  PRICE_CARD,
  SYSTEM_INSTRUCTIONS,
} from "./contracts.mjs";
import { BeaconError } from "./errors.mjs";
import {
  ProviderError,
  providerUsage,
  responseText,
  responseToolCalls,
} from "./provider.mjs";
import { executeTool } from "./tools.mjs";

function addUsage(total, current) {
  total.inputTokens += current.inputTokens;
  total.cachedInputTokens += current.cachedInputTokens;
  total.outputTokens += current.outputTokens;
  total.reasoningTokens += current.reasoningTokens;
}

export function estimateCostMicros(usage) {
  const uncached = Math.max(0, usage.inputTokens - usage.cachedInputTokens);
  return Math.max(
    0,
    Math.round(
      uncached * PRICE_CARD.inputMicrosPerToken +
        usage.cachedInputTokens * PRICE_CARD.cachedInputMicrosPerToken +
        usage.outputTokens * PRICE_CARD.outputMicrosPerToken,
    ),
  );
}

export function sanitizeAnswer(raw) {
  let text = typeof raw === "string" ? raw.trim() : "";
  if (!text) {
    throw new BeaconError(
      "provider_empty_response",
      502,
      "Beacon could not produce an answer for that request.",
    );
  }

  // Model-created paths never become clickable. Structured links are derived
  // separately from allow-listed, server-authorized tool rows.
  text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_match, label) => String(label));
  text = text.replace(/\b(?:https?:\/\/|javascript:|data:)\S+/gi, "[external link removed]");
  text = text.replace(/\/clients\/[A-Za-z0-9_-]+/g, "[internal reference removed]");
  text = text.replace(
    /\b[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}\b/gi,
    "[internal reference removed]",
  );
  text = text.replace(/\*\*([^*\n]+)\*\*/g, "$1");
  text = text.replace(/__([^_\n]+)__/g, "$1");

  if (text.length > LIMITS.maxAnswerChars) {
    return { answer: `${text.slice(0, LIMITS.maxAnswerChars).trimEnd()}…`, truncated: true };
  }
  return { answer: text, truncated: false };
}

function providerFailure(error) {
  if (!(error instanceof ProviderError)) return error;
  const diagnosticCategory = error.status > 0
    ? `${error.category}_${error.status}`
    : error.category;
  if (error.category === "provider_timeout") {
    return new BeaconError(
      "provider_timeout",
      504,
      "Beacon took too long to respond. Please try again.",
      { category: diagnosticCategory, costUncertain: error.costUncertain },
    );
  }
  if (error.category === "provider_rate_limited") {
    return new BeaconError(
      "provider_busy",
      503,
      "Beacon is temporarily busy. Please try again shortly.",
      { category: diagnosticCategory, costUncertain: error.costUncertain },
    );
  }
  return new BeaconError(
    "provider_unavailable",
    503,
    "Beacon is temporarily unavailable.",
    { category: diagnosticCategory, costUncertain: error.costUncertain },
  );
}

export async function runBeaconTurn({
  provider,
  serviceClient,
  context,
  history,
  message,
  safetyIdentifier,
  deadlineMs,
  now = () => Date.now(),
  onProgress = () => {},
}) {
  const input = [
    ...history.map((item) => ({ role: item.role, content: item.content })),
    { role: "user", content: message },
  ];
  const usage = {
    model: OPENAI_MODEL,
    inputTokens: 0,
    cachedInputTokens: 0,
    outputTokens: 0,
    reasoningTokens: 0,
    estimatedCostMicros: 0,
  };
  const toolActivity = [];
  let providerResponseId = null;
  let toolRounds = 0;
  let anyTruncated = false;
  const links = [];
  const linkPaths = new Set();

  for (;;) {
    if (now() >= deadlineMs) {
      throw new BeaconError("request_timeout", 504, "Beacon took too long to respond.");
    }

    let response;
    try {
      response = await provider.createResponse({
        input,
        instructions: SYSTEM_INSTRUCTIONS,
        tools: OPENAI_TOOLS,
        safetyIdentifier,
        deadlineMs,
      });
    } catch (error) {
      throw providerFailure(error);
    }

    providerResponseId =
      typeof response.id === "string" && response.id.length <= 200
        ? response.id
        : providerResponseId;
    addUsage(usage, providerUsage(response));
    usage.estimatedCostMicros = estimateCostMicros(usage);
    onProgress({
      usage: { ...usage },
      toolActivity: toolActivity.map((entry) => ({ ...entry })),
      providerResponseId,
      truncated: anyTruncated,
    });
    const toolCalls = responseToolCalls(response);
    if (toolCalls.length === 0) {
      const sanitized = sanitizeAnswer(responseText(response));
      usage.estimatedCostMicros = estimateCostMicros(usage);
      return {
        answer: sanitized.answer,
        toolActivity,
        links,
        truncated: anyTruncated || sanitized.truncated,
        usage,
        providerResponseId,
      };
    }

    if (toolCalls.length !== 1 || toolRounds >= LIMITS.maxToolRounds) {
      throw new BeaconError(
        "tool_round_limit",
        502,
        "Beacon could not complete that request within its safe tool limit.",
      );
    }

    const call = toolCalls[0];
    if (
      typeof call.call_id !== "string" ||
      typeof call.name !== "string" ||
      typeof call.arguments !== "string"
    ) {
      throw new BeaconError("tool_schema_denied", 502, "Beacon could not complete that request.");
    }

    const result = await executeTool({
      serviceClient,
      context,
      toolName: call.name,
      rawArguments: call.arguments,
      deadlineMs,
      now,
    });
    toolActivity.push({
      tool: result.tool,
      status: result.status,
      rowCount: result.rowCount,
      truncated: result.truncated,
    });
    for (const link of result.links) {
      if (links.length >= 8) break;
      if (linkPaths.has(link.path)) continue;
      linkPaths.add(link.path);
      links.push(link);
    }
    anyTruncated ||= result.truncated;
    toolRounds += 1;
    onProgress({
      usage: { ...usage },
      toolActivity: toolActivity.map((entry) => ({ ...entry })),
      providerResponseId,
      truncated: anyTruncated,
    });

    // Preserve the provider's immediately preceding output items, then append
    // only the server-produced tool result. No previous_response_id is used.
    input.push(...response.output);
    input.push({
      type: "function_call_output",
      call_id: call.call_id,
      output: result.output,
    });
  }
}
