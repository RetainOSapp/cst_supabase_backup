import { readFileSync } from "node:fs";

const read = (path) =>
  readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const shared = read("supabase/functions/_shared/clientInteractions.ts");
const quickUpdate = read("supabase/functions/manage-client-quick-update/index.ts");
const ingest = read("supabase/functions/ingest-client-call-summary/index.ts");
const review = read("supabase/functions/manage-integration-review/index.ts");
const checkpoint = read(
  "supabase/functions/manage-client-timed-checkpoint/index.ts",
);
const config = read("supabase/functions/manage-company-pipeline/index.ts");
const workspace = read("supabase/functions/manage-pipeline-workspace/index.ts");
const setup = read("src/components/pipeline/PipelineSetup.tsx");
const clientDetail = read("src/pages/ClientDetail.tsx");
const clients = read("src/pages/Clients.tsx");
const dailyPulse = read("src/pages/DailyPulse.tsx");
const pipeline = read("src/pages/Pipeline.tsx");
const backfill = read("scripts/backfill-strategic-review-interactions.mjs");

let passed = 0;
let failed = 0;
function check(label, condition) {
  if (condition) {
    passed += 1;
    console.log(`PASS ${label}`);
  } else {
    failed += 1;
    console.error(`FAIL ${label}`);
  }
}

check(
  "company-configurable call types include general, onboarding, Strategic Review, and renewal",
  ["general", "onboarding", "strategic_review", "renewal"].every((key) =>
    shared.includes(`key: "${key}"`),
  ) &&
    /client_interaction_types/.test(config) &&
    /update_interaction_settings/.test(config),
);
check(
  "Quick Update requires an enabled configured interaction type and persists it",
  /validateInteractionTypeKey/.test(quickUpdate) &&
    /interaction_type_key: interactionTypeKey/.test(quickUpdate) &&
    /interactionTypeKey/.test(clientDetail) &&
    /interactionTypeKey/.test(clients),
);
check(
  "Fathom ingestion and reconciliation classify titles using company settings",
  [ingest, review].every(
    (source) =>
      /classifyInteractionTitle/.test(source) &&
      /normalizeInteractionSettings/.test(source),
  ),
);
check(
  "Fathom Strategic Reviews enrich a nearby Daily Pulse interaction instead of duplicating it",
  [ingest, review].every(
    (source) =>
      /18 \* 60 \* 60 \* 1000/.test(source) &&
      /source", "daily_pulse"/.test(source) &&
      /enriched_from/.test(source),
  ),
);
check(
  "Daily Pulse completion records confirmation time and notes",
  /checkpointOccurredAt/.test(dailyPulse) &&
    /checkpointNotes/.test(dailyPulse) &&
    /occurredAt: new Date\(checkpointOccurredAt\)\.toISOString\(\)/.test(
      dailyPulse,
    ),
);
check(
  "Strategic Review completion creates a typed attended interaction and a history event",
  /attendance_status: "attended"/.test(checkpoint) &&
    /interaction_type_key: "strategic_review"/.test(checkpoint) &&
    /client_history_events/.test(checkpoint),
);
check(
  "Pipeline automation is company-configured, open-stage only, and never moves backward",
    /strategic_review_pipeline_automation/.test(config) &&
    /targetStage\.stage_type !== "open"/.test(config) &&
    /candidate\.current_stage\?\.position/.test(checkpoint) &&
    /mutate_pipeline_item_with_evidence/.test(checkpoint),
);
check(
  "Strategic Review still saves when no Pipeline item can move",
  /No open Pipeline item was available to move/.test(checkpoint) &&
    /pipelineWarning/.test(dailyPulse),
);
check(
  "CSM Pipeline access remains company-controlled and assignment-scoped",
  /CSM assignment scoping still applies/.test(setup) &&
    /actor\.role === "csm"/.test(workspace) &&
    /allowedClientIds/.test(workspace),
);
check(
  "client Outcomes summarize interaction counts and recent call evidence",
  /Calls & Reviews/.test(clientDetail) &&
    /interactionTypeKeyFromMetadata/.test(clientDetail) &&
    /Recent interactions/.test(clientDetail) &&
    /View in history/.test(clientDetail),
);
check(
  "client Outcomes records attended or missed calls through the existing Quick Update boundary",
  /Record call attendance/.test(clientDetail) &&
    /Uses the same attendance tracking and history as Quick Update/.test(
      clientDetail,
    ) &&
    /manage-client-quick-update/.test(clientDetail) &&
    /callAttendance: attendance/.test(clientDetail) &&
    /interactionTypeKey/.test(clientDetail) &&
    /onRecorded/.test(clientDetail),
);
check(
  "Pipeline cards expose call and Strategic Review completion context",
  /interaction_summary/.test(workspace) &&
    /lastStrategicReviewAt/.test(pipeline) &&
    /attended/.test(pipeline),
);
check(
  "historical repair is preview-first and never moves Pipeline items",
  /const apply = process\.argv\.includes\("--apply"\)/.test(backfill) &&
    /mode: apply \? "apply" : "preview"/.test(backfill) &&
    !/mutate_pipeline_item_with_evidence/.test(backfill),
);

console.log(
  `\n${passed}/${passed + failed} client-interaction orchestration checks passed.`,
);
if (failed > 0) process.exit(1);
