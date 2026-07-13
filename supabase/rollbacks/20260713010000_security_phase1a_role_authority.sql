-- Roll back only the additive Phase 1A role-authority foundation.
-- No table policy is restored because Phase 1A does not change table policies.

delete from public.security_rollout_history
where version = '20260713010000';

drop function if exists public.resolve_current_account();
drop function if exists public.can_read_mirror_client(text, text);
drop function if exists public.can_read_app_client_legacy(uuid, text);
drop function if exists public.can_read_app_client(uuid);
drop function if exists public.can_read_mirror_company(text);
drop function if exists public.can_read_app_company(uuid);
drop function if exists public.current_actor_mirror_scope();
drop function if exists public.current_actor_app_scope();
drop function if exists public.is_retainos_super_admin_bound();

drop index if exists public.security_phase1a_backup_clients_secondary_csm_idx;
drop index if exists public.security_phase1a_backup_clients_primary_csm_idx;
drop index if exists public.security_phase1a_backup_clients_company_client_idx;
drop index if exists public.security_phase1a_backup_team_actor_idx;

notify pgrst, 'reload schema';
