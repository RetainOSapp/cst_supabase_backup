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

## Production Checkpoint - 2026-07-13

- Secure email change remains enabled.
- Secure password change is enabled.
- Require-current-password remains disabled because RetainOS is OTP-first and
  users may not have a password to supply.
- Leaked-password protection is enabled.
- Minimum password length is 12 with the strongest available uppercase,
  lowercase, number, and symbol requirements.
- Email OTP expiry remains 3,600 seconds and OTP length remains 8 digits.
- CAPTCHA remains disabled until a supported provider is configured in the
  RetainOS frontend; enabling the dashboard toggle alone would break login.
- Jay saved the settings, logged out, requested a fresh login, and completed
  login successfully. Production SuperAdmin OTP access is QA-approved.
- Auth database connection allocation now uses 17% instead of a fixed 10
  connections. On the current 60-connection instance this preserves the same
  10-connection Auth capacity while allowing it to scale with compute size.
- Jay saved the allocation change, logged out, and completed another fresh OTP
  login successfully. The Auth settings and performance gates are closed.

## Rollback

- If legitimate users cannot log in, revert only the Auth setting changed last
  and retest OTP delivery.
- Do not re-enable broad database grants or weaken RLS as an Auth rollback.
