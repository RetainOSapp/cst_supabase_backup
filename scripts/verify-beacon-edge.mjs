import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const functionsRoot = path.join(root, "supabase/functions");

async function sourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(target);
    return /\.(?:mjs|ts)$/.test(entry.name) ? [target] : [];
  }));
  return nested.flat();
}

const scopedDirectories = [
  path.join(functionsRoot, "beacon-chat"),
  path.join(functionsRoot, "beacon-access"),
  path.join(functionsRoot, "manage-ai-feature-entitlement"),
];
const files = (await Promise.all(scopedDirectories.map(sourceFiles))).flat();
const sources = new Map(await Promise.all(files.map(async (file) => [
  file,
  await readFile(file, "utf8"),
])));

for (const [file, source] of sources) {
  assert.doesNotMatch(source, /VITE_(?:BEACON_)?(?:OPENAI|ANTHROPIC|AI).*KEY/i, file);
  assert.doesNotMatch(source, /anthropic/i, file);
  assert.doesNotMatch(source, /dangerouslyAllowBrowser|createBrowserClient/i, file);
  if (!file.endsWith("index.ts")) {
    assert.doesNotMatch(source, /Deno\.env\.get\(["']OPENAI_API_KEY["']\)/, file);
  }
}

const chatIndex = await readFile(
  path.join(functionsRoot, "beacon-chat/index.ts"),
  "utf8",
);
assert.match(chatIndex, /Deno\.env\.get\("OPENAI_API_KEY"\)/);
for (const folder of ["beacon-access", "manage-ai-feature-entitlement"]) {
  const source = await readFile(path.join(functionsRoot, folder, "index.ts"), "utf8");
  assert.doesNotMatch(source, /OPENAI_API_KEY|api\.openai\.com/i, folder);
}

const config = await readFile(path.join(root, "supabase/config.toml"), "utf8");
for (const name of ["beacon-access", "beacon-chat", "manage-ai-feature-entitlement"]) {
  assert.match(
    config,
    new RegExp(`\\[functions\\.${name}\\]\\s+verify_jwt\\s*=\\s*true`),
    `${name} must verify JWTs at the gateway`,
  );
}

const contracts = await readFile(
  path.join(functionsRoot, "beacon-chat/_shared/contracts.mjs"),
  "utf8",
);
assert.match(contracts, /gpt-5\.4-mini-2026-03-17/);
assert.match(contracts, /additionalProperties: false/);

const tools = await readFile(
  path.join(functionsRoot, "beacon-chat/_shared/tools.mjs"),
  "utf8",
);
assert.doesNotMatch(tools, /\.from\s*\(/);
assert.doesNotMatch(tools, /rawQuery|executeSql|tableName/i);
assert.match(tools, /serviceClient\.rpc\(/);
assert.doesNotMatch(tools, /userClient|createUserClient/);
assert.doesNotMatch(chatIndex, /createUserClient|SUPABASE_ANON_KEY/);

const database = await readFile(
  path.join(functionsRoot, "beacon-chat/_shared/database.mjs"),
  "utf8",
);
const finalizeBlock = database.slice(database.indexOf("export async function finalizeUsage"));
assert.doesNotMatch(finalizeBlock, /p_(?:prompt|answer|message|tool_output|client_name)/i);

console.log(`Beacon Edge verification passed (${files.length} source files).`);
