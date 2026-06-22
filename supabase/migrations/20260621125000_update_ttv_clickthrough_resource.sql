-- Add Dashboard clickthrough guidance for the TTV metric.

update public.resources
set
  content = replace(
    content,
    '- The card also shows how many clients reached TTV and how many TTV points are configured in the current filter context.',
    '- The card also shows how many clients reached TTV and how many TTV points are configured in the current filter context.
- Click Reached to open the clients who reached the configured TTV milestone.
- Click TTV Points to review the configured Time to Value milestones behind the current filters.'
  ),
  updated_at = now()
where slug = 'tracking-time-to-value';
