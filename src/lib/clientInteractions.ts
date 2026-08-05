import { supabase } from "./supabase.ts";

export type ClientInteractionTypeKey =
  | "general"
  | "onboarding"
  | "strategic_review"
  | "renewal";

export interface ClientInteractionType {
  key: ClientInteractionTypeKey;
  label: string;
  enabled: boolean;
  color: string;
  titlePatterns: string[];
}

export interface StrategicReviewPipelineAutomation {
  enabled: boolean;
  pipelineId: string | null;
  targetStageId: string | null;
}

export interface ClientInteractionSettings {
  types: ClientInteractionType[];
  strategicReviewPipeline: StrategicReviewPipelineAutomation;
}

export interface ClientInteractionEvent {
  id: string;
  attendance_status: "attended" | "missed";
  occurred_at: string;
  source: string;
  notes: string | null;
  actor_member_id: string | null;
  metadata: Record<string, unknown>;
}

export const DEFAULT_CLIENT_INTERACTION_TYPES: ClientInteractionType[] = [
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

const TYPE_KEYS = new Set<ClientInteractionTypeKey>(
  DEFAULT_CLIENT_INTERACTION_TYPES.map((type) => type.key),
);

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function cleanText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizePatterns(value: unknown, fallback: string[]) {
  if (!Array.isArray(value)) return fallback;
  return value
    .map(cleanText)
    .filter(Boolean)
    .slice(0, 20);
}

export function normalizeClientInteractionSettings(
  metadata: unknown,
): ClientInteractionSettings {
  const root = objectValue(metadata);
  const configured = Array.isArray(root.client_interaction_types)
    ? root.client_interaction_types
    : [];
  const byKey = new Map(
    configured
      .map(objectValue)
      .filter((row) => TYPE_KEYS.has(cleanText(row.key) as ClientInteractionTypeKey))
      .map((row) => [cleanText(row.key), row]),
  );

  const types = DEFAULT_CLIENT_INTERACTION_TYPES.map((fallback) => {
    const row = byKey.get(fallback.key);
    return {
      ...fallback,
      label: cleanText(row?.label) || fallback.label,
      enabled: row?.enabled !== false,
      color: cleanText(row?.color) || fallback.color,
      titlePatterns: normalizePatterns(row?.title_patterns, fallback.titlePatterns),
    };
  });
  const pipelineRule = objectValue(root.strategic_review_pipeline_automation);

  return {
    types,
    strategicReviewPipeline: {
      enabled: pipelineRule.enabled === true,
      pipelineId: cleanText(pipelineRule.pipeline_id) || null,
      targetStageId: cleanText(pipelineRule.target_stage_id) || null,
    },
  };
}

export function interactionTypeKeyFromMetadata(
  metadata: unknown,
): ClientInteractionTypeKey {
  const value = cleanText(objectValue(metadata).interaction_type_key);
  return TYPE_KEYS.has(value as ClientInteractionTypeKey)
    ? (value as ClientInteractionTypeKey)
    : "general";
}

export async function loadClientInteractionSettings(
  companyLegacyId: string,
): Promise<ClientInteractionSettings> {
  if (!companyLegacyId) {
    return normalizeClientInteractionSettings(null);
  }
  const { data: company, error: companyError } = await supabase
    .from("companies")
    .select("id")
    .eq("legacy_glide_row_id", companyLegacyId)
    .maybeSingle();
  if (companyError || !company?.id) {
    if (companyError) throw companyError;
    return normalizeClientInteractionSettings(null);
  }
  const { data: settings, error: settingsError } = await supabase
    .from("company_settings")
    .select("metadata")
    .eq("company_id", company.id)
    .maybeSingle();
  if (settingsError) throw settingsError;
  return normalizeClientInteractionSettings(settings?.metadata);
}

export function interactionTypeLabel(
  settings: ClientInteractionSettings,
  key: ClientInteractionTypeKey,
) {
  return (
    settings.types.find((type) => type.key === key)?.label ??
    DEFAULT_CLIENT_INTERACTION_TYPES.find((type) => type.key === key)?.label ??
    "General call"
  );
}
