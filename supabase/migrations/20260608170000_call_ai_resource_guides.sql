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
) values
  (
    'call-ai-transcript-webhook',
    'Submit transcripts to Call AI',
    'guide',
    'Provider-agnostic setup guide for sending Fathom, Otter, Grain, Zapier, n8n, Make, or other transcript payloads into RetainOS.',
    'This dynamic guide shows the selected company ID, a future RetainOS endpoint placeholder, and the JSON payload shape for transcript ingestion.',
    null,
    'published',
    true,
    'call_transcript_webhook',
    70
  ),
  (
    'client-call-summary-webhook',
    'Update client notes from a call summary',
    'guide',
    'Provider-agnostic setup guide for sending call summaries or next steps into a specific RetainOS client profile.',
    'This dynamic guide shows the selected company ID, a future RetainOS endpoint placeholder, and the JSON payload shape for client notes or next steps updates.',
    null,
    'published',
    true,
    'client_call_summary_webhook',
    80
  )
on conflict (slug) do update set
  title = excluded.title,
  type = excluded.type,
  description = excluded.description,
  content = case
    when public.resources.content = '' then excluded.content
    else public.resources.content
  end,
  loom_embed_url = coalesce(public.resources.loom_embed_url, excluded.loom_embed_url),
  status = case
    when public.resources.slug in (
      'call-ai-transcript-webhook',
      'client-call-summary-webhook'
    ) then 'published'
    else public.resources.status
  end,
  is_dynamic = excluded.is_dynamic,
  dynamic_key = excluded.dynamic_key,
  sort_order = excluded.sort_order,
  updated_at = now();
