import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { normalizeParticipantContext } from "../supabase/functions/process-call-intelligence/_shared/participant-context.mjs";

const sourceArgument =
  process.argv[2] ?? process.env.CALL_INTELLIGENCE_ZAPIER_EXPORT;
if (!sourceArgument) {
  throw new Error(
    "Pass the private Zapier JSON export path as the first argument or set CALL_INTELLIGENCE_ZAPIER_EXPORT.",
  );
}
const sourcePath = resolve(sourceArgument);
const outputPath = resolve(
  process.argv[3] ??
    ".call-intelligence-private/fathom-zapier-corpus.json",
);

const source = JSON.parse(await readFile(sourcePath, "utf8"));
if (!source || typeof source !== "object" || Array.isArray(source)) {
  throw new Error("Expected the Zapier export to be an object keyed by run ID.");
}

const calls = [];
for (const [runKey, run] of Object.entries(source)) {
  const transcript =
    typeof run?.output__274138252__transcript__plaintext === "string"
      ? run.output__274138252__transcript__plaintext.trim()
      : "";
  if (!transcript) {
    throw new Error(`Zapier run ${runKey} is missing a plaintext transcript.`);
  }
  const attendeeCount = Array.isArray(run?.output__274138252__meeting__invitees)
    ? run.output__274138252__meeting__invitees.length
    : null;
  const digest = createHash("sha256")
    .update(`${runKey}:${transcript}`)
    .digest("hex");
  const participantContext = normalizeParticipantContext([
    {
      name: run?.output__274138252__fathom_user__name,
      role: "team_member",
    },
    ...(Array.isArray(run?.output__274138252__meeting__invitees)
      ? run.output__274138252__meeting__invitees.map((invitee) => ({
          name: invitee?.name,
          role: invitee?.is_external === true ? "client" : "team_member",
        }))
      : []),
  ]);
  calls.push({
    id: `private-fathom-${digest.slice(0, 12)}`,
    category: "real_fathom_single_client_account",
    metadata: {
      attendee_count: attendeeCount,
      transcript_characters: transcript.length,
    },
    participant_context: participantContext,
    transcript,
  });
}

if (calls.length === 0) {
  throw new Error("No Zapier runs were found.");
}

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(
  outputPath,
  `${JSON.stringify(
    {
      corpus_version: "private-fathom-zapier-v1",
      source_kind: "local_zapier_export",
      calls,
    },
    null,
    2,
  )}\n`,
  "utf8",
);

console.log(
  JSON.stringify(
    {
      output: outputPath,
      calls: calls.length,
      transcriptCharacters: calls.reduce(
        (total, call) => total + call.transcript.length,
        0,
      ),
      committed: false,
    },
    null,
    2,
  ),
);
