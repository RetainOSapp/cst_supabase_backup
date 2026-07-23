export const CALL_INTELLIGENCE_SCHEMA_VERSION = "call_intelligence.v1";
export const MAX_TRANSCRIPT_CHARACTERS = 500_000;
export const MAX_PARTICIPANTS = 100;

export class ContractError extends Error {
  constructor(message, field = null) {
    super(message);
    this.name = "ContractError";
    this.field = field;
  }
}

export function cleanText(value, maxLength = 10_000) {
  const text = typeof value === "string" ? value.trim() : "";
  return text.slice(0, maxLength);
}

export function normalizeEmail(value) {
  const email = cleanText(value, 320).toLowerCase();
  if (!email || !email.includes("@") || /[\s,%_*\\]/.test(email)) return null;
  return email;
}

function requiredText(value, field, maxLength) {
  const text =
    typeof value === "number" && Number.isFinite(value)
      ? String(value)
      : cleanText(value, maxLength);
  if (!text) throw new ContractError(`${field} is required.`, field);
  if (text.length > maxLength) {
    throw new ContractError(`${field} is too long.`, field);
  }
  return text;
}

function optionalHttpsUrl(value, field) {
  const text = cleanText(value, 2_000);
  if (!text) return null;
  let url;
  try {
    url = new URL(text);
  } catch {
    throw new ContractError(`${field} must be a valid URL.`, field);
  }
  if (url.protocol !== "https:") {
    throw new ContractError(`${field} must use HTTPS.`, field);
  }
  return url.toString();
}

function occurredAt(value) {
  const text = requiredText(value, "occurred_at", 100);
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) {
    throw new ContractError("occurred_at must be a valid timestamp.", "occurred_at");
  }
  return date.toISOString();
}

function durationSeconds(value) {
  if (value == null || value === "") return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 86_400) {
    throw new ContractError(
      "duration_seconds must be an integer between 0 and 86400.",
      "duration_seconds",
    );
  }
  return parsed;
}

function participant(value, index, providerRole = "invitee") {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ContractError(
      `participants[${index}] must be an object.`,
      "participants",
    );
  }
  const email = normalizeEmail(value.email);
  const name = cleanText(value.name, 300) || null;
  if (!email && !name) {
    throw new ContractError(
      `participants[${index}] requires name or email.`,
      "participants",
    );
  }
  return {
    name,
    email,
    is_external:
      typeof value.is_external === "boolean" ? value.is_external : null,
    provider_role: providerRole,
  };
}

export function parseInboundCall(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new ContractError("Request body must be a JSON object.");
  }

  const schemaVersion = requiredText(
    body.schema_version,
    "schema_version",
    80,
  );
  if (schemaVersion !== CALL_INTELLIGENCE_SCHEMA_VERSION) {
    throw new ContractError(
      `schema_version must be ${CALL_INTELLIGENCE_SCHEMA_VERSION}.`,
      "schema_version",
    );
  }

  const provider = requiredText(body.provider, "provider", 40).toLowerCase();
  if (provider !== "fathom") {
    throw new ContractError("provider must be fathom in V1.", "provider");
  }

  const transcript = requiredText(
    body.transcript,
    "transcript",
    MAX_TRANSCRIPT_CHARACTERS + 1,
  );
  if (transcript.length > MAX_TRANSCRIPT_CHARACTERS) {
    throw new ContractError(
      `transcript exceeds ${MAX_TRANSCRIPT_CHARACTERS} characters.`,
      "transcript",
    );
  }

  const rawParticipants = body.participants == null ? [] : body.participants;
  if (!Array.isArray(rawParticipants)) {
    throw new ContractError("participants must be an array.", "participants");
  }
  if (rawParticipants.length > MAX_PARTICIPANTS) {
    throw new ContractError(
      `participants cannot exceed ${MAX_PARTICIPANTS}.`,
      "participants",
    );
  }

  const hostValue =
    body.host && typeof body.host === "object" && !Array.isArray(body.host)
      ? participant(body.host, "host", "host")
      : null;
  const participants = rawParticipants.map((value, index) =>
    participant(value, index)
  );
  if (
    hostValue &&
    !participants.some(
      (item) =>
        hostValue.email && item.email && hostValue.email === item.email,
    )
  ) {
    participants.unshift(hostValue);
  }

  return {
    schemaVersion,
    provider,
    companyId: requiredText(
      body.company_id ?? body.companyId,
      "company_id",
      255,
    ),
    externalCallId: requiredText(
      body.external_call_id ?? body.externalCallId,
      "external_call_id",
      255,
    ),
    title: requiredText(body.title, "title", 500),
    occurredAt: occurredAt(body.occurred_at ?? body.occurredAt),
    durationSeconds: durationSeconds(
      body.duration_seconds ?? body.durationSeconds,
    ),
    recordingUrl: optionalHttpsUrl(
      body.recording_url ?? body.recordingUrl,
      "recording_url",
    ),
    shareUrl: optionalHttpsUrl(
      body.share_url ?? body.shareUrl,
      "share_url",
    ),
    host: hostValue,
    participants,
    transcript,
  };
}

export async function sha256Hex(value) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
