import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [
  ingest,
  manage,
  worker,
  provider,
  matcher,
  contract,
  config,
  dispatch,
  structured,
  validation,
  participantContext,
] = await Promise.all([
  readFile("supabase/functions/ingest-call-intelligence/index.ts", "utf8"),
  readFile("supabase/functions/manage-call-intelligence/index.ts", "utf8"),
  readFile("supabase/functions/process-call-intelligence/index.ts", "utf8"),
  readFile(
    "supabase/functions/process-call-intelligence/_shared/provider.mjs",
    "utf8",
  ),
  readFile(
    "supabase/functions/ingest-call-intelligence/_shared/matcher.mjs",
    "utf8",
  ),
  readFile(
    "supabase/functions/ingest-call-intelligence/_shared/contracts.mjs",
    "utf8",
  ),
  readFile("supabase/config.toml", "utf8"),
  readFile(
    "supabase/functions/_shared/call-intelligence-dispatch.mjs",
    "utf8",
  ),
  readFile(
    "supabase/functions/process-call-intelligence/_shared/structured-v2.mjs",
    "utf8",
  ),
  readFile(
    "supabase/functions/process-call-intelligence/_shared/validation.mjs",
    "utf8",
  ),
  readFile(
    "supabase/functions/process-call-intelligence/_shared/participant-context.mjs",
    "utf8",
  ),
]);

const checks = [
  ["dedicated token type", ingest, /INTEGRATION_TYPE = "call_ai_transcript"/],
  ["no fallback secret", ingest, /validateCompanyToken/],
  ["stable provider id", ingest, /externalCallId/],
  ["transcript stored separately", ingest, /\.from\("call_intelligence_transcripts"\)/],
  ["single-client matcher", matcher, /distinctClients\.length === 1/],
  ["multi-client reconciliation", matcher, /distinctClients\.length > 1[\s\S]+needs_reconciliation/],
  ["failed delivery recovery", ingest, /recovered_from_failed_delivery/],
  ["duplicate hash drift conflict", ingest, /different transcript content/],
  ["no automatic client profile write", ingest, /never writes client Notes|Call Intelligence source ingested/],
  ["actor authentication", manage, /requireAuthenticatedActor/],
  ["Director-only reconciliation", manage, /function assertDirector/],
  ["Support read-only", manage, /Support access is read-only/],
  ["CSM assignment restriction", manage, /clientAuthorizedForCsm/],
  ["service-only worker", worker, /isServiceRoleRequest/],
  ["global/company/budget claim", worker, /claim_call_intelligence_run/],
  ["dispatch marked before provider", worker, /mark_call_intelligence_run_dispatched/],
  ["separate Call Intelligence key", worker, /CALL_INTELLIGENCE_OPENAI_API_KEY/],
  ["strict structured result", provider, /type: "json_schema"[\s\S]+strict: true/],
  ["single exact evidence instruction", structured, /one uninterrupted span[\s\S]+at most one evidence item per claim/],
  ["runtime evidence grounding", worker, /validateStructuredV2\(result,\s*\{[\s\S]+transcript: claim\.transcript_text/],
  ["grounding failure category", validation, /evidence_grounding/],
  ["attribution failure category", validation, /evidence_attribution/],
  ["provider does not store", provider, /store: false/],
  ["transcript is untrusted", participantContext, /UNTRUSTED CALL TRANSCRIPT/],
  ["trusted participant role map", provider, /buildProviderInputText/],
  ["runtime matched participant roles", worker, /participantContextFromRows/],
  ["participant context excludes emails", participantContext, /\{ name, role \}/],
  ["explicit transcript speaker map", participantContext, /SPEAKER_ROLE_MAP_JSON/],
  ["unknown speaker role is preserved", participantContext, /unknown must remain unknown/],
  ["participant context reservation overhead", worker, /conservativeProviderInputCharacters/],
  ["model-scoped price card", worker, /pricingForModel\(model\)/],
  ["standard service tier", provider, /service_tier: "default"/],
  ["implicit cache writes disabled", provider, /prompt_cache_options: \{ mode: "explicit" \}/],
  ["automatic ingest dispatch", ingest, /dispatchCallIntelligenceRun\(queuedRunId\)/],
  ["managed-run dispatch", manage, /dispatchCallIntelligenceRun\(run\.id\)/],
  ["service-authenticated dispatcher", dispatch, /Authorization: `Bearer \$\{serviceRoleKey\}`/],
  ["JWT-off ingest", config, /\[functions\.ingest-call-intelligence\]\s+verify_jwt = false/],
  ["JWT-on management", config, /\[functions\.manage-call-intelligence\]\s+verify_jwt = true/],
  ["JWT-on worker", config, /\[functions\.process-call-intelligence\]\s+verify_jwt = true/],
  ["bounded transcript", contract, /MAX_TRANSCRIPT_CHARACTERS = 500_000/],
];

let passed = 0;
for (const [label, source, pattern] of checks) {
  assert.match(source, pattern, label);
  passed += 1;
}

for (const [label, source] of [
  ["ingest", ingest],
  ["manage", manage],
  ["worker", worker],
]) {
  assert.doesNotMatch(
    source,
    /console\.(log|error)\([^)]*(body|transcript|prompt|result|response)/i,
    `${label} must not log sensitive bodies`,
  );
  passed += 1;
}

assert.doesNotMatch(
  `${ingest}\n${manage}\n${worker}\n${provider}`,
  /sk-[A-Za-z0-9_-]{20,}/,
  "source must not contain provider credentials",
);
passed += 1;
assert.doesNotMatch(
  worker.match(/\.from\("call_intelligence_participants"\)[\s\S]+?\.order\("id"\)/)?.[0] ?? "",
  /email|metadata|provider_role/,
  "worker participant context query must not select email, metadata, or IDs beyond role matching",
);
passed += 1;
assert.doesNotMatch(
  ingest,
  /\.from\("clients"\)\s*\.update/,
  "ingestion must never update a client profile",
);
passed += 1;

console.log(`Call Intelligence Edge/source verification: ${passed}/${checks.length + 6} passed`);
