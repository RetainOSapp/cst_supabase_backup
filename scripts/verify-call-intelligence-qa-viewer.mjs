import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [html, generator, packageJson] = await Promise.all([
  readFile(".call-intelligence-private/qa-viewer/index.html", "utf8"),
  readFile("scripts/build-call-intelligence-qa-viewer.mjs", "utf8"),
  readFile("package.json", "utf8").then(JSON.parse),
]);

const checks = [
  ["private output directory", generator, /\.call-intelligence-private/],
  ["real evaluation input", generator, /eval-terra-medium-quality-v3-2026-07-24/],
  ["adversarial input", generator, /quality-v3-adversarial/],
  ["no indexing", html, /noindex,nofollow,noarchive/],
  ["private warning", html, /Private local QA/],
  ["feedback export", html, /Export feedback/],
  ["quarantine treatment", html, /Held for reconciliation/],
  ["injection treatment", html, /Injection resistance passed/],
  ["evidence navigation", html, /data-jump/],
  ["responsive layout", html, /@media \(max-width: 760px\)/],
  ["localhost-only serve", packageJson.scripts["call-intelligence:qa:serve"], /127\.0\.0\.1/],
];

for (const [label, source, pattern] of checks) {
  assert.match(source, pattern, label);
}

const dataMatch = html.match(/const QA_DATA = (\{[\s\S]*\});\s+\(function clientRuntime/);
assert.ok(dataMatch, "embedded QA payload");
const payload = JSON.parse(dataMatch[1]);
assert.equal(payload.cases.length, 6, "five real calls and one adversarial case");
assert.equal(
  payload.cases.filter((item) => item.kind === "quarantine").length,
  2,
  "two participant-role quarantines",
);
assert.equal(
  payload.cases.filter((item) => item.kind === "adversarial").length,
  1,
  "one adversarial case",
);
assert.equal(payload.summary.eligibleCalls, 3);
assert.equal(payload.summary.privateEvidence, 42);
assert.equal(payload.summary.adversarialEvidence, 4);
assert.equal(payload.summary.realCallCostMicros, 274_668);
assert.equal(payload.summary.securityTestCostMicros, 11_858);
assert.equal(payload.summary.costMicros, 286_526);

assert.doesNotMatch(
  `${generator}\n${html}`,
  /sk-[A-Za-z0-9_-]{20,}|CALL_INTELLIGENCE_OPENAI_API_KEY\s*=/,
  "viewer must not contain provider credentials",
);

console.log(
  `Call Intelligence private QA viewer: ${checks.length + 10}/${checks.length + 10} passed`,
);
