import assert from "node:assert/strict";
import test from "node:test";
import { compareOfferMilestones } from "../src/lib/milestoneOrdering.ts";

function orderedIds(rows) {
  return rows.toSorted(compareOfferMilestones).map((row) => row.id);
}

test("configured position remains the primary milestone order", () => {
  assert.deepEqual(
    orderedIds([
      { id: "later", position: 20, target_days_to_complete: 1 },
      { id: "first", position: 10, target_days_to_complete: 90 },
    ]),
    ["first", "later"],
  );
});

test("target days resolves tied legacy positions", () => {
  assert.deepEqual(
    orderedIds([
      { id: "day-60", order: 0, target_days_to_complete_from_onboarding_date: 60 },
      { id: "day-14", order: 0, target_days_to_complete_from_onboarding_date: 14 },
      { id: "no-target", order: 0, target_days_to_complete_from_onboarding_date: null },
    ]),
    ["day-14", "day-60", "no-target"],
  );
});

test("name and stable id make fully tied rows deterministic", () => {
  assert.deepEqual(
    orderedIds([
      { id: "z-id", order: 0, target_days_to_complete: 30, name: "Review" },
      { id: "a-id", order: 0, target_days_to_complete: 30, name: "review" },
      { id: "kickoff", order: 0, target_days_to_complete: 30, name: "Kickoff" },
    ]),
    ["kickoff", "a-id", "z-id"],
  );
});
