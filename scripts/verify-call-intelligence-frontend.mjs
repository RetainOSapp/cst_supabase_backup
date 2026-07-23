import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [app, page, intelligence, account, header, developmentPreview] =
  await Promise.all([
  readFile("src/App.tsx", "utf8"),
  readFile("src/pages/CallAi.tsx", "utf8"),
  readFile("src/components/call-ai/CallIntelligence.tsx", "utf8"),
  readFile("src/lib/accountContext.tsx", "utf8"),
  readFile("src/components/Header.tsx", "utf8"),
  readFile(
    "src/components/call-ai/CallIntelligenceDevelopmentPreview.tsx",
    "utf8",
  ),
]);

const checks = [
  ["guarded Call AI route", app, /RequireCapability allowed=\{capabilities\.canAccessCallAi\}/],
  ["no public preview route", app, /path="\/login"[\s\S]+path="\/\*"/],
  ["real component used", page, /<CallIntelligence/],
  ["reconciliation remains separate", page, /"reconciliation"/],
  ["new Call Intelligence reconciliation action", page, /manage-call-intelligence/],
  ["real management API", intelligence, /manage-call-intelligence/],
  ["URL-stable call detail", intelligence, /useSearchParams/],
  ["evidence rendered", intelligence, /function EvidenceList/],
  ["on-demand prompt actions", intelligence, /run_on_demand/],
  ["transcript bounded viewport", intelligence, /max-h-\[34rem\]/],
  ["CSM company toggle loaded", account, /enable_call_ai_for_csms/],
  ["CSM capability gated", account, /isCsm && callAiForCsms/],
  ["navigation uses capability", header, /show: capabilities\.canAccessCallAi/],
  ["development fixture is DEV-only", app, /import\.meta\.env\.DEV/],
  ["development fixture uses invalid domains", developmentPreview, /@example\.invalid/],
];

let passed = 0;
for (const [label, source, pattern] of checks) {
  assert.match(source, pattern, label);
  passed += 1;
}

assert.doesNotMatch(app, /call-intelligence-preview/, "public mock route removed");
passed += 1;
assert.doesNotMatch(intelligence, /DEMO_CALLS|Amelia Grant/, "dummy call data removed");
passed += 1;
assert.doesNotMatch(
  intelligence,
  /\.from\("call_intelligence_/,
  "browser writes/reads go through actor-scoped Edge API",
);
passed += 1;
assert.doesNotMatch(
  developmentPreview,
  /Aron Lucas|Jay Goncalves|Vanessa Valencia|@gmail\.com/i,
  "development fixtures must not contain supplied customer/person data",
);
passed += 1;

console.log(`Call Intelligence frontend verification: ${passed}/${checks.length + 4} passed`);
