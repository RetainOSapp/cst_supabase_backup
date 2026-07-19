-- Private DFY workspace setup needs staff to be assignable before they are
-- given RetainOS access. A pending member is intentionally excluded from all
-- existing authorization and login checks, which already require status=active.

alter table public.company_members
  drop constraint if exists company_members_status_check;

alter table public.company_members
  add constraint company_members_status_check
  check (status in ('active', 'pending', 'archived'));

drop index if exists public.company_members_active_company_email_unique_idx;

create unique index if not exists company_members_current_company_email_unique_idx
  on public.company_members (company_id, lower(email))
  where status in ('active', 'pending')
    and nullif(btrim(email), '') is not null;
