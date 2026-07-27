# Moves Method bounded Pipeline rollout QA

Status: ready for Jay's production QA. This is a real-data, controlled first
cohort—not mock data. Recurring automation remains paused.

## Expected starting state

- Use the live RetainOS production URL as a SuperAdmin and switch to Moves Method.
- Pipeline should open normally and the Renewal board should have **0 visible
  cards**. The five old video-demo cards were audited and archived.
- In **Admin Hub → Pipelines**, Automation status should report:
  - Global: **Paused**
  - Company: **Paused**
  - Pipeline: **Paused**
  - Scheduler: **Registered**
- These status facts are read-only. They do not enable an automation.

## Safe preview QA

1. Open **Pipeline** for Moves Method.
2. Keep the default bounded cohort:
   - Renewal from: today
   - Renewal through: seven days from today
   - Maximum items: **10**
3. Click **Preview renewal cohort**.
4. Confirm:
   - the page says no records were changed;
   - the full eligible count may be greater than 10;
   - **selected for this run** is at most 10;
   - selected client names and renewal dates are visible;
   - exclusion counts are available;
   - the board still has 0 cards.
5. Change the maximum to 5. The preview must disappear and **Run one-time
   scan** must become disabled.
6. Restore the maximum to 10 and preview again.

Previewing is safe and non-writing. Stop and report the visible error if the
selected names or dates look implausible.

## First real cohort

1. Review all selected names before proceeding.
2. Click **Run one-time scan** once.
3. The confirmation must repeat the exact selected count, cap, and dates and
   state that recurring automation and schedules remain unchanged.
4. Accept the confirmation.
5. Confirm the completion banner reports the expected created/skipped counts.
6. The workspace should refresh automatically and show the new real renewal
   cards in the configured Open entry stage.
7. Open two cards and verify the client, renewal date, projected value/currency,
   drawer actions, and stage are sensible.
8. Refresh the browser once; the same cards should remain without duplicates.

**Stop after this first run.** A new preview in the same date range can
legitimately select the next untracked eligible contracts, so it is not an
idempotency test and should not be run a second time during this QA.

## Director access

After SuperAdmin QA, one MM Director may verify:

- Pipeline appears in navigation.
- The same real cards and filters are visible.
- Preview is available.
- **Run one-time scan** is not available.
- Admin automation status is read-only.

Support, CSM, and Viewer access remain disabled for Moves Method.

## What remains deliberately off

- recurring renewal materialization;
- first-backfill enrollment;
- broad 691-card population;
- automatic stage tasks and offboarding synchronization unless separately
  enabled in the existing MM pipeline configuration;
- Sales Kick or Ethical Scaling cohort rollout.

Record the preview selected count, created/skipped banner, two spot-checked
clients, and Director-access result. Those results are the approval gate for
enabling a recurring daily renewal cohort.
