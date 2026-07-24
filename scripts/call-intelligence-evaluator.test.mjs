import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import test from "node:test";

function dryRun(extraArgs = []) {
  const output = execFileSync(
    process.execPath,
    [
      "scripts/evaluate-call-intelligence.mjs",
      "--corpus",
      "scripts/fixtures/call-intelligence-eval-synthetic.json",
      ...extraArgs,
    ],
    { encoding: "utf8" },
  );
  const jsonStart = output.indexOf("{");
  const jsonEnd = output.indexOf("\nDry run only.");
  assert.notEqual(jsonStart, -1);
  assert.notEqual(jsonEnd, -1);
  return JSON.parse(output.slice(jsonStart, jsonEnd));
}

test("plans a full baseline and a bounded structured-only retest", () => {
  const baseline = dryRun();
  assert.deepEqual(baseline.runKinds, ["legacy_v1", "structured_v2"]);
  assert.equal(baseline.plannedProviderCalls, 27);

  const retest = dryRun(["--structured-only"]);
  assert.deepEqual(retest.runKinds, ["structured_v2"]);
  assert.equal(retest.plannedProviderCalls, 3);
  assert.equal(retest.structuredPromptVersion, "structured_v2_evidence_v2");
  assert.ok(
    retest.conservativeMaximumCostMicros <
      baseline.conservativeMaximumCostMicros,
  );
});
