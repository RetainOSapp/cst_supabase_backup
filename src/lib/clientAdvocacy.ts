export type AdvocacyType = "review" | "testimonial" | "referral" | "renewal_upsell";
export type AdvocacyAction = "asked" | "received";

export interface AdvocacyDefinition {
  type: AdvocacyType;
  label: string;
  shortLabel: string;
}

export interface AdvocacyDraft {
  asked: number;
  received: number;
  notes: string;
}

export interface AdvocacySummary {
  status: "not_asked" | "asked" | "received";
  askedCount: number;
  receivedCount: number;
  lastAskedAt: string | null;
  lastReceivedAt: string | null;
  lastNote: string | null;
}

export interface AdvocacyEventDraft {
  advocacyType: AdvocacyType;
  action: AdvocacyAction;
  notes?: string;
}

export const advocacyDefinitions: AdvocacyDefinition[] = [
  { type: "review", label: "Review", shortLabel: "Review" },
  { type: "testimonial", label: "Testimonial", shortLabel: "Testimonial" },
  { type: "referral", label: "Referral", shortLabel: "Referral" },
  { type: "renewal_upsell", label: "Renewal / Upsell", shortLabel: "Renewal" },
];

export const emptyAdvocacyDrafts = (): Record<AdvocacyType, AdvocacyDraft> => ({
  review: { asked: 0, received: 0, notes: "" },
  testimonial: { asked: 0, received: 0, notes: "" },
  referral: { asked: 0, received: 0, notes: "" },
  renewal_upsell: { asked: 0, received: 0, notes: "" },
});

const advocacyColumnPrefixes: Record<AdvocacyType, string> = {
  review: "advocacy_review",
  testimonial: "advocacy_testimonial",
  referral: "advocacy_referral",
  renewal_upsell: "advocacy_renewal_upsell",
};

function numberFrom(value: unknown) {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
}

function textFrom(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function advocacySummaryFromClient(
  client: Record<string, unknown>,
  type: AdvocacyType,
): AdvocacySummary {
  const prefix = advocacyColumnPrefixes[type];
  const askedCount = numberFrom(client[`${prefix}_asked_count`]);
  const receivedCount = numberFrom(client[`${prefix}_received_count`]);
  const rawStatus = textFrom(client[`${prefix}_status`]);
  const status =
    rawStatus === "received" || rawStatus === "asked" || rawStatus === "not_asked"
      ? rawStatus
      : receivedCount > 0
        ? "received"
        : askedCount > 0
          ? "asked"
          : "not_asked";

  return {
    status,
    askedCount,
    receivedCount,
    lastAskedAt: textFrom(client[`${prefix}_last_asked_at`]),
    lastReceivedAt: textFrom(client[`${prefix}_last_received_at`]),
    lastNote: textFrom(client[`${prefix}_last_note`]),
  };
}

export function buildAdvocacyEventDrafts(
  drafts: Record<AdvocacyType, AdvocacyDraft>,
): AdvocacyEventDraft[] {
  const events: AdvocacyEventDraft[] = [];

  for (const definition of advocacyDefinitions) {
    const draft = drafts[definition.type];
    const notes = draft.notes.trim() || undefined;
    for (let index = 0; index < draft.asked; index += 1) {
      events.push({ advocacyType: definition.type, action: "asked", notes });
    }
    for (let index = 0; index < draft.received; index += 1) {
      events.push({ advocacyType: definition.type, action: "received", notes });
    }
  }

  return events;
}
