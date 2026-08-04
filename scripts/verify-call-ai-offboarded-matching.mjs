import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [frontend, integrationReview, callSummary, callIntelligence] =
  await Promise.all([
    readFile("src/pages/CallAi.tsx", "utf8"),
    readFile("supabase/functions/manage-integration-review/index.ts", "utf8"),
    readFile("supabase/functions/ingest-client-call-summary/index.ts", "utf8"),
    readFile("supabase/functions/manage-call-intelligence/index.ts", "utf8"),
  ]);

assert.doesNotMatch(frontend, /isMatchableClient/);
assert.match(frontend, /client_email_secondary\.ilike/);
assert.match(frontend, /client_email_tertiary\.ilike/);

for (const source of [integrationReview, callSummary]) {
  assert.match(source, /OFFBOARDED_PROGRAM_STATUSES/);
  assert.match(source, /active\w*\.length > 0\s*\?\s*active\w*\s*:\s*offboarded\w*/);
  assert.match(source, /client_email_offboarded/);
}

assert.match(callIntelligence, /RECONCILABLE_CLIENT_STATUSES/);
assert.match(callIntelligence, /"off-boarded"/);
assert.match(callIntelligence, /"offboarded"/);
assert.match(callIntelligence, /Choose an available client/);

console.log("Call AI offboarded matching verification passed.");
