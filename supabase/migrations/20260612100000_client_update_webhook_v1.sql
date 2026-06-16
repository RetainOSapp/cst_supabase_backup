-- Client Update Webhook V1.
-- Allows webhook update history events. Company-scoped auth uses the shared
-- company_integration_secrets table from 20260612110000_company_integration_secrets.sql.

alter table public.client_history_events
  drop constraint if exists client_history_events_event_type_check;

alter table public.client_history_events
  add constraint client_history_events_event_type_check
  check (
    event_type in (
      'quick_update',
      'profile_update',
      'client_created',
      'client_offboarded',
      'task_created',
      'contract_created',
      'contract_updated',
      'contract_archived',
      'client_status_changed',
      'client_milestone_started',
      'client_milestone_completed',
      'client_pathway_changed',
      'client_retention_recorded',
      'client_outcomes_updated',
      'call_summary_webhook',
      'client_update_webhook'
    )
  );

insert into public.resources (
  slug,
  title,
  type,
  description,
  content,
  loom_embed_url,
  status,
  is_dynamic,
  dynamic_key,
  sort_order
) values (
  'client-update-webhook',
  'Update existing clients from a webhook',
  'guide',
  'Provider-agnostic setup guide for updating app-owned client fields from Zapier, n8n, Make, CRM, LMS, or other automation tools.',
  'Endpoint: /functions/v1/webhook-update-client. Use a company-specific company_integration_secrets token for integration_type client_update. Required payload fields are company_id plus exact client_email, or app-owned client_id when safe. V1 supports next_steps, notes, last_contact, next_contact, offer_id, assigned_to, and active company custom_fields. Status/program changes are intentionally rejected in V1. Unmatched or ambiguous requests go to the integration review queue instead of writing to a client.',
  null,
  'published',
  true,
  'client_update_webhook',
  90
)
on conflict (slug) do update set
  title = excluded.title,
  type = excluded.type,
  description = excluded.description,
  content = excluded.content,
  loom_embed_url = coalesce(public.resources.loom_embed_url, excluded.loom_embed_url),
  status = 'published',
  is_dynamic = excluded.is_dynamic,
  dynamic_key = excluded.dynamic_key,
  sort_order = excluded.sort_order,
  updated_at = now();
