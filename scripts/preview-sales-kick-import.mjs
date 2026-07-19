import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

const TODAY = new Date("2026-07-18T00:00:00.000Z");
const PATHWAY = "Sales Kick Software";

const MANAGER_MAPPING = {
  "Ben Hochheiser": { member: "Ben", legacyMemberId: "retm_sk_ben_csm" },
  "Aaron Rapoza": { member: "Aaron Rapoza", legacyMemberId: "retm_sk_aaron_rapoza" },
  "Giovanni Kisesa": { member: "Gio", legacyMemberId: "retm_sk_gio" },
  "Cameron Widner": {
    member: "Ben McLellan",
    legacyMemberId: "retm_sk_ben_mclellan",
    fallback: true,
  },
};

const MILESTONES = [
  { name: "Go Live", targetDays: 10 },
  { name: "Post Launch Check-in", targetDays: 14 },
  { name: "Day 17 Check-in", targetDays: 21 },
  { name: "Day 28 Check-in", targetDays: 30 },
  { name: "Day 45 Success Review", targetDays: 60 },
  { name: "Strategic Review", targetDays: 300 },
];

function parseArgs(argv) {
  const args = new Map();
  for (const raw of argv) {
    const [key, value = "true"] = raw.split("=", 2);
    if (key.startsWith("--")) args.set(key.slice(2), value);
  }
  return args;
}

function parseCsv(text) {
  const rows = [];
  let cell = "";
  let row = [];
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (char === '"' && quoted && next === '"') {
      cell += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      row.push(cell);
      cell = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(cell);
      if (row.some((value) => value.trim())) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }
  row.push(cell);
  if (row.some((value) => value.trim())) rows.push(row);
  const [headers = [], ...records] = rows;
  return records.map((cells) =>
    Object.fromEntries(headers.map((header, index) => [header.trim(), cells[index]?.trim() ?? ""])),
  );
}

