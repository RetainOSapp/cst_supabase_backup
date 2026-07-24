import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import {
  collectEvidence,
  scoreStructuredResult,
  summarizeEvaluation,
} from "./lib/call-intelligence-eval-score.mjs";
import { validateStructuredV2 } from "../supabase/functions/process-call-intelligence/_shared/validation.mjs";

const result = JSON.parse(
  await readFile(
    "scripts/fixtures/call-intelligence-eval-score-result.json",
    "utf8",
  ),
);
const transcript =
  "00:00:08 - Client: The implementation is working well and our team is confident.\n" +
  "00:00:20 - Team Member: I will send the renewal proposal by Friday.";
const participantContext = [
  { name: "Client", role: "client" },
  { name: "Team Member", role: "team_member" },
];

test("collects unique evidence and verifies transcript grounding", () => {
  assert.equal(collectEvidence(result).length, 2);
  const score = scoreStructuredResult({
    output: result,
    validation: validateStructuredV2(result, {
      transcript,
      participantContext,
    }),
    transcript,
    participantContext,
    expectations: {
      call_type: "renewal",
      client_sentiment: "positive",
      min_positive_signals: 1,
      min_next_steps: 1,
    },
  });
  assert.equal(score.schemaValid, true);
  assert.equal(score.evidence.total, 2);
  assert.equal(score.evidence.supported, 2);
  assert.equal(score.evidence.quoteSupported, 2);
  assert.equal(score.evidence.roleSupported, 2);
  assert.ok(score.evidence.checks.every((item) => item.path));
  assert.equal(score.expectationsPassed, true);
  assert.equal(score.hardPass, true);
});

test("fails the hard gate for an unsupported quote or missed expectation", () => {
  const unsupported = structuredClone(result);
  unsupported.client_sentiment.evidence[0].quote = "This quote was invented.";
  const score = scoreStructuredResult({
    output: unsupported,
    validation: validateStructuredV2(unsupported),
    transcript,
    participantContext,
    expectations: {
      client_sentiment: "negative",
    },
  });
  assert.equal(score.schemaValid, true);
  assert.equal(score.evidence.unsupported, 1);
  assert.equal(score.expectationsPassed, false);
  assert.equal(score.hardPass, false);
});

test("summarizes legacy and structured cost, latency, and promotion rates", () => {
  const score = scoreStructuredResult({
    output: result,
    validation: validateStructuredV2(result),
    transcript,
    participantContext,
    expectations: { call_type: "renewal" },
  });
  const summary = summarizeEvaluation([
    {
      profile: "terra-medium",
      legacy: [
        {
          usage: { inputTokens: 100, outputTokens: 20 },
          costMicros: 40,
          latencyMs: 1000,
        },
      ],
      structuredV2: {
        usage: { inputTokens: 110, outputTokens: 30 },
        costMicros: 50,
        latencyMs: 1200,
        score,
      },
    },
  ]);
  assert.equal(summary["terra-medium"].legacy.requests, 1);
  assert.equal(summary["terra-medium"].legacy.costMicros, 40);
  assert.equal(summary["terra-medium"].structuredV2.costMicros, 50);
  assert.equal(summary["terra-medium"].structuredV2.schemaPassRate, 1);
  assert.equal(summary["terra-medium"].structuredV2.hardPassRate, 1);
});
