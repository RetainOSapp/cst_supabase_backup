export type InteractionTypeKey =
  | "general"
  | "onboarding"
  | "strategic_review"
  | "renewal";

export type InteractionTypeDefinition = {
  key: InteractionTypeKey;
  label: string;
  enabled: boolean;
  color: string;
  titlePatterns: string[];
};

export type InteractionSettings = {
  types: InteractionTypeDefinition[];
  strategicReviewPipeline: {
    enabled: boolean;
    pipelineId: string | null;
    targetStageId: string | null;
  };
};

export const DEFAULT_INTERACTION_TYPES: InteractionTypeDefinition[] = [
  {
    key: "general",
    label: "General call",
    enabled: true,
    color: "#64748B",
    titlePatterns: [],
  },
  {
    key: "onboarding",
    label: "Onboarding call",
    enabled: true,
    color: "#3B82F6",
    titlePatterns: ["onboarding", "kickoff", "kick-off"],
  },
  {
    key: "strategic_review",
    label: "Strategic Review",
    enabled: true,
    color: "#8B5CF6",
    titlePatterns: ["strategic review", "strategy review"],
  },
  {
    key: "renewal",
    label: "Renewal / Re-sign call",
    enabled: true,
    color: "#10B981",
    titlePatterns: ["renewal", "re-sign", "resign call", "upsell"],
  },
];

const TYPE_KEYS = new Set(DEFAULT_INTERACTION_TYPES.map((type) => type.key));

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function cleanText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function patterns(value: unknown, fallback: string[]) {
  if (!Array.isArray(value)) return fallback;
  return value.map(cleanText).filter(Boolean).slice(0, 20);
}

export function normalizeInteractionSettings(metadata: unknown): InteractionSettings {
  const root = objectValue(metadata);
  const configured = Array.isArray(root.client_interaction_types)
    ? root.client_interaction_types
    : [];
  const byKey = new Map(
    configured
      .map(objectValue)
      .filter((row) => TYPE_KEYS.has(cleanText(row.key) as InteractionTypeKey))
      .map((row) => [cleanText(row.key), row]),
  );
  const rule = objectValue(root.strategic_review_pipeline_automation);

  return {
    types: DEFAULT_INTERACTION_TYPES.map((fallback) => {
      const row = byKey.get(fallback.key);
      return {
        ...fallback,
        label: cleanText(row?.label) || fallback.label,
        enabled: row?.enabled !== false,
        color: cleanText(row?.color) || fallback.color,
        titlePatterns: patterns(row?.title_patterns, fallback.titlePatterns),
      };
    }),
    strategicReviewPipeline: {
      enabled: rule.enabled === true,
      pipelineId: cleanText(rule.pipeline_id) || null,
      targetStageId: cleanText(rule.target_stage_id) || null,
    },
  };
}

export function validateInteractionTypeKey(
  settings: InteractionSettings,
  value: unknown,
): InteractionTypeKey {
  const key = cleanText(value) || "general";
  const definition = settings.types.find(
    (type) => type.key === key && type.enabled,
  );
  return definition?.key ?? "general";
}

export function classifyInteractionTitle(
  settings: InteractionSettings,
  title: unknown,
): InteractionTypeKey {
  const normalizedTitle = cleanText(title).toLowerCase();
  if (!normalizedTitle) return "general";
  for (const type of settings.types) {
    if (!type.enabled || type.key === "general") continue;
    if (
      type.titlePatterns.some((pattern) =>
        normalizedTitle.includes(pattern.toLowerCase()),
      )
    ) {
      return type.key;
    }
  }
  return "general";
}

export function interactionLabel(
  settings: InteractionSettings,
  key: InteractionTypeKey,
) {
  return settings.types.find((type) => type.key === key)?.label ?? "General call";
}
