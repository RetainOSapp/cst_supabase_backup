insert into public.resources (
  slug,
  title,
  type,
  description,
  content,
  status,
  is_dynamic,
  dynamic_key,
  sort_order,
  scope,
  company_legacy_id
)
values (
  'course-completion-webhook',
  'Track course completion through webhook',
  'guide',
  'Setup guide for sending LMS course-completion events into RetainOS. This is a planning guide until the endpoint is activated.',
  'Use this guide to map LMS completion events into RetainOS. The endpoint is not live yet.',
  'published',
  true,
  'course_completion_webhook',
  45,
  'retainos_help',
  null
)
on conflict (slug) do update
set
  title = excluded.title,
  type = excluded.type,
  description = excluded.description,
  content = excluded.content,
  status = excluded.status,
  is_dynamic = excluded.is_dynamic,
  dynamic_key = excluded.dynamic_key,
  sort_order = excluded.sort_order,
  scope = excluded.scope,
  company_legacy_id = excluded.company_legacy_id;
