import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseEnv, loadDotEnv } from "./shared-env.mjs";

loadDotEnv();

const sqlFile = process.argv[2];
if (!sqlFile) {
  console.error(
    "Usage: node scripts/apply-release-gate-sql-file.mjs <gate.sql> [--apply] [--allow-production]",
  );
  process.exit(1);
}

const args = new Set(process.argv.slice(3));
const supportedArgs = new Set(["--apply", "--allow-production"]);
const unknownArgs = [...args].filter((arg) => !supportedArgs.has(arg));
if (unknownArgs.length > 0) {
  console.error(`Unknown arguments: ${unknownArgs.join(", ")}`);
  process.exit(1);
}

const shouldApply = args.has("--apply");
const allowProduction = args.has("--allow-production");
const resolvedPath = path.resolve(process.cwd(), sqlFile);
const releaseGatesDirectory = path.resolve(
  process.cwd(),
  "supabase/release-gates",
);
const relativePath = path.relative(releaseGatesDirectory, resolvedPath);

if (
  relativePath.startsWith(`..${path.sep}`) ||
  relativePath === ".." ||
  path.isAbsolute(relativePath) ||
  !relativePath.endsWith(".sql")
) {
  console.error("Only SQL files inside supabase/release-gates can be applied.");
  process.exit(1);
}

const sql = await fs.readFile(resolvedPath, "utf8");
const sha256 = createHash("sha256").update(sql).digest("hex");

if (!shouldApply) {
  console.log(
    JSON.stringify(
      {
        mode: "release-gate-dry-run",
        file: path.relative(process.cwd(), resolvedPath),
        bytes: Buffer.byteLength(sql),
        sha256,
      },
      null,
      2,
    ),
  );
  process.exit(0);
}

const { url, serviceRoleKey } = getSupabaseEnv();
const productionProjectRefs = new Set([
  "zjauqflzxzsbpnivzsct",
  ...(process.env.RETAINOS_ADDITIONAL_PRODUCTION_SUPABASE_PROJECT_REFS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean),
]);

let projectRef = "";
try {
  projectRef = new URL(url).hostname.split(".")[0] ?? "";
} catch {
  console.error("SUPABASE_URL is not a valid URL.");
  process.exit(1);
}

if (productionProjectRefs.has(projectRef) && !allowProduction) {
  console.error(
    "Refusing to apply a release gate to production without --allow-production.",
  );
  process.exit(1);
}

const supabase = createClient(url, serviceRoleKey, {
  auth: { persistSession: false },
});
const { error } = await supabase.rpc("exec_sql", { sql });
if (error) {
  console.error(error.message);
  process.exit(1);
}

console.log(
  JSON.stringify(
    {
      releaseGateApplied: true,
      file: path.relative(process.cwd(), resolvedPath),
      projectRef,
      sha256,
    },
    null,
    2,
  ),
);
