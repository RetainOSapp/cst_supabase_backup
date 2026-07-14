import {
  LIMITS,
  OPENAI_MODEL,
  OPENAI_REASONING_EFFORT,
} from "./contracts.mjs";

export class ProviderError extends Error {
  constructor(category, status = 0, { costUncertain = false } = {}) {
    super(category);
    this.name = "ProviderError";
    this.category = category;
    this.status = status;
    this.costUncertain = costUncertain === true;
  }
}

function hasTrustworthyUsage(payload) {
  const usage = payload?.usage;
  if (
    !usage ||
    !Number.isInteger(usage.input_tokens) ||
    usage.input_tokens < 0 ||
    !Number.isInteger(usage.output_tokens) ||
    usage.output_tokens < 0
  ) {
    return false;
  }
  const cached = usage.input_tokens_details?.cached_tokens;
  if (cached != null && (!Number.isInteger(cached) || cached < 0 || cached > usage.input_tokens)) {
    return false;
  }
  const reasoning = usage.output_tokens_details?.reasoning_tokens;
  return reasoning == null ||
    (Number.isInteger(reasoning) && reasoning >= 0 && reasoning <= usage.output_tokens);
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function boundedTimeout(now, deadlineMs) {
  return Math.max(1, Math.min(LIMITS.providerTimeoutMs, deadlineMs - now()));
}

function safeDiagnosticPart(value) {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  return /^[a-z0-9_.-]{1,64}$/.test(normalized) ? normalized : null;
}

async function rejectionCategory(response, fallback) {
  const payload = await response.json().catch(() => null);
  const code = safeDiagnosticPart(payload?.error?.code);
  const param = safeDiagnosticPart(payload?.error?.param);
  return [fallback, code, param].filter(Boolean).join(".");
}

export function createOpenAIResponsesProvider({
  apiKey,
  fetchImpl = fetch,
  now = () => Date.now(),
  sleepImpl = delay,
  random = Math.random,
} = {}) {
  return {
    async createResponse({ input, instructions, tools, safetyIdentifier, deadlineMs }) {
      if (typeof apiKey !== "string" || apiKey.trim() === "") {
        throw new ProviderError("provider_not_configured");
      }

      const body = {
        model: OPENAI_MODEL,
        reasoning: { effort: OPENAI_REASONING_EFFORT },
        instructions,
        input,
        tools,
        tool_choice: "auto",
        parallel_tool_calls: false,
        store: false,
        max_output_tokens: LIMITS.maxOutputTokens,
        safety_identifier: safetyIdentifier,
      };

      for (let attempt = 0; attempt < 2; attempt += 1) {
        const remainingMs = deadlineMs - now();
        if (remainingMs <= 0) throw new ProviderError("provider_timeout");
        const controller = new AbortController();
        const timeoutId = setTimeout(
          () => controller.abort(),
          boundedTimeout(now, deadlineMs),
        );

        try {
          const response = await fetchImpl("https://api.openai.com/v1/responses", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${apiKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify(body),
            signal: controller.signal,
          });

          if (!response.ok) {
            const retryable = response.status === 429 || response.status >= 500;
            if (retryable && attempt === 0 && deadlineMs - now() > 500) {
              await sleepImpl(125 + Math.floor(random() * 125));
              continue;
            }
            const baseCategory = response.status === 429
              ? "provider_rate_limited"
              : response.status >= 500
                ? "provider_unavailable"
                : "provider_rejected";
            const category = response.status >= 400 && response.status < 500
              ? await rejectionCategory(response, baseCategory)
              : baseCategory;
            throw new ProviderError(category, response.status);
          }

          const payload = await response.json().catch(() => null);
          if (!payload || !Array.isArray(payload.output) || !hasTrustworthyUsage(payload)) {
            // A successful HTTP response can represent completed, billable
            // work. Without trustworthy usage, finalization must consume the
            // conservative reservation instead of releasing it.
            throw new ProviderError(
              "provider_malformed_response",
              response.status,
              { costUncertain: true },
            );
          }
          return payload;
        } catch (error) {
          if (error instanceof ProviderError) throw error;
          if (controller.signal.aborted) {
            throw new ProviderError(
              "provider_timeout",
              0,
              { costUncertain: true },
            );
          }
          // A failed POST may already have reached the provider. Retrying an
          // ambiguous network failure can duplicate paid work and usage.
          throw new ProviderError(
            "provider_network_error",
            0,
            { costUncertain: true },
          );
        } finally {
          clearTimeout(timeoutId);
        }
      }

      throw new ProviderError("provider_unavailable");
    },
  };
}

export function providerUsage(payload) {
  const usage = payload?.usage ?? {};
  return {
    inputTokens: Number.isInteger(usage.input_tokens) ? usage.input_tokens : 0,
    cachedInputTokens: Number.isInteger(usage.input_tokens_details?.cached_tokens)
      ? usage.input_tokens_details.cached_tokens
      : 0,
    outputTokens: Number.isInteger(usage.output_tokens) ? usage.output_tokens : 0,
    reasoningTokens: Number.isInteger(usage.output_tokens_details?.reasoning_tokens)
      ? usage.output_tokens_details.reasoning_tokens
      : 0,
  };
}

export function responseToolCalls(payload) {
  return payload.output.filter((item) => item?.type === "function_call");
}

export function responseText(payload) {
  if (typeof payload.output_text === "string" && payload.output_text.trim()) {
    return payload.output_text.trim();
  }
  const parts = [];
  for (const item of payload.output) {
    if (item?.type !== "message" || !Array.isArray(item.content)) continue;
    for (const content of item.content) {
      if (content?.type === "output_text" && typeof content.text === "string") {
        parts.push(content.text);
      }
    }
  }
  return parts.join("\n").trim();
}
