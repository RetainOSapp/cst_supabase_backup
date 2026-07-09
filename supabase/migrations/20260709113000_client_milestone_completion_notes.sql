-- Store completion notes directly on milestone progress rows so completed
-- milestones can be corrected without replaying the completion action.

alter table public.client_milestones
  add column if not exists notes text;

with latest_completion_note as (
  select distinct on (che.payload->'progress'->>'glide_row_id')
    che.payload->'progress'->>'glide_row_id' as progress_glide_row_id,
    che.notes
  from public.client_history_events che
  where che.source = 'client_milestone'
    and che.event_type = 'client_milestone_completed'
    and che.notes is not null
    and nullif(che.payload->'progress'->>'glide_row_id', '') is not null
  order by che.payload->'progress'->>'glide_row_id', che.created_at desc
)
update public.client_milestones cm
set notes = latest_completion_note.notes
from latest_completion_note
where cm.glide_row_id = latest_completion_note.progress_glide_row_id
  and cm.notes is null;
