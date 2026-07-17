export type MilestoneOrderingFields = {
  id?: unknown;
  glide_row_id?: unknown;
  name?: unknown;
  order?: unknown;
  position?: unknown;
  target_days_to_complete?: unknown;
  target_days_to_complete_from_onboarding_date?: unknown;
};

function finiteNumber(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return Number.MAX_SAFE_INTEGER;
  }

  const number = Number(value);
  return Number.isFinite(number) ? number : Number.MAX_SAFE_INTEGER;
}

function textKey(value: unknown) {
  const text = String(value ?? "").trim().toLocaleLowerCase("en-US");
  return text || "\uffff";
}

function compareNumber(left: number, right: number) {
  if (left === right) return 0;
  return left < right ? -1 : 1;
}

function compareText(left: string, right: string) {
  if (left === right) return 0;
  return left < right ? -1 : 1;
}

export function compareOfferMilestones(
  left: MilestoneOrderingFields,
  right: MilestoneOrderingFields,
) {
  const positionComparison = compareNumber(
    finiteNumber(left.position ?? left.order),
    finiteNumber(right.position ?? right.order),
  );
  if (positionComparison !== 0) return positionComparison;

  const targetDaysComparison = compareNumber(
    finiteNumber(
      left.target_days_to_complete ??
        left.target_days_to_complete_from_onboarding_date,
    ),
    finiteNumber(
      right.target_days_to_complete ??
        right.target_days_to_complete_from_onboarding_date,
    ),
  );
  if (targetDaysComparison !== 0) return targetDaysComparison;

  const nameComparison = compareText(textKey(left.name), textKey(right.name));
  if (nameComparison !== 0) return nameComparison;

  return compareText(
    textKey(left.glide_row_id ?? left.id),
    textKey(right.glide_row_id ?? right.id),
  );
}
