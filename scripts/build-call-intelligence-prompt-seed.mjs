import { readFile, writeFile } from "node:fs/promises";
import {
  STRUCTURED_V2_INSTRUCTIONS,
  STRUCTURED_V2_SCHEMA,
} from "../supabase/functions/process-call-intelligence/_shared/structured-v2.mjs";

const legacy = JSON.parse(
  await readFile(
    "supabase/functions/process-call-intelligence/_shared/legacy-prompts.json",
    "utf8",
  ),
);

const outputPath =
  "supabase/migrations/20260723201000_call_intelligence_prompt_seed.sql";

function sqlText(value) {
  return `'${String(value)
    .replace(/[ \t]+$/gm, "")
    .replaceAll("'", "''")}'`;
}

function sqlJson(value) {
  return `${sqlText(JSON.stringify(value))}::jsonb`;
}

const lines = [
  "-- Immutable Call Intelligence prompt snapshots.",
  "-- Generated from the user-supplied Glide prompt source and structured V2.",
  "-- Contains no transcript, client identity, credential, or provider output.",
  "",
];

for (const prompt of legacy.fixed) {
  lines.push(
    "insert into public.call_intelligence_prompt_definitions (",
    "  scope, company_id, prompt_key, name, run_mode, prompt_text,",
    "  output_schema, version, status",
    ") values (",
    `  'fixed', null, ${sqlText(prompt.prompt_key)}, ${sqlText(prompt.name)},`,
    `  'auto', ${sqlText(prompt.prompt_text)},`,
    `  '{"type":"text"}'::jsonb, 'legacy_v1', 'archived'`,
    ") on conflict do nothing;",
    "",
  );
}

lines.push(
  "insert into public.call_intelligence_prompt_definitions (",
  "  scope, company_id, prompt_key, name, run_mode, prompt_text,",
  "  output_schema, version, status",
  ") values (",
  `  'fixed', null, 'structured_v2_base', 'Structured V2 Base Analysis',`,
  `  'auto', ${sqlText(STRUCTURED_V2_INSTRUCTIONS)},`,
  `  ${sqlJson(STRUCTURED_V2_SCHEMA)}, 'structured_v2', 'active'`,
  ") on conflict do nothing;",
  "",
);

for (const prompt of legacy.on_demand) {
  lines.push(
    "insert into public.call_intelligence_prompt_definitions (",
    "  scope, company_id, prompt_key, name, run_mode, prompt_text,",
    "  output_schema, version, status",
    ")",
    "select",
    `  'company', company.id, ${sqlText(prompt.prompt_key)}, ${sqlText(prompt.name)},`,
    `  'manual', ${sqlText(prompt.prompt_text)},`,
    `  '{"type":"text"}'::jsonb, 'legacy_v1', 'active'`,
    "from public.companies company",
    `where company.legacy_glide_row_id = ${sqlText(prompt.company_legacy_id)}`,
    "on conflict do nothing;",
    "",
  );
}

while (lines.at(-1) === "") lines.pop();
await writeFile(outputPath, `${lines.join("\n")}\n`, "utf8");
console.log(
  `Wrote ${legacy.fixed.length} legacy fixed, 1 structured, and ${legacy.on_demand.length} on-demand prompt seeds.`,
);
