import { execFileSync } from "node:child_process";

const args = process.argv.slice(2);
if (args.length > 1 || (args.length === 1 && args[0] !== "--committed")) {
  console.error("FAIL: unknown argument; expected --committed");
  process.exit(1);
}

function git(...gitArgs) {
  try {
    return execFileSync("git", gitArgs, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  } catch (error) {
    const detail = error.stderr?.toString().trim();
    console.error(`FAIL: git ${gitArgs.join(" ")} failed${detail ? `: ${detail}` : ""}`);
    process.exit(1);
  }
}

const branch = git("branch", "--show-current");
if (!branch || branch === "main") {
  console.error("FAIL: security scope checks require a non-main branch");
  process.exit(1);
}

const changedFiles = args[0] === "--committed"
  ? git("diff", "--name-only", "origin/main...HEAD")
  : git("diff", "--cached", "--name-only");
const files = changedFiles ? changedFiles.split("\n").filter(Boolean) : [];

if (files.length === 0) {
  console.error("FAIL: no files found in the inspected scope");
  process.exit(1);
}

const forbidden = (file) => file === "package.json"
  || file === "package-lock.json"
  || file === "src/components/Header.tsx"
  || file === "src/components/Beacon.tsx"
  || file.startsWith("src/lib/beacon/")
  || file.startsWith("old glide project test/");

const forbiddenFiles = files.filter(forbidden);
if (forbiddenFiles.length > 0) {
  console.error(`FAIL: forbidden path in inspected scope: ${forbiddenFiles[0]}`);
  process.exit(1);
}

console.log(`PASS: security scope contains ${files.length} inspected file${files.length === 1 ? "" : "s"}`);
