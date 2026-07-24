import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import {
  participantRoleConflictCount,
} from "../supabase/functions/process-call-intelligence/_shared/participant-context.mjs";
import {
  sanitizeStructuredEvidence,
  validateStructuredV2,
} from "../supabase/functions/process-call-intelligence/_shared/validation.mjs";
import {
  scoreStructuredResult,
  summarizeEvaluation,
} from "./lib/call-intelligence-eval-score.mjs";

const valueAfter = (name, fallback = null) => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
};
const privateRoot = resolve(".call-intelligence-private");
const sourcePath = resolve(valueAfter("--source", ""));
const corpusPath = resolve(valueAfter("--corpus", ""));
const outputPath = resolve(valueAfter("--output", ""));

for (const [label, path] of [
  ["source", sourcePath],
  ["corpus", corpusPath],
  ["output", outputPath],
]) {
  const child = relative(privateRoot, path);
  if (!child || child.startsWith("..") || resolve(privateRoot, child) !== path) {
    throw new Error(`${label} must be inside .call-intelligence-private.`);
  }
}

const [source, corpus] = await Promise.all([
  readFile(sourcePath, "utf8").then(JSON.parse),
  readFile(corpusPath, "utf8").then(JSON.parse),
]);
const calls = new Map((corpus.calls ?? []).map((call) => [call.id, call]));
const results = (source.results ?? []).map((row) => {
  const call = calls.get(row.callId);
  if (!call) throw new Error("Evaluation call is absent from the corpus.");
  const next = structuredClone(row);
  if (!next.structuredV2?.output) return next;
  if (
    participantRoleConflictCount(
      call.transcript,
      call.participant_context,
    ) > 0
  ) {
    next.structuredV2.output = null;
    next.structuredV2.quarantine = {
      category: "participant_role_conflict",
    };
    next.structuredV2.validation = {
      ok: false,
      errors: ["participant_role_conflict"],
    };
    next.structuredV2.score = null;
    return next;
  }
  const sanitized = sanitizeStructuredEvidence(next.structuredV2.output, {
    transcript: call.transcript,
    participantContext: call.participant_context,
  });
  const validation = validateStructuredV2(sanitized.value, {
    transcript: call.transcript,
    participantContext: call.participant_context,
  });
  next.structuredV2.output = sanitized.value;
  next.structuredV2.sanitization = {
    removedEvidenceCount: sanitized.removedEvidenceCount,
    removedClaimCount: sanitized.removedClaimCount,
    suppressedArchetypeCount: sanitized.suppressedArchetypeCount,
  };
  next.structuredV2.validation = validation;
  next.structuredV2.score = scoreStructuredResult({
    output: sanitized.value,
    validation,
    transcript: call.transcript,
    participantContext: call.participant_context,
    expectations: call.expectations,
  });
  return next;
});

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(
  outputPath,
  `${JSON.stringify(
    {
      manifest: {
        ...source.manifest,
        mode: "deterministic_replay",
      },
      summary: summarizeEvaluation(results),
      results,
    },
    null,
    2,
  )}\n`,
  "utf8",
);
console.log(`Wrote private deterministic replay to ${outputPath}`);
