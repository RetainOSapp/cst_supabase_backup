import fs from "node:fs/promises";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseEnv, loadDotEnv } from "./shared-env.mjs";

loadDotEnv();

const sqlFile = process.argv[2];
if (!sqlFile) {
  console.error("Usage: node scripts/apply-sql-file.mjs <path-to-sql-file>");
  process.exit(1);
}

const resolvedPath = path.resolve(process.cwd(), sqlFile);
const sql = await fs.readFile(resolvedPath, "utf8");
const { url, serviceRoleKey } = getSupabaseEnv();
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
      applied: true,
      file: path.relative(process.cwd(), resolvedPath),
    },
    null,
    2,
  ),
);
