import { normalizeEmail } from "./contracts.mjs";

const ACTIVE_CLIENT_STATUSES = new Set([
  "front-end",
  "back-end",
  "paused",
  "suspended",
]);

function clientEmails(client) {
  return [
    client.client_email,
    client.client_email_secondary,
    client.client_email_tertiary,
  ]
    .map(normalizeEmail)
    .filter(Boolean);
}

function isActiveClient(client) {
  return (
    !client.archived_at &&
    ACTIVE_CLIENT_STATUSES.has(
      String(client.program_status_value ?? "").trim().toLowerCase(),
    )
  );
}

export function classifyCallParticipants({ participants, clients, members }) {
  const memberByEmail = new Map();
  for (const member of members ?? []) {
    const email = normalizeEmail(member.email);
    if (email && !member.archived_at && member.status !== "archived") {
      memberByEmail.set(email, member);
    }
  }

  const clientsByEmail = new Map();
  for (const client of (clients ?? []).filter(isActiveClient)) {
    for (const email of clientEmails(client)) {
      const existing = clientsByEmail.get(email) ?? [];
      existing.push(client);
      clientsByEmail.set(email, existing);
    }
  }

  const matchedClients = new Map();
  const classifiedParticipants = (participants ?? []).map((participant) => {
    const email = normalizeEmail(participant.email);
    const member = email ? memberByEmail.get(email) ?? null : null;
    const emailClients = email ? clientsByEmail.get(email) ?? [] : [];

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
      matchedBy: "participant_email",
      matchReason: "Exactly one active client matched participant email.",
      participants: classifiedParticipants,
    };
  }
  if (distinctClients.length > 1) {
    return {
      matchStatus: "ambiguous",
      processingStatus: "needs_reconciliation",
      client: null,
      matchedBy: null,
      matchReason: "Participant emails matched more than one active client.",
      participants: classifiedParticipants,
    };
  }
  return {
    matchStatus: "unmatched",
    processingStatus: "needs_reconciliation",
    client: null,
    matchedBy: null,
    matchReason: "No active client matched participant email.",
    participants: classifiedParticipants,
  };
}
