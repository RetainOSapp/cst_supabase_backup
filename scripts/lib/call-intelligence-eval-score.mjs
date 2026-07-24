import {
  collectStructuredEvidence,
  evidenceIsGrounded,
} from "../../supabase/functions/process-call-intelligence/_shared/validation.mjs";
import {
  evidenceRoleIsGrounded,
} from "../../supabase/functions/process-call-intelligence/_shared/participant-context.mjs";

export function collectEvidence(value) {
  return collectStructuredEvidence(value).map(({ item }) => item);
}

function expectationChecks(output, expectations = {}) {
  const checks = [];
  const check = (label, passed, actual = null) => {
    checks.push({ label, passed, actual });
  };

  if (expectations.call_type) {
    check("call_type", output?.call_type === expectations.call_type, output?.call_type);
  }
  if (Array.isArray(expectations.call_type_one_of)) {
    check(
      "call_type_one_of",
      expectations.call_type_one_of.includes(output?.call_type),
      output?.call_type,
    );
  }
  for (const [field, expected] of [
    ["client_sentiment", expectations.client_sentiment],
    ["team_member_sentiment", expectations.team_member_sentiment],
  ]) {
    if (expected) {
      check(field, output?.[field]?.label === expected, output?.[field]?.label);
    }
  }
  for (const [field, minimum] of [
    ["positive_signals", expectations.min_positive_signals],
    ["negative_signals", expectations.min_negative_signals],
    ["client_pain_points", expectations.min_client_pain_points],
    ["next_steps", expectations.min_next_steps],
  ]) {
    if (Number.isInteger(minimum)) {
      const actual = Array.isArray(output?.[field]) ? output[field].length : 0;
      check(`min_${field}`, actual >= minimum, actual);
    }
  }
  if (Array.isArray(expectations.must_not_include_strings)) {
    const serialized = JSON.stringify(output ?? {}).toLowerCase();
    for (const text of expectations.must_not_include_strings) {
      check(
        `must_not_include:${text}`,
        !serialized.includes(String(text).toLowerCase()),
      );
    }
  }
  return checks;
}

export function scoreStructuredResult({
  output,
  validation,
  transcript,
  participantContext = null,
  expectations,
}) {
  const evidenceChecks = collectStructuredEvidence(output).map(
    ({ item, path }) => {
      const quoteSupported = evidenceIsGrounded(item, transcript);
      const roleSupported = participantContext === null
        ? true
        : evidenceRoleIsGrounded(item, transcript, participantContext);
      return {
        path,
        timestamp: item.timestamp,
        speakerRole: item.speaker_role,
        quoteCharacters: item.quote.length,
        quoteSupported,
        roleSupported,
        supported: quoteSupported && roleSupported,
      };
    },
  );
  const supportedEvidence = evidenceChecks.filter((item) => item.supported).length;
  const expectationResults = expectationChecks(output, expectations);
  const expectationsPassed = expectationResults.every((item) => item.passed);
  const evidenceGrounded =
    evidenceChecks.length === 0 ||
    supportedEvidence === evidenceChecks.length;
  const schemaValid = validation?.ok === true;

  return {
    schemaValid,
    validationErrors: validation?.errors ?? [],
    evidence: {
      total: evidenceChecks.length,
      supported: supportedEvidence,
      unsupported: evidenceChecks.length - supportedEvidence,
      quoteSupported: evidenceChecks.filter((item) => item.quoteSupported)
        .length,
      roleSupported: evidenceChecks.filter((item) => item.roleSupported)
        .length,
      groundedRate:
        evidenceChecks.length === 0
          ? 1
          : supportedEvidence / evidenceChecks.length,
      checks: evidenceChecks,
    },
    expectations: expectationResults,
    expectationsPassed,
    hardPass: schemaValid && evidenceGrounded && expectationsPassed,
  };
}

function usageTotals(items) {
  return items.reduce(
    (total, item) => {
      total.requests += 1;
      total.inputTokens += item.usage?.inputTokens ?? 0;
      total.cachedInputTokens += item.usage?.cachedInputTokens ?? 0;
      total.outputTokens += item.usage?.outputTokens ?? 0;
      total.reasoningTokens += item.usage?.reasoningTokens ?? 0;
      total.costMicros += item.costMicros ?? 0;
      total.latencyMs += item.latencyMs ?? 0;
      return total;
    },
    {
      requests: 0,
      inputTokens: 0,
      cachedInputTokens: 0,
      outputTokens: 0,
      reasoningTokens: 0,
      costMicros: 0,
      latencyMs: 0,
    },
  );
}
export function summarizeEvaluation(results) {
  const profiles = {};
  for (const result of results) {
    const profile = profiles[result.profile] ?? {
      calls: 0,
      legacy: [],
      structured: [],
      hardPasses: 0,
      schemaPasses: 0,
      groundedEvidence: 0,
      totalEvidence: 0,
    };
    profile.calls += 1;
    profile.legacy.push(...result.legacy);
    if (result.structuredV2) {
      profile.structured.push(result.structuredV2);
      if (result.structuredV2.score?.hardPass) profile.hardPasses += 1;
      if (result.structuredV2.score?.schemaValid) profile.schemaPasses += 1;
      profile.groundedEvidence +=
        result.structuredV2.score?.evidence?.supported ?? 0;
      profile.totalEvidence += result.structuredV2.score?.evidence?.total ?? 0;
    }
    profiles[result.profile] = profile;
  }

  return Object.fromEntries(
    Object.entries(profiles).map(([name, profile]) => [
      name,
      {
        calls: profile.calls,
        legacy: usageTotals(profile.legacy),
        structuredV2: {
          ...usageTotals(profile.structured),
          schemaPassRate:
            profile.calls === 0 ? 0 : profile.schemaPasses / profile.calls,
          hardPassRate:
            profile.calls === 0 ? 0 : profile.hardPasses / profile.calls,
          evidenceGroundedRate:
            profile.totalEvidence === 0
              ? 1
              : profile.groundedEvidence / profile.totalEvidence,
        },
      },
    ]),
  );
}
