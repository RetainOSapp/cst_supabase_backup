-- Integration Review Queue actions.
-- Adds an ignored terminal state so operators can clear malformed or irrelevant
-- webhook events without marking them as successfully processed.

alter table public.integration_intake_events
  drop constraint if exists integration_intake_events_status_check;

alter table public.integration_intake_events
  add constraint integration_intake_events_status_check
  check (status in ('received', 'processed', 'needs_review', 'failed', 'ignored'));
