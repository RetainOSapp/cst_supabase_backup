import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

const advocacy = read("src/lib/clientAdvocacy.ts");
const panel = read("src/components/ClientAdvocacyPanel.tsx");
const clients = read("src/pages/Clients.tsx");
const clientDetail = read("src/pages/ClientDetail.tsx");
const quickUpdate = read(
  "supabase/functions/manage-client-quick-update/index.ts",
);
const outcomes = read("supabase/functions/manage-client-outcomes/index.ts");

const checks = [
  [
    "note-only advocacy drafts are created without metric actions",
    /buildStandaloneAdvocacyNoteDrafts[\s\S]{0,700}!notes \|\| draft\.asked > 0 \|\| draft\.received > 0/.test(
      advocacy,
    ),
  ],
  [
    "roster Quick Update submits standalone advocacy notes",
    /manage-client-quick-update[\s\S]{0,1200}advocacyNotes: buildStandaloneAdvocacyNoteDrafts\(advocacyDrafts\)/.test(
      clients,
    ),
  ],
  [
    "client profile outcome flows submit standalone advocacy notes",
    (clientDetail.match(/advocacyNotes/g)?.length ?? 0) >= 4,
  ],
  [
    "Quick Update validates and stores standalone notes",
    /const advocacyNotes = parseAdvocacyNotes\(body\.advocacyNotes\)/.test(
      quickUpdate,
    ) &&
      /advocacy_notes: advocacyNotes/.test(quickUpdate) &&
      quickUpdate.includes(
        "clientUpdates[`${prefix}_last_note`] = advocacyNote.notes",
      ),
  ],
  [
    "outcomes validates and stores standalone notes",
    /const advocacyNotes = parseAdvocacyNotes\(body\.advocacyNotes\)/.test(
      outcomes,
    ) &&
      /advocacy_notes: advocacyNotes/.test(outcomes) &&
      outcomes.includes(
        "advocacyNoteUpdates[`${prefix}_last_note`] = advocacyNote.notes",
      ) &&
      /\.\.\.refreshedAdvocacySummary,[\s\S]{0,80}\.\.\.advocacyNoteUpdates/.test(
        outcomes,
      ),
  ],
  [
    "history renders action-attached and standalone advocacy notes",
    /payload\.advocacy_events/.test(clientDetail) &&
      /payload\.advocacy_notes/.test(clientDetail) &&
      /Advocacy &amp; Growth/.test(clientDetail) &&
      /entry\.notes/.test(clientDetail),
  ],
  [
    "history search includes advocacy note contents",
    /const advocacyText = historyAdvocacyEntries\(event\)/.test(clientDetail) &&
      /event\.event_type,[\s\S]{0,80}advocacyText/.test(clientDetail),
  ],
  [
    "note-only behavior is explained in the form",
    /Saves as a note without changing asked or received counts\./.test(panel),
  ],
];

const failures = checks.filter(([, passed]) => !passed);
for (const [name, passed] of checks) {
  console.log(`${passed ? "PASS" : "FAIL"} ${name}`);
}

if (failures.length > 0) process.exitCode = 1;

console.log(
  `\n${checks.length - failures.length}/${checks.length} advocacy note history checks passed.`,
);
