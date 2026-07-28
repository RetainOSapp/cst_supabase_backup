export type ClientIdentityMode = "person_first" | "business_first";
export type ClientIdentityOverride = "inherit" | ClientIdentityMode;

export interface ClientIdentityPreferences {
  companyMode: ClientIdentityMode;
  pathwayModes: Record<string, ClientIdentityMode>;
}

export interface ClientIdentitySource {
  client_name?: unknown;
  client_business?: unknown;
  business_name?: unknown;
  offer_milestones_current_offer_id?: unknown;
  pathway_id?: unknown;
}

export interface ResolvedClientIdentity {
  primary: string;
  secondary: string | null;
  personName: string | null;
  businessName: string | null;
  mode: ClientIdentityMode;
}

export const DEFAULT_CLIENT_IDENTITY_MODE: ClientIdentityMode = "person_first";

function cleanText(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function normalizeClientIdentityMode(
  value: unknown,
  fallback: ClientIdentityMode = DEFAULT_CLIENT_IDENTITY_MODE,
): ClientIdentityMode {
  return value === "business_first" || value === "person_first"
    ? value
    : fallback;
}

export function normalizeClientIdentityOverride(
  value: unknown,
): ClientIdentityOverride {
  return value === "business_first" || value === "person_first"
    ? value
    : "inherit";
}

export function clientIdentityModeFromMetadata(
  metadata: unknown,
  fallback: ClientIdentityMode = DEFAULT_CLIENT_IDENTITY_MODE,
) {
  const record =
    metadata && typeof metadata === "object" && !Array.isArray(metadata)
      ? (metadata as Record<string, unknown>)
      : {};
  return normalizeClientIdentityMode(record.client_identity_mode, fallback);
}

export function clientIdentityOverrideFromMetadata(metadata: unknown) {
  const record =
    metadata && typeof metadata === "object" && !Array.isArray(metadata)
      ? (metadata as Record<string, unknown>)
      : {};
  return normalizeClientIdentityOverride(record.client_identity_mode);
}

export function clientIdentityModeFor(
  client: ClientIdentitySource | null | undefined,
  preferences: ClientIdentityPreferences,
) {
  const pathwayId =
    cleanText(client?.offer_milestones_current_offer_id) ??
    cleanText(client?.pathway_id);
  return (
    (pathwayId ? preferences.pathwayModes[pathwayId] : undefined) ??
    preferences.companyMode
  );
}

export function resolveClientIdentity(
  client: ClientIdentitySource | null | undefined,
  preferences: ClientIdentityPreferences,
): ResolvedClientIdentity {
  const personName = cleanText(client?.client_name);
  const businessName =
    cleanText(client?.client_business) ?? cleanText(client?.business_name);
  const mode = clientIdentityModeFor(client, preferences);
  const preferredPrimary =
    mode === "business_first" ? businessName : personName;
  const alternatePrimary =
    mode === "business_first" ? personName : businessName;
  const primary = preferredPrimary ?? alternatePrimary ?? "Unnamed client";
  const secondaryCandidate =
    mode === "business_first" ? personName : businessName;
  const secondary =
    secondaryCandidate &&
    secondaryCandidate.localeCompare(primary, undefined, {
      sensitivity: "base",
    }) !== 0
      ? secondaryCandidate
      : null;

  return {
    primary,
    secondary,
    personName,
    businessName,
    mode,
  };
}

export function clientIdentitySearchText(
  client: ClientIdentitySource | null | undefined,
) {
  return [client?.client_name, client?.client_business, client?.business_name]
    .map(cleanText)
    .filter((value): value is string => Boolean(value))
    .join(" ")
    .toLowerCase();
}

export function emptyClientIdentityPreferences(): ClientIdentityPreferences {
  return {
    companyMode: DEFAULT_CLIENT_IDENTITY_MODE,
    pathwayModes: {},
  };
}
