-- Add migrated/archived milestone edge-case guidance after QA on the Dashboard
-- milestone breakdown chart.

update public.resources
set
  content = replace(
    content,
    '- Clients without a current milestone can appear as Unassigned / Not set depending on the data available.',
    '- Clients without a current milestone appear as No current milestone.
- Archived milestones can still appear if clients are currently assigned to them; RetainOS labels them as Archived so the team can clean up the assignment.
- Missing legacy milestone references appear as Unknown milestone with a shortened ID so Admins can identify data cleanup needs without exposing raw IDs as the main label.'
  ),
  updated_at = now()
where slug = 'milestone-progress-breakdown-by-offer';
