-- RetainOS may need to retire obsolete Glide-mirror workspaces without
-- mutating the read-only backup_* source tables.

create table if not exists public.company_mirror_visibility_overrides (
  legacy_glide_row_id text primary key,
  visibility text not null check (visibility in ('hidden', 'archived')),
  reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists company_mirror_visibility_overrides_set_updated_at
  on public.company_mirror_visibility_overrides;
create trigger company_mirror_visibility_overrides_set_updated_at
before update on public.company_mirror_visibility_overrides
for each row execute function public.set_updated_at();

alter table public.company_mirror_visibility_overrides enable row level security;

drop policy if exists "company_mirror_visibility_overrides_authenticated_read"
  on public.company_mirror_visibility_overrides;
create policy "company_mirror_visibility_overrides_authenticated_read"
on public.company_mirror_visibility_overrides
for select to authenticated
using (true);
