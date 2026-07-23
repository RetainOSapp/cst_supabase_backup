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
  return (
    exactKeys(value, ["timestamp", "speaker_role", "quote"]) &&
    boundedString(value.timestamp, 0, 32) &&
    ["client", "team_member", "unknown"].includes(value.speaker_role) &&
    boundedString(value.quote, 1, 240)
  );
}

function evidenceList(value, max = 3) {
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

export function validateStructuredV2(value) {
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
        evidenceList(item.evidence),
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
        evidenceList(item.evidence),
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
    !evidenceList(value.archetype.evidence)
  ) {
    errors.push("archetype");
  }
  return { ok: errors.length === 0, errors };
}
