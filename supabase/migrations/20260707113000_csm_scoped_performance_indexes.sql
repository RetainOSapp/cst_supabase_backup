create index if not exists clients_company_primary_csm_idx
  on public.clients (company_glide_row_id, csm_team_member_id);

create index if not exists clients_company_secondary_csm_idx
  on public.clients (company_glide_row_id, csm_secondary_assignee_id);

create index if not exists client_tasks_company_assignee_due_idx
  on public.client_tasks (company_glide_row_id, assigned_to_id, task_due_date);

create index if not exists client_tasks_company_client_idx
  on public.client_tasks (company_glide_row_id, client_id);
