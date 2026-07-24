import { readFile, writeFile } from "node:fs/promises";
import {
  STRUCTURED_V2_INSTRUCTIONS,
  STRUCTURED_V2_PROMPT_VERSION,
  STRUCTURED_V2_SCHEMA,
} from "../supabase/functions/process-call-intelligence/_shared/structured-v2.mjs";

const migrationPath =
  "supabase/migrations/20260723201000_call_intelligence_prompt_seed.sql";
const checkOnly = process.argv.includes("--check");

function sqlLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

const expected = `insert into public.call_intelligence_prompt_definitions (
  scope, company_id, prompt_key, name, run_mode, prompt_text,
  output_schema, version, status
) values (
  'fixed', null, 'structured_v2_base', 'Structured V2 Base Analysis',
  'auto', ${sqlLiteral(STRUCTURED_V2_INSTRUCTIONS)},
  ${sqlLiteral(JSON.stringify(STRUCTURED_V2_SCHEMA))}::jsonb,
  '${STRUCTURED_V2_PROMPT_VERSION}', 'active'
) on conflict do nothing;`;

const source = await readFile(migrationPath, "utf8");
const promptMarker = "'fixed', null, 'structured_v2_base'";
const markerIndex = source.indexOf(promptMarker);
if (markerIndex < 0) throw new Error("Structured V2 seed marker was not found.");
const start = source.lastIndexOf(
  "insert into public.call_intelligence_prompt_definitions (",
  markerIndex,
);
const terminator = ") on conflict do nothing;";
const terminatorIndex = source.indexOf(terminator, markerIndex);
if (start < 0 || terminatorIndex < 0) {
  throw new Error("Structured V2 seed boundaries were not found.");
}
const end = terminatorIndex + terminator.length;
const current = source.slice(start, end);

if (checkOnly) {
  if (current !== expected) {
    throw new Error(
      "Structured V2 migration seed is stale. Run npm run call-intelligence:sync:structured-seed.",
    );
  }
  console.log("Call Intelligence structured seed is synchronized.");
} else {
  await writeFile(
    migrationPath,
    `${source.slice(0, start)}${expected}${source.slice(end)}`,
    "utf8",
  );
  console.log(
    `Updated ${migrationPath} to ${STRUCTURED_V2_PROMPT_VERSION}.`,
  );
}
