-- Allow authenticated app users to read pilot/migrated app-owned company data.
-- Writes remain blocked and will be introduced through controlled server paths.

drop policy if exists "companies_authenticated_read" on public.companies;
create policy "companies_authenticated_read"
on public.companies for select
to authenticated
using (true);

drop policy if exists "company_members_authenticated_read" on public.company_members;
create policy "company_members_authenticated_read"
on public.company_members for select
to authenticated
using (true);

drop policy if exists "app_audit_events_authenticated_read" on public.app_audit_events;
create policy "app_audit_events_authenticated_read"
on public.app_audit_events for select
to authenticated
using (true);
