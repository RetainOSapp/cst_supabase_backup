-- PRE-TRAFFIC / DISPOSABLE-ENVIRONMENT rollback only.
-- After any real transcript is ingested, use the operational pause/revoke
-- procedure in CALL_INTELLIGENCE_V1_PLAN.md and preserve evidence.

drop function if exists public.finalize_call_intelligence_run(
  uuid, boolean, text, jsonb, text, text, integer, integer, integer, integer,
  bigint, integer, text, boolean
);
drop function if exists public.mark_call_intelligence_run_dispatched(uuid);
drop function if exists public.claim_call_intelligence_run(
  uuid, text, text, bigint
);
drop function if exists public.can_read_call_intelligence_call(uuid, uuid, text);

drop table if exists public.call_intelligence_usage_events;
drop table if exists public.call_intelligence_runs;
drop table if exists public.call_intelligence_prompt_definitions;
drop table if exists public.call_intelligence_participants;
drop table if exists public.call_intelligence_transcripts;
drop table if exists public.call_intelligence_calls;
