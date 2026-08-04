import { normalizeEmail } from "./contracts.mjs";

const ACTIVE_CLIENT_STATUSES = new Set([
  "front-end",
  "back-end",
  "paused",
  "suspended",
]);
const OFFBOARDED_CLIENT_STATUSES = new Set(["off-boarded", "offboarded"]);

function clientEmails(client) {
  return [
    client.client_email,
    client.client_email_secondary,
    client.client_email_tertiary,
  ]
    .map(normalizeEmail)
    .filter(Boolean);
}

function normalizedClientStatus(client) {
  return String(client.program_status_value ?? "").trim().toLowerCase();
}

function clientsByEmailForStatus(clients, statuses) {
  const result = new Map();
  for (const client of clients ?? []) {
    if (client.archived_at || !statuses.has(normalizedClientStatus(client))) {
      continue;
    }
    for (const email of clientEmails(client)) {
      const existing = result.get(email) ?? [];
      existing.push(client);
      result.set(email, existing);
    }
  }
  return result;
}

export function classifyCallParticipants({ participants, clients, members }) {
  const memberByEmail = new Map();
  for (const member of members ?? []) {
    const email = normalizeEmail(member.email);
    if (email && !member.archived_at && member.status !== "archived") {
      memberByEmail.set(email, member);
    }
  }

  const activeClientsByEmail = clientsByEmailForStatus(
    clients,
    ACTIVE_CLIENT_STATUSES,
  );
  const offboardedClientsByEmail = clientsByEmailForStatus(
    clients,
    OFFBOARDED_CLIENT_STATUSES,
  );
  const participantEmails = (participants ?? [])
    .map((participant) => normalizeEmail(participant.email))
    .filter(Boolean);
  const activeMatches = new Map();
  const offboardedMatches = new Map();
  for (const email of participantEmails) {
    for (const client of activeClientsByEmail.get(email) ?? []) {
      activeMatches.set(String(client.id), client);
    }
    for (const client of offboardedClientsByEmail.get(email) ?? []) {
      offboardedMatches.set(String(client.id), client);
    }
  }
  const usesOffboardedFallback = activeMatches.size === 0;
  const selectedClientsByEmail = usesOffboardedFallback
    ? offboardedClientsByEmail
    : activeClientsByEmail;

  const matchedClients = new Map();
  const classifiedParticipants = (participants ?? []).map((participant) => {
    const email = normalizeEmail(participant.email);
    const member = email ? memberByEmail.get(email) ?? null : null;
    const emailClients = email ? selectedClientsByEmail.get(email) ?? [] : [];

    for (const client of emailClients) {
      matchedClients.set(String(client.id), client);
    }

    const uniqueClient =
      emailClients.length === 1 ? emailClients[0] : null;
    return {
      ...participant,
      email,
      participantKind: member
        ? "internal"
        : participant.is_external === false
          ? "internal"
          : participant.is_external === true
            ? "external"
            : "unknown",
      matchedMemberId: member?.id ?? null,
      matchedClientId: uniqueClient?.id ?? null,
    };
  });

  const distinctClients = [...matchedClients.values()];
  if (distinctClients.length === 1) {
    return {
      matchStatus: "matched",
      processingStatus: "queued",
      client: distinctClients[0],
      matchedBy: usesOffboardedFallback
        ? "participant_email_offboarded"
        : "participant_email",
      matchReason: usesOffboardedFallback
        ? "Exactly one offboarded client matched participant email after no active client matched."
        : "Exactly one active client matched participant email.",
      participants: classifiedParticipants,
    };
  }
  if (distinctClients.length > 1) {
    return {
      matchStatus: "ambiguous",
      processingStatus: "needs_reconciliation",
      client: null,
      matchedBy: null,
      matchReason: usesOffboardedFallback
        ? "Participant emails matched more than one offboarded client after no active client matched."
        : "Participant emails matched more than one active client.",
      participants: classifiedParticipants,
    };
  }
  return {
    matchStatus: "unmatched",
    processingStatus: "needs_reconciliation",
    client: null,
    matchedBy: null,
    matchReason:
      "No active or uniquely identifiable offboarded client matched participant email.",
    participants: classifiedParticipants,
  };
}
