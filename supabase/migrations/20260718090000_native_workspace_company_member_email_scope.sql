-- A person can belong to multiple RetainOS client workspaces. Keep email
-- uniqueness inside each company rather than globally across all clients.
-- The existing canonical CSM index still prevents duplicate CSM identities
-- within one workspace, including archived records.

drop index if exists public.company_members_active_email_unique_idx;

create unique index if not exists company_members_active_company_email_unique_idx
  on public.company_members (company_id, lower(email))
  where status = 'active' and nullif(btrim(email), '') is not null;
