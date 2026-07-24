import {
  evidenceRoleIsGrounded,
  parseTranscriptUtterances,
} from "./participant-context.mjs";

const SENTIMENTS = new Set([
  "positive",
  "neutral",
  "negative",
  "insufficient_evidence",
]);
const CONFIDENCE = new Set(["low", "medium", "high"]);
const SCORE_VALUES = new Set([0, 1, 3, 5, 7]);
const CALL_TYPES = new Set([
  "onboarding",
  "check_in",
  "sales_discovery",
  "renewal",
  "upsell",
  "escalation",
  "other",
]);
const ARCHETYPES = new Set([
  "doer",
  "controller",
  "worrier",
  "follower",
  "insufficient_evidence",
]);
const MAX_EVIDENCE_ITEMS = 1;
const MAX_EVIDENCE_QUOTE_CHARACTERS = 120;
const MIN_EVIDENCE_QUOTE_WORDS = 4;
const MAX_EVIDENCE_QUOTE_WORDS = 12;

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value);
}

function boundedString(value, min, max) {
  return (
    typeof value === "string" &&
    value.length >= min &&
    value.length <= max
  );
}

export function normalizeEvidenceText(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[“”‘’"']/g, "")
    .replace(/[^\p{Letter}\p{Number}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function collectStructuredEvidence(value) {
  const entries = [];
  const seen = new Set();

  function visit(current, path = []) {
    if (Array.isArray(current)) {
      current.forEach((item, index) => visit(item, [...path, index]));
      return;
    }
    if (!object(current)) return;
    if (
      typeof current.timestamp === "string" &&
      typeof current.speaker_role === "string" &&
      typeof current.quote === "string"
    ) {
      const key = JSON.stringify([
        current.timestamp,
        current.speaker_role,
        current.quote,
      ]);
      if (!seen.has(key)) {
        seen.add(key);
        entries.push({ item: current, path: path.join(".") });
      }
    }
    for (const [key, child] of Object.entries(current)) {
      visit(child, [...path, key]);
    }
  }

  visit(value);
  return entries;
}

export function evidenceIsGrounded(item, transcript) {
  if (!item || typeof transcript !== "string" || !transcript.trim()) {
    return false;
  }
  const quote = normalizeEvidenceText(item.quote);
  if (!quote) return false;
  if (!item.timestamp) {
    return normalizeEvidenceText(transcript).includes(quote);
  }

  const parsedUtterances = parseTranscriptUtterances(transcript);
  if (parsedUtterances.length > 0) {
    return parsedUtterances.some(
      (utterance) =>
        utterance.timestamp === item.timestamp &&
        normalizeEvidenceText(utterance.text).includes(quote),
    );
  }

  let searchFrom = 0;
  while (searchFrom < transcript.length) {
    const timestampIndex = transcript.indexOf(item.timestamp, searchFrom);
    if (timestampIndex < 0) return false;
    const afterTimestamp = timestampIndex + item.timestamp.length;
    const nextTimestamp = transcript
      .slice(afterTimestamp)
      .search(
        /(?:^|\r?\n)\s*\d{1,3}:\d{2}(?::\d{2})?\s*[-–—:]/m,
      );
    const contextEnd =
      nextTimestamp < 0
        ? transcript.length
        : afterTimestamp + nextTimestamp;
    const context = transcript.slice(timestampIndex, contextEnd);
    if (normalizeEvidenceText(context).includes(quote)) return true;
    searchFrom = afterTimestamp;
  }
  return false;
}

function exactKeys(value, keys) {
  if (!object(value)) return false;
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return (
    actual.length === expected.length &&
    actual.every((key, index) => key === expected[index])
  );
}

function evidence(value) {
  const quoteWords = String(value?.quote ?? "")
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
  return (
    exactKeys(value, ["timestamp", "speaker_role", "quote"]) &&
    boundedString(value.timestamp, 0, 32) &&
    ["client", "team_member", "unknown"].includes(value.speaker_role) &&
    boundedString(value.quote, 1, MAX_EVIDENCE_QUOTE_CHARACTERS) &&
    quoteWords >= MIN_EVIDENCE_QUOTE_WORDS &&
    quoteWords <= MAX_EVIDENCE_QUOTE_WORDS
  );
}

export function sanitizeStructuredEvidence(
  value,
  { transcript = null, participantContext = null } = {},
) {
  const sanitized = structuredClone(value);
  let removedEvidenceCount = 0;
  let removedClaimCount = 0;
  let suppressedArchetypeCount = 0;

  function visit(current) {
    if (Array.isArray(current)) {
      current.forEach(visit);
      return;
    }
    if (!object(current)) return;
    if (Array.isArray(current.evidence)) {
      current.evidence = current.evidence.filter((item) => {
        if (!evidence(item)) {
          removedEvidenceCount += 1;
          return false;
        }
        const quoteGrounded =
          typeof transcript !== "string" ||
          evidenceIsGrounded(item, transcript);
        const roleGrounded =
          participantContext === null ||
          evidenceRoleIsGrounded(item, transcript, participantContext);
        if (quoteGrounded && roleGrounded) return true;
        removedEvidenceCount += 1;
        return false;
      });
    }
    for (const [key, child] of Object.entries(current)) {
      if (key !== "evidence") visit(child);
    }
  }

  visit(sanitized);
  for (const key of ["client_pain_points", "next_steps"]) {
    if (!Array.isArray(sanitized?.[key])) continue;
    sanitized[key] = sanitized[key].filter((item) => {
      if (Array.isArray(item?.evidence) && item.evidence.length === 1) {
        return true;
      }
      removedClaimCount += 1;
      return false;
    });
  }
  if (
    object(sanitized?.archetype) &&
    sanitized.archetype.label !== "insufficient_evidence" &&
    (
      sanitized.archetype.confidence !== "high" ||
      !Array.isArray(sanitized.archetype.evidence) ||
      sanitized.archetype.evidence.length < 2 ||
      new Set(
        sanitized.archetype.evidence.map((item) => item.timestamp),
      ).size < 2
    )
  ) {
    sanitized.archetype = {
      label: "insufficient_evidence",
      confidence: "low",
      evidence: [],
    };
    suppressedArchetypeCount = 1;
  }
  return {
    value: sanitized,
    removedEvidenceCount,
    removedClaimCount,
    suppressedArchetypeCount,
  };
}

function evidenceList(value, max = MAX_EVIDENCE_ITEMS) {
  return Array.isArray(value) && value.length <= max && value.every(evidence);
}

function signal(value) {
  return (
    exactKeys(value, ["label", "confidence", "evidence"]) &&
    SENTIMENTS.has(value.label) &&
    CONFIDENCE.has(value.confidence) &&
    evidenceList(value.evidence)
  );
}

function score(value) {
  return (
    exactKeys(value, ["score", "rationale", "evidence"]) &&
    SCORE_VALUES.has(value.score) &&
    boundedString(value.rationale, 1, 600) &&
    evidenceList(value.evidence)
  );
}

export function validateStructuredV2(
  value,
  { transcript = null, participantContext = null } = {},
) {
  const errors = [];
  if (!object(value)) return { ok: false, errors: ["result_not_object"] };
  if (
    !exactKeys(value, [
      "schema_version",
      "call_type",
      "title_label",
      "summary",
      "client_sentiment",
      "team_member_sentiment",
      "negative_signals",
      "positive_signals",
      "client_pain_points",
      "next_steps",
      "call_score",
      "archetype",
    ])
  ) {
    errors.push("root_properties");
  }
  if (value.schema_version !== "call_intelligence.v2") {
    errors.push("schema_version");
  }
  if (!CALL_TYPES.has(value.call_type)) errors.push("call_type");
  if (!boundedString(value.title_label, 1, 160)) errors.push("title_label");
  if (!boundedString(value.summary, 1, 2_500)) errors.push("summary");
  if (!signal(value.client_sentiment)) errors.push("client_sentiment");
  if (!signal(value.team_member_sentiment)) {
    errors.push("team_member_sentiment");
  }
  for (const key of ["negative_signals", "positive_signals"]) {
    if (
      !Array.isArray(value[key]) ||
      value[key].length > 3 ||
      !value[key].every(
        (item) =>
          exactKeys(item, ["label", "summary", "emotions", "evidence"]) &&
          boundedString(item.label, 1, 100) &&
          boundedString(item.summary, 1, 500) &&
          Array.isArray(item.emotions) &&
          item.emotions.length <= 3 &&
          item.emotions.every((emotion) => boundedString(emotion, 1, 60)) &&
          evidenceList(item.evidence),
      )
    ) {
      errors.push(key);
    }
  }
  if (
    !Array.isArray(value.client_pain_points) ||
    value.client_pain_points.length > 10 ||
    !value.client_pain_points.every(
      (item) =>
        exactKeys(item, ["summary", "evidence"]) &&
        boundedString(item.summary, 1, 500) &&
        evidenceList(item.evidence) &&
        item.evidence.length === 1,
    )
  ) {
    errors.push("client_pain_points");
  }
  if (
    !Array.isArray(value.next_steps) ||
    value.next_steps.length > 12 ||
    !value.next_steps.every(
      (item) =>
        exactKeys(item, ["owner", "action", "due_date", "evidence"]) &&
        boundedString(item.owner, 0, 160) &&
        boundedString(item.action, 1, 500) &&
        typeof item.due_date === "string" &&
        (item.due_date === "" || /^\d{4}-\d{2}-\d{2}$/.test(item.due_date)) &&
        evidenceList(item.evidence) &&
        item.evidence.length === 1,
    )
  ) {
    errors.push("next_steps");
  }
  const dimensions = [
    value.call_score?.agenda,
    value.call_score?.team_member_energy,
    value.call_score?.recap,
    value.call_score?.action_plan,
  ];
  if (
    !exactKeys(value.call_score, [
      "total",
      "agenda",
      "team_member_energy",
      "recap",
      "action_plan",
    ]) ||
    !dimensions.every(score) ||
    !Number.isInteger(value.call_score.total) ||
    value.call_score.total !==
      dimensions.reduce((total, dimension) => total + dimension.score, 0)
  ) {
    errors.push("call_score");
  }
  if (
    !exactKeys(value.archetype, ["label", "confidence", "evidence"]) ||
    !ARCHETYPES.has(value.archetype.label) ||
    !CONFIDENCE.has(value.archetype.confidence) ||
    !evidenceList(value.archetype.evidence, 2) ||
    (
      value.archetype.label === "insufficient_evidence"
        ? value.archetype.confidence !== "low" ||
          value.archetype.evidence.length !== 0
        : value.archetype.confidence !== "high" ||
          value.archetype.evidence.length !== 2 ||
          new Set(
            value.archetype.evidence.map((item) => item.timestamp),
          ).size !== 2
    )
  ) {
    errors.push("archetype");
  }
  if (
    typeof transcript === "string" &&
    collectStructuredEvidence(value).some(
      ({ item }) => !evidenceIsGrounded(item, transcript),
    )
  ) {
    errors.push("evidence_grounding");
  }
  if (
    typeof transcript === "string" &&
    participantContext !== null &&
    collectStructuredEvidence(value).some(
      ({ item }) =>
        !evidenceRoleIsGrounded(item, transcript, participantContext),
    )
  ) {
    errors.push("evidence_attribution");
  }
  return { ok: errors.length === 0, errors };
}
