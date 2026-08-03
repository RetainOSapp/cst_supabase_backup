import assert from "node:assert/strict";

import {
  calendarDateKey,
  formatCalendarDate,
} from "../src/lib/calendarDate.ts";

assert.equal(
  calendarDateKey("2026-09-03T00:00:00.000Z"),
  "2026-09-03",
);
assert.equal(
  formatCalendarDate("2026-09-03T00:00:00.000Z", "en-US"),
  "Sep 3, 2026",
);
assert.equal(
  formatCalendarDate("2026-03-02T00:00:00.000Z", "en-US"),
  "Mar 2, 2026",
);
assert.equal(formatCalendarDate(null, "en-US"), "--");

console.log("Calendar-date timezone regression checks passed.");
