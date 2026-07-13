import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const account = fs.readFileSync(path.join(root, "src/lib/accountContext.tsx"), "utf8");
const detail = fs.readFileSync(path.join(root, "src/pages/ClientDetail.tsx"), "utf8");
const milestone = fs.readFileSync(
  path.join(root, "supabase/functions/manage-client-milestone/index.ts"),
  "utf8",
);

const checks = [
  [
    "CSM receives the pathway-management UI capability",
    account.includes(
      "canManageClientPathways: isSuperAdmin || isDirector || isCsm",
    ),
  ],
  [
    "pathway UI explains assigned-CSM access",
    detail.includes(
      "Super Admins, Directors, and assigned CSMs can change the active",
    ),
  ],
  [
    "backend checks CSM primary or secondary assignment",
    milestone.includes('if (actor.role === "csm")') &&
      milestone.includes("assignmentIds.includes(client.csm_team_member_id") &&
      milestone.includes("assignmentIds.includes(client.csm_secondary_assignee_id") &&
      milestone.includes("CSMs can update assigned client milestones only."),
  ],
  [
    "backend allows assigned CSM pathway changes",
    milestone.includes('actor.role !== "csm"') &&
      milestone.includes(
        "Only Super Admins, Directors, and assigned CSMs can change pathways.",
      ),
  ],
];

let failed = 0;
for (const [label, passed] of checks) {
  console.log(`${passed ? "PASS" : "FAIL"} ${label}`);
  if (!passed) failed += 1;
}

console.log(`\n${checks.length - failed}/${checks.length} CSM pathway checks passed.`);
if (failed) process.exit(1);
