import { buildProviderInputText } from "./participant-context.mjs";

export class ProviderError extends Error {
  constructor(category, status = 0, { costUncertain = false } = {}) {
    super(category);
    this.name = "ProviderError";
    this.category = category;
    this.status = status;
    this.costUncertain = costUncertain === true;
  }
}

// Pinned to OpenAI standard-tier pricing published on 2026-07-23. A code
// version makes every stored usage event reproducible and prevents a model
// override from accidentally using another model's rates. Update this registry
// and its version together after reviewing the official pricing page.
export const STANDARD_PRICE_CARD_VERSION = "openai-standard-2026-07-23";
const STANDARD_PRICE_CARDS = Object.freeze({
  "gpt-5.6-luna": Object.freeze({
    inputMicrosPerMillion: 1_000_000,
    cachedInputMicrosPerMillion: 100_000,
    outputMicrosPerMillion: 6_000_000,
  }),
  "gpt-5.6-terra": Object.freeze({
    inputMicrosPerMillion: 2_500_000,
    cachedInputMicrosPerMillion: 250_000,
    outputMicrosPerMillion: 15_000_000,
  }),
  "gpt-5.6-sol": Object.freeze({
    inputMicrosPerMillion: 5_000_000,
    cachedInputMicrosPerMillion: 500_000,
    outputMicrosPerMillion: 30_000_000,
  }),
});

export function pricingForModel(model) {
  const rates = STANDARD_PRICE_CARDS[model];
  if (!rates) throw new Error("Unsupported Call Intelligence price card model.");
  return {
    version: STANDARD_PRICE_CARD_VERSION,
    ...rates,
  };
}

function ceilDiv(left, right) {
  return (left + right - 1n) / right;
}

export function usageCostMicros(usage, pricing) {
  const input = BigInt(Math.max(0, usage.inputTokens - usage.cachedInputTokens));
  const cached = BigInt(Math.max(0, usage.cachedInputTokens));
  const output = BigInt(Math.max(0, usage.outputTokens));
  const scale = 1_000_000n;
  const total =
    ceilDiv(input * BigInt(pricing.inputMicrosPerMillion), scale) +
    ceilDiv(cached * BigInt(pricing.cachedInputMicrosPerMillion), scale) +
    ceilDiv(output * BigInt(pricing.outputMicrosPerMillion), scale);
  return Number(total);
}

export function conservativeReservationMicros({
  inputCharacters,
  maxOutputTokens,
  pricing,
}) {
  // Three characters per token intentionally over-reserves typical English
  // transcript input. No cached-input discount is assumed.
  const estimatedInputTokens = Math.ceil(Math.max(1, inputCharacters) / 3);
  return usageCostMicros(
    {
      inputTokens: estimatedInputTokens,
      cachedInputTokens: 0,
      outputTokens: maxOutputTokens,
    },
    pricing,
  );
}

function safeDiagnostic(value) {
  const text = typeof value === "string" ? value.trim().toLowerCase() : "";
  return /^[a-z0-9_.-]{1,64}$/.test(text) ? text : null;
}

async function rejectionCategory(response) {
  const payload = await response.json().catch(() => null);
  const code = safeDiagnostic(payload?.error?.code);
  const param = safeDiagnostic(payload?.error?.param);
  return ["provider_rejected", code, param].filter(Boolean).join(".");
}

function hasValidUsage(payload) {
  const usage = payload?.usage;
  return (
    payload?.service_tier === "default" &&
    Number.isInteger(usage?.input_tokens) &&
    usage.input_tokens >= 0 &&
    Number.isInteger(usage?.output_tokens) &&
    usage.output_tokens >= 0 &&
    (
      usage.input_tokens_details?.cached_tokens == null ||
      (
        Number.isInteger(usage.input_tokens_details.cached_tokens) &&
        usage.input_tokens_details.cached_tokens >= 0 &&
        usage.input_tokens_details.cached_tokens <= usage.input_tokens
      )
    ) &&
    (
      usage.input_tokens_details?.cache_write_tokens == null ||
      usage.input_tokens_details.cache_write_tokens === 0
    ) &&
    (
      usage.output_tokens_details?.reasoning_tokens == null ||
      (
        Number.isInteger(usage.output_tokens_details.reasoning_tokens) &&
        usage.output_tokens_details.reasoning_tokens >= 0 &&
        usage.output_tokens_details.reasoning_tokens <= usage.output_tokens
      )
    )
  );
}

function outputText(payload) {
  if (typeof payload?.output_text === "string" && payload.output_text.trim()) {
    return payload.output_text.trim();
  }
  const parts = [];
  for (const item of payload?.output ?? []) {
    if (item?.type !== "message" || !Array.isArray(item.content)) continue;
    for (const content of item.content) {
      if (content?.type === "output_text" && typeof content.text === "string") {
        parts.push(content.text);
      }
    }
  }
  return parts.join("\n").trim();
}

export function providerUsage(payload) {
  return {
    inputTokens: payload.usage.input_tokens,
    cachedInputTokens: payload.usage.input_tokens_details?.cached_tokens ?? 0,
    outputTokens: payload.usage.output_tokens,
    reasoningTokens: payload.usage.output_tokens_details?.reasoning_tokens ?? 0,
  };
}

export function createStructuredResponsesProvider({
  apiKey,
  fetchImpl = fetch,
  timeoutMs = 180_000,
}) {
  return {
    async analyze({
      model,
      reasoningEffort,
      instructions,
      transcript,
      participantContext = [],
      outputSchema,
      maxOutputTokens,
      safetyIdentifier,
    }) {
      if (!apiKey) throw new ProviderError("provider_not_configured");
      const body = {
        model,
        reasoning: { effort: reasoningEffort },
        instructions,
        input: [
          {
            role: "user",
            content: [
              {
                type: "input_text",
                text: buildProviderInputText(transcript, participantContext),
              },
            ],
          },
        ],
        store: false,
        // The pinned price card is standard-tier pricing. Explicitly select
        // that tier and disable implicit cache writes so billing cannot drift
        // to priority rates or the separate 1.25x cache-write rate.
        service_tier: "default",
        prompt_cache_options: { mode: "explicit" },
        max_output_tokens: maxOutputTokens,
        safety_identifier: safetyIdentifier,
      };
      if (outputSchema?.type === "object") {
        body.text = {
          format: {
            type: "json_schema",
            name: "call_intelligence_v2",
            strict: true,
            schema: outputSchema,
          },
        };
      }

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      const startedAt = Date.now();
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
          const category = response.status === 429
            ? "provider_rate_limited"
            : response.status >= 500
              ? "provider_unavailable"
              : await rejectionCategory(response);
          throw new ProviderError(category, response.status);
        }
        const payload = await response.json().catch(() => null);
        if (!payload || !hasValidUsage(payload)) {
          throw new ProviderError(
            "provider_malformed_response",
            response.status,
            { costUncertain: true },
          );
        }
        const text = outputText(payload);
        if (!text) {
          throw new ProviderError(
            "provider_empty_response",
            response.status,
            { costUncertain: true },
          );
        }
        return {
          providerRequestId:
            typeof payload.id === "string" ? payload.id.slice(0, 256) : null,
          text,
          usage: providerUsage(payload),
          latencyMs: Date.now() - startedAt,
        };
      } catch (error) {
        if (error instanceof ProviderError) throw error;
        if (controller.signal.aborted) {
          throw new ProviderError("provider_timeout", 0, {
            costUncertain: true,
          });
        }
        throw new ProviderError("provider_network_error", 0, {
          costUncertain: true,
        });
      } finally {
        clearTimeout(timeout);
      }
    },
  };
}
