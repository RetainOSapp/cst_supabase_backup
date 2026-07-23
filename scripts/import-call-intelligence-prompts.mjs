import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const sourceArgument =
  process.argv[2] ?? process.env.CALL_INTELLIGENCE_PROMPTS_MD;
if (!sourceArgument) {
  throw new Error(
    "Pass PROMPTS.md as the first argument or set CALL_INTELLIGENCE_PROMPTS_MD.",
  );
}
const sourcePath = resolve(sourceArgument);
const outputPath = resolve(
  process.argv[3] ??
    "supabase/functions/process-call-intelligence/_shared/legacy-prompts.json",
);

const markdown = await readFile(sourcePath, "utf8");

function section(startHeading, endHeading) {
  const start = markdown.indexOf(startHeading);
  const end = markdown.indexOf(endHeading, start + startHeading.length);
  if (start < 0 || end < 0) {
    throw new Error(`Could not find prompt section ${startHeading}`);
  }
  return markdown.slice(start, end);
}

function slug(value) {
  return value
    .normalize("NFKD")
    .replace(/[^\p{Letter}\p{Number}\s_-]/gu, "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
}

const fixedSection = section(
  "## 1. Fixed auto-run prompts (1-on-1 calls)",
  "## 2. Fixed auto-run prompts (Group calls)",
);
const fixed = [
  ...fixedSection.matchAll(
    /^### (.+?)\n[\s\S]*?\*\*Prompt \(verbatim\):\*\*\n\n```text\n([\s\S]*?)\n```/gm,
  ),
].map((match) => ({
  prompt_key: slug(match[1]),
  name: match[1].trim(),
  run_mode: "auto",
  version: "legacy_v1",
  prompt_text: match[2],
}));

if (fixed.length !== 8) {
  throw new Error(`Expected 8 fixed prompts, found ${fixed.length}`);
}

const onDemandSection = section(
  "## 3. On-demand prompts",
  "## 4. Real client-output examples",
);
const onDemand = [];
let companyLegacyId = null;
const lines = onDemandSection.split("\n");
for (let index = 0; index < lines.length; index += 1) {
  const companyMatch = lines[index].match(/^### Company `([^`]+)`/);
  if (companyMatch) {
    companyLegacyId = companyMatch[1];
    continue;
  }
  const promptMatch = lines[index].match(/^#### (.+)$/);
  if (!promptMatch) continue;
  const remaining = lines.slice(index + 1).join("\n");
  const block = remaining.match(/```text\n([\s\S]*?)\n```/);
  if (!block) throw new Error(`Missing prompt block for ${promptMatch[1]}`);
  onDemand.push({
    company_legacy_id: companyLegacyId,
    prompt_key: slug(promptMatch[1]),
    name: promptMatch[1].trim(),
    run_mode: "manual",
    version: "legacy_v1",
    prompt_text: block[1],
  });
}

if (onDemand.length !== 7) {
  throw new Error(`Expected 7 on-demand prompts, found ${onDemand.length}`);
}

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(
  outputPath,
  `${JSON.stringify(
    {
      source: "Glide prompt export supplied by Jay",
      source_revision: "2025-01-17T12:50:05",
      imported_at: "2026-07-23",
      fixed,
      on_demand: onDemand,
    },
    null,
    2,
  )}\n`,
  "utf8",
);

console.log(
  `Imported ${fixed.length} fixed and ${onDemand.length} on-demand prompts to ${outputPath}`,
);
