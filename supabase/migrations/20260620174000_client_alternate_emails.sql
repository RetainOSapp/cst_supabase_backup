-- Support up to three email addresses per app-owned client so integrations
-- can match clients who use personal, business, or alternate call emails.

alter table public.clients
  add column if not exists client_email_secondary text,
  add column if not exists client_email_tertiary text;

create index if not exists clients_client_email_secondary_lower_idx
  on public.clients (lower(client_email_secondary))
  where client_email_secondary is not null;

create index if not exists clients_client_email_tertiary_lower_idx
  on public.clients (lower(client_email_tertiary))
  where client_email_tertiary is not null;