function parseDate(value) {
  const text = String(value ?? "").trim();
  if (!text || text === "#N/A" || /^not /i.test(text)) return null;
  const date = new Date(`${text} UTC`);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

function dayDifference(startDate) {
  if (!startDate) return null;
  const start = new Date(`${startDate}T00:00:00.000Z`);
  return Math.max(0, Math.floor((TODAY.getTime() - start.getTime()) / 86400000));
}

function addDays(date, days) {
  const next = new Date(`${date}T00:00:00.000Z`);
  next.setUTCDate(next.getUTCDate() + days);
  return next.toISOString().slice(0, 10);
}

function inferMilestone(closeDate) {
  const elapsedDays = dayDifference(closeDate);
  if (elapsedDays === null) return { elapsedDays: null, milestone: null, milestoneDate: null };
  const reached = MILESTONES.filter((item) => elapsedDays >= item.targetDays).at(-1) ?? null;
  return {
    elapsedDays,
    milestone: reached?.name ?? null,
    milestoneDate: reached ? addDays(closeDate, reached.targetDays) : null,
  };
}

function parseEmails(value) {
  const emails = String(value ?? "")
    .split(/\s*(?:\/\/|\/)\s*/)
    .map((email) => email.trim().toLowerCase())
    .filter((email) => email.includes("@"));
  return { primary: emails[0] ?? null, secondary: emails[1] ?? null };
}

function parseCurrency(value) {
  const raw = String(value ?? "").trim();
  if (!raw || raw === "#N/A" || /usage based/i.test(raw)) return null;
  const parsed = Number(raw.replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function completionValue(value, { allowNotUsing = false } = {}) {
  const raw = String(value ?? "").trim();
  if (!raw || /not purchased/i.test(raw)) return null;
  if (/in progress|not completed/i.test(raw)) return false;
  if (allowNotUsing && /not using/i.test(raw)) return false;
  return parseDate(raw) ? true : null;
}

function features(value) {
  return String(value ?? "")
    .split(",")
    .map((feature) => feature.trim())
    .filter(Boolean);
}

function asPreview(row, rowNumber) {
  const closeDate = parseDate(row["Close Date"]);
  const contractStartDate = parseDate(row["Contract Start Date"]);
  const contractEndDate = parseDate(row["Contract End Date"]);
  const contractValue = parseCurrency(row["Contract Value"]);
  const contractMonths = Number(row["Contract Length (Months)"]);
  const monthlyValue =
    contractValue !== null && Number.isFinite(contractMonths) && contractMonths > 0
      ? Number((contractValue / contractMonths).toFixed(2))
      : null;
  const email = parseEmails(row.Email);
  const manager = MANAGER_MAPPING[row["Account Manager"]];
  const milestone = inferMilestone(closeDate);
  const warnings = [];
  if (!closeDate) warnings.push("Missing/invalid close date; no milestone can be inferred.");
  if (!manager) warnings.push(`Unknown Account Manager: ${row["Account Manager"] || "(blank)"}.`);
  if (!contractStartDate || !contractEndDate) warnings.push("No valid contract dates; no contract record will be created.");
  if (row["Contract Value"] && contractValue === null) warnings.push("Usage-based/non-numeric contract value is intentionally blank.");
  if (!parseDate(row["Last Call with AM"]) && row["Last Call with AM"]) warnings.push("Last Call with AM is not a date and will be blank.");

  return {
    rowNumber,
    clientName: row["Client Name"],
    companyName: row["Company Name"],
    primaryEmail: email.primary,
    secondaryEmail: email.secondary,
    programStatus: "front-end",
    pathway: PATHWAY,
    accountManagerSource: row["Account Manager"],
    assignedTo: manager?.member ?? null,
    assignedMemberId: manager?.legacyMemberId ?? null,
    isFallbackAssignment: manager?.fallback === true,
    closeDate,
    elapsedDays: milestone.elapsedDays,
    currentMilestone: milestone.milestone,
    milestoneDate: milestone.milestoneDate,
    contractStartDate,
    contractEndDate,
    contractValue,
    contractMonths: Number.isFinite(contractMonths) ? contractMonths : null,
    monthlyValue,
    slackChannelName: row["Slack Channel Name"] || null,
    lastContactDate: parseDate(row["Last Call with AM"]),
    featuresPurchased: features(row["Features Purchased"]),
    setup: {
      onboardingFormComplete: completionValue(row["OB Form Date"]),
      onboardingCallComplete: completionValue(row["OB Call Date"]),
      gradingSetupComplete: completionValue(row["Grading Criteria Status"]),
      calendarManagementSetupComplete: completionValue(row["Calendar Management Status"]),
      financialDataSetupComplete: completionValue(row["FD Status"]),
      lnsSetupComplete: completionValue(row["LNS Status"], { allowNotUsing: true }),
    },
    warnings,
  };
}

function countsBy(rows, selector) {
  return Object.fromEntries(
    [...rows.reduce((counts, row) => {
      const key = selector(row) ?? "None";
      counts.set(key, (counts.get(key) ?? 0) + 1);
      return counts;
    }, new Map()).entries()].sort(([a], [b]) => a.localeCompare(b)),
  );
}

const args = parseArgs(process.argv.slice(2));
const file = args.get("file");
const output = args.get("output");
if (!file || !output) {
  console.error("Usage: node scripts/preview-sales-kick-import.mjs --file=/path/to/source.csv --output=/path/to/preview.json");
  process.exit(1);
}

const source = await fs.readFile(path.resolve(file), "utf8");
const rows = parseCsv(source);
const previewRows = rows.map((row, index) => asPreview(row, index + 2));
const summary = {
  sourceFile: path.basename(file),
  sourceSha256: createHash("sha256").update(source).digest("hex"),
  generatedForDate: TODAY.toISOString().slice(0, 10),
  totalRows: previewRows.length,
  warnings: previewRows.reduce((total, row) => total + row.warnings.length, 0),
  assignment: countsBy(previewRows, (row) => row.assignedTo),
  fallbackAssignments: previewRows.filter((row) => row.isFallbackAssignment).length,
  milestones: countsBy(previewRows, (row) => row.currentMilestone),
  contracts: {
    willCreate: previewRows.filter((row) => row.contractStartDate && row.contractEndDate).length,
    skippedForMissingDates: previewRows.filter((row) => !row.contractStartDate || !row.contractEndDate).length,
    blankMonthlyValue: previewRows.filter((row) => row.monthlyValue === null).length,
  },
  lastContact: {
    willImport: previewRows.filter((row) => row.lastContactDate).length,
    blank: previewRows.filter((row) => !row.lastContactDate).length,
  },
};

await fs.mkdir(path.dirname(path.resolve(output)), { recursive: true });
await fs.writeFile(path.resolve(output), JSON.stringify({ summary, rows: previewRows }, null, 2));
console.log(JSON.stringify(summary, null, 2));
