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

function evidence(value) {
  return (
    object(value) &&
    typeof value.timestamp === "string" &&
    ["client", "team_member", "unknown"].includes(value.speaker_role) &&
    typeof value.quote === "string" &&
    value.quote.length <= 240
  );
}

function evidenceList(value, max = 3) {
  return Array.isArray(value) && value.length <= max && value.every(evidence);
}

function signal(value) {
  return (
    object(value) &&
    SENTIMENTS.has(value.label) &&
    CONFIDENCE.has(value.confidence) &&
    evidenceList(value.evidence)
  );
}

function score(value) {
  return (
    object(value) &&
    SCORE_VALUES.has(value.score) &&
    typeof value.rationale === "string" &&
    evidenceList(value.evidence)
  );
}

export function validateStructuredV2(value) {
  const errors = [];
  if (!object(value)) return { ok: false, errors: ["result_not_object"] };
  if (value.schema_version !== "call_intelligence.v2") {
    errors.push("schema_version");
  }
  if (!CALL_TYPES.has(value.call_type)) errors.push("call_type");
  if (typeof value.title_label !== "string") errors.push("title_label");
  if (typeof value.summary !== "string") errors.push("summary");
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
          object(item) &&
          typeof item.label === "string" &&
          typeof item.summary === "string" &&
          Array.isArray(item.emotions) &&
          item.emotions.every((emotion) => typeof emotion === "string") &&
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
        object(item) &&
        typeof item.summary === "string" &&
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
        object(item) &&
        typeof item.owner === "string" &&
        typeof item.action === "string" &&
        typeof item.due_date === "string" &&
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
    !object(value.call_score) ||
    !dimensions.every(score) ||
    !Number.isInteger(value.call_score.total) ||
    value.call_score.total !==
      dimensions.reduce((total, dimension) => total + dimension.score, 0)
  ) {
    errors.push("call_score");
  }
  if (
    !object(value.archetype) ||
    !ARCHETYPES.has(value.archetype.label) ||
    !CONFIDENCE.has(value.archetype.confidence) ||
    !evidenceList(value.archetype.evidence)
  ) {
    errors.push("archetype");
  }
  return { ok: errors.length === 0, errors };
}
