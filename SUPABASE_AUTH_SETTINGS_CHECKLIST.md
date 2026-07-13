# Supabase Auth Settings Checklist

Security rollout companion for `SECURITY_PERFORMANCE_AUDIT.md`.

These settings are managed in the Supabase dashboard, not by the app code in this
repo. Apply first in a staging/control window when available, then production
after login smoke QA is ready.

## Required Settings

- Enable leaked-password protection / HaveIBeenPwned password checks.
- Set a minimum password strength policy even though RetainOS primarily uses OTP.
- Review OTP expiry and resend limits; keep them short enough to limit replay but
  long enough for email delivery latency.
- Confirm email OTP remains enabled for RetainOS users.
- Confirm `prepare-login`, `zapier-create-client`, `ingest-client-call-summary`,
  and `webhook-update-client` remain deployed with JWT verification disabled.
  These are intentionally public entry points and enforce their own access rules.
- Review Auth database connection setting and move away from a fixed low absolute
  cap if Supabase exposes the percentage-based setting for this project tier.

## Smoke QA After Changes

- SuperAdmin can request OTP and log in.
- Director, CSM, and Support users can request OTP and log in.
- An unknown email receives the generic login/prep behavior and does not reveal
  whether the address exists in RetainOS.
- Existing MM webhooks continue to work after Auth setting changes.

## Rollback

- If legitimate users cannot log in, revert only the Auth setting changed last
  and retest OTP delivery.
- Do not re-enable broad database grants or weaken RLS as an Auth rollback.
