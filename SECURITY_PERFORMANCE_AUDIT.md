# RetainOS — Security, Exploit, Performance & Refactoring Audit

**Date:** 2026-07-05
**Scope:** Frontend (React/Vite), backend (Supabase Edge Functions), database
(Postgres/RLS), build/deploy config. UI/UX explicitly out of scope.
**Status of findings:** Items marked **[VERIFIED]** were confirmed against the
live Supabase project `zjauqflzxzsbpnivzsct` (RLS policies, function definitions,
grants) or the built `dist/` bundle. Do not commit this file's remediations to
`main` without staging — Vercel deploys `main` live.

---

## 0. TL;DR — the three things to fix today

1. **`public.exec_sql(text)` is an anonymous full-database backdoor.** It is
   `SECURITY DEFINER`, has no `search_path`, runs arbitrary SQL, and **`EXECUTE`
   is granted to `anon`**. Anyone on the internet holding the public anon key
   (which is, by design, shipped in the JS bundle) can `POST /rest/v1/rpc/exec_sql`
   and run `DROP`/`SELECT`/`UPDATE` anything — read every secret, exfiltrate all
   client data, disable RLS, mint admin users. This is total compromise. **[VERIFIED]**
2. **Cross-tenant data breach via RLS.** Every core table (`clients`,
   `companies`, `company_members`, `client_contracts`, `client_history_events`,
   `client_tasks`, `integration_intake_events`) has a SELECT policy
   `USING (true)` for role `authenticated`. Any logged-in user of **any** company
   can read **every** other company's full roster, contracts, revenue, and team
   with a direct PostgREST call. The client-side company scoping is cosmetic. **[VERIFIED]**
3. **Four tables have RLS disabled but full anon grants.** `client_links`,
   `client_advocacy_events`, `glide_companies`, `glide_rows` grant
   `SELECT/INSERT/UPDATE/DELETE/TRUNCATE` to `anon`. With RLS off, an
   **unauthenticated** attacker can read, tamper, or `TRUNCATE` these tables
   over REST. `client_links` holds per-client Slack/folder/resource URLs across
   all companies. **[VERIFIED]**

A fourth, equally severe one surfaced in the Edge Functions:

4. **`sync-glide-table` is fully unauthenticated and writes any table with the
   service role.** No JWT, no shared secret — it upserts into a caller-chosen
   `targetTable`/columns straight from the request body, running as service_role
   (RLS bypassed). Any anonymous caller can overwrite rows in any table
   (`company_members`, `company_integration_secrets`, …). **[VERIFIED]**

Everything below expands on these and adds the rest.

---

## 1. Cybersecurity & exploit risks

### CRITICAL

#### C1 — `exec_sql` anonymous RCE-on-database **[VERIFIED]**
```
CREATE OR REPLACE FUNCTION public.exec_sql(sql text)
  RETURNS void LANGUAGE plpgsql SECURITY DEFINER
AS $$ BEGIN EXECUTE sql; END; $$;   -- no search_path; EXECUTE granted to anon, authenticated
```
- **Impact:** Arbitrary SQL as the function owner (superuser-equivalent) from the
  public API. Full read/write/drop of all data, auth schema, and secrets.
- **Why it exists:** used legitimately by `scripts/apply-sql-file.mjs` and
  `sync-glide` — but those run with the **service_role** key, which does not need
  the grant to `anon`/`authenticated`.
- **Fix:**
  ```sql
  REVOKE ALL ON FUNCTION public.exec_sql(text) FROM anon, authenticated, public;
  -- service_role retains access implicitly; if not, GRANT EXECUTE ... TO service_role;
  ALTER FUNCTION public.exec_sql(text) SET search_path = '';
  ```
  Better: delete `exec_sql` entirely and have `apply-sql-file.mjs` run DDL via a
  direct Postgres connection (`psql`/`pg` with the DB password), never over
  PostgREST. Keep raw SQL execution off the API surface permanently.

#### C2 — Cross-tenant read via permissive RLS **[VERIFIED]**
- Policy set per table: `*_no_anon_access` = `ALL USING(false)` (blocks anon +
  blocks authenticated writes) **plus** `*_authenticated_read` = `SELECT USING(true)`.
  Because permissive SELECT policies are OR'd, authenticated users read **all rows**.
- **Impact:** Any user from Company A reads Company B's clients, contract values,
  churn reasons, history, tasks, and team roster via
  `GET /rest/v1/clients?select=*`. This is the whole tenant model defeated.
- **Fix:** Replace `USING (true)` with a company-membership check. Introduce a
  helper and use it in every read policy:
  ```sql
  CREATE OR REPLACE FUNCTION public.current_member_company_ids()
  RETURNS setof uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
    SELECT company_id FROM public.company_members
    WHERE auth_user_id = auth.uid() AND status = 'active';
  $$;

  DROP POLICY clients_authenticated_read ON public.clients;
  CREATE POLICY clients_tenant_read ON public.clients FOR SELECT TO authenticated
    USING (company_id IN (SELECT public.current_member_company_ids()));
  ```
  Repeat for `companies`, `company_members`, `client_contracts`,
  `client_history_events`, `client_tasks`, `integration_intake_events`. Handle
  super-admins by allowlisting their `auth.uid()` in a `super_admins` table
  (NOT a client-side email list — see C4). Wrap `auth.uid()` calls in
  `(select auth.uid())` so the planner evaluates them once per query (also fixes
  the `auth_rls_initplan` performance class).

#### C3 — RLS-disabled tables with anon write/TRUNCATE grants **[VERIFIED]**
- `client_links`, `client_advocacy_events`, `glide_companies`, `glide_rows`:
  RLS off, `anon` + `authenticated` hold full DML incl. `TRUNCATE`.
- **Impact:** Unauthenticated read of cross-tenant client link data; anyone can
  wipe or poison the Glide mirror and advocacy history.
- **Fix:**
  ```sql
  ALTER TABLE public.client_links ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public.client_advocacy_events ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public.glide_companies ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public.glide_rows ENABLE ROW LEVEL SECURITY;
  REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON
    public.client_links, public.client_advocacy_events,
    public.glide_companies, public.glide_rows FROM anon, authenticated;
  ```
  Then add tenant-scoped SELECT policies (client_links / advocacy) and
  service-role-only access for the glide mirror tables. Note: the audit found the
  **entire `public` schema** grants full DML to `anon`/`authenticated` by default
  on these tables — audit `information_schema.role_table_grants` for every table
  and revoke write grants globally; writes should only happen through
  service-role Edge Functions.

#### C4 — Client-side privilege model / `_set_chain_secret` anon access **[VERIFIED]**
- Super-admin is decided in the browser from `VITE_SUPER_ADMIN_EMAILS`
  (`src/lib/accountContext.tsx:252`). The email is trustworthy (from the session),
  but the *authority* is only real if the DB enforces it — and today it does not
  (C2). Anyone authenticated already has super-admin-level read.
- `public._set_chain_secret(text)` (`SECURITY DEFINER`, writes the vault
  service-role key used by cron→sync-glide) is **executable by anon**. An attacker
  can overwrite the cron service key. **[VERIFIED]**
- Also anon-executable: `_glide_chain_tick`, `generate_company_notifications`,
  `get_table_row_estimate`, `seed_default_notification_preferences`.
- **Fix:** Move super-admin identity into a DB table checked by RLS. `REVOKE
  EXECUTE ... FROM anon, authenticated` on all internal/cron `SECURITY DEFINER`
  functions; keep only the ones intentionally public. Set `search_path=''` on all
  of them (the `function_search_path_mutable` warnings).

#### C5 — `sync-glide-table` unauthenticated service-role table write **[VERIFIED]**
- File `supabase/functions/sync-glide-table/index.ts:79-126`. Unlike `sync-glide`
  (which checks the bearer at ~line 1021), this function performs **no auth of any
  kind** and upserts into `targetTable` / `targetPrimaryKeyColumn` /
  `targetDataColumn` taken directly from the request body, using the service-role
  client (RLS bypassed).
- **Impact:** Any anonymous internet caller can insert/overwrite rows in
  effectively any table — e.g. escalate themselves in `company_members`, plant a
  known token hash in `company_integration_secrets`, corrupt `clients`.
- **Fix:** Require the service-role bearer (or a dedicated shared secret) as
  `sync-glide` does, and hard allow-list `targetTable` + column names. If this
  function is not actually invoked by anything, delete it and redeploy.

#### C6 — `sync-glide` DDL/SQL injection via `exec_sql` **[VERIFIED]**
- File `supabase/functions/sync-glide/index.ts:270,278,283,287`. `ensureBackupTable`
  builds raw DDL by string-interpolating a Glide-derived table name and column
  names, then runs it through `exec_sql`. The normalizers strip some characters
  but do not make the names safe inside the `DO $$ ... policyname='${…}' $$`
  policy body or the `CREATE/ALTER TABLE "..."` statements.
- **Impact:** Anyone who controls the Glide source schema (the sync input) can
  achieve arbitrary SQL execution as the service role. Compounds C1.
- **Fix:** Never interpolate identifiers into `exec_sql`. Use `format('%I', name)`,
  validate `backupTableName` against `^backup_[a-z0-9_]+$`, and prefer a fixed
  column allow-list. (Removing `exec_sql` from the API per C1 is the umbrella fix.)

### HIGH

#### H1 — Live Anthropic API key baked into a build artifact **[VERIFIED]**
- The real key literal (`sk-ant-api03-…`) is present in
  `dist/assets/index-RoK9ytMf.js`. Beacon calls Anthropic **directly from the
  browser** (`src/lib/beacon/chat.ts`, `dangerouslyAllowBrowser: true`) using
  `VITE_BEACON_ANTHROPIC_KEY`, which Vite inlines at build time.
- **Impact:** Any deployed build containing Beacon leaks a spendable Anthropic
  key to every visitor. `dist/` is gitignored (good) and MEMORY says Beacon is an
  uncommitted local-only pilot (so `main` builds exclude it) — but the artifact on
  disk proves a Beacon build has happened, so **rotate the key now** regardless.
- **Fix:** (a) Rotate the Anthropic key. (b) Never build Beacon with an inlined
  key — implement the documented promotion path: move the chat loop into a
  `beacon-chat` Edge Function, store `ANTHROPIC_API_KEY` as a Supabase secret,
  enforce company/role scope server-side, and gate access with a real
  `canAccessBeacon` capability. This is already the stated plan in MEMORY.md;
  it is a hard blocker for any Beacon rollout.

#### H2 — `search_client_notes` and wide reads inherit the broken RLS
- The RPC is `SECURITY INVOKER` and takes `p_company_id` as a parameter, but with
  C2 in place any authenticated caller can pass any company id and read it.
  Fixing C2 closes this; until then it is another cross-tenant path.

#### H3 — Permissive write policies flagged by advisor **[VERIFIED]**
- `glide_sync_jobs.auth_cancel_glide_sync_jobs` (UPDATE `USING true`) and
  `sync_table_list.auth_update_sync_table_list` (UPDATE `USING true` + `WITH CHECK
  true`) let any authenticated user mutate sync control rows. Scope these to
  super-admins/service-role.

#### H4 — Global webhook fallback secret: non-constant-time + company-agnostic **[VERIFIED]**
- `zapier-create-client:405`, `webhook-update-client:312`,
  `ingest-client-call-summary:246`. When a company has no per-company token, auth
  falls back to `submittedSecret === globalEnvSecret` — a plain `===` (timing
  oracle) against a **single global** secret. Any holder of that global secret can
  create/update clients for **any** tenant by changing `company_id` in the body.
  The per-company token path is correct (`timingSafeEqual` over SHA-256 hashes).
- **Fix:** Use `timingSafeEqual` for the fallback; better, retire the global
  fallback and require per-company tokens only.

#### H5 — PostgREST filter injection via unsanitized ids/emails **[VERIFIED]**
- `manage-client-task:271,487` interpolates `assignedToId` straight into a raw
  `.or(\`id.eq.${assignedToId},legacy_glide_row_id.eq.${assignedToId}\`)`. A value
  containing PostgREST filter syntax can subvert the active-member check.
- `manage-integration-review:271`, `webhook-update-client:717`,
  `ingest-client-call-summary:447` interpolate client email into `.or(...ilike...)`
  with only comma-stripping — `%`, `)`, and meta-chars pass through (info-leak/DoS;
  queries stay company-scoped so not cross-tenant write).
- **Fix:** Validate ids as UUID/known format and emails as RFC-valid before
  building filters; replace `.or(string)` with `.in()` / separate `.eq()` calls;
  escape ilike values.

#### H6 — `prepare-login` enables user enumeration + arbitrary account provisioning **[VERIFIED]**
- Public (`--no-verify-jwt`). Returns distinct "no access" vs success responses
  and an `access` tier (`prepare-login:126,144,147`), so an anonymous caller can
  enumerate which emails have access and whether they're super-admin. On success
  it calls `auth.admin.createUser` (`:132`) for attacker-supplied emails present in
  membership tables — force-provisioning auth users. No rate limiting.
- **Fix:** Uniform generic response regardless of membership; never return the
  access tier; add per-IP/email rate limiting.

**Correctly secured (verified, no action needed):** all `manage-client-*`
functions verify the JWT via `getUser(token)`, re-resolve the actor against
`company_members` for the company **derived from the client row** (never trusting
a body-supplied role/company), enforce CSM-ownership and director-only gates, and
require target `migration_status in (pilot, migrated)`. `manage-company-*`,
`manage-integration-token` (super-admin only; token hashed, returned once, never
logged), and `upload-client-image` (MIME/size validated, path sanitized) are also
sound. The systemic write path is the strong part of the app — the risk is
concentrated in the DB grants (§C1–C4), the two sync functions (C5–C6), and the
webhook fallback (H4).

### MEDIUM / LOW

- **M1 — CORS `Access-Control-Allow-Origin: *`** on every Edge Function. Lock to
  the RetainOS origin(s); `*` plus permissive methods widens CSRF-style abuse of
  any token that lives in a header a browser will replay.
- **M2 — Leaked-password protection disabled** (Supabase Auth). Enable
  HaveIBeenPwned check + minimum strength. **[VERIFIED advisor]**
- **M3 — Auth DB connections fixed at 10** (absolute, not percentage) — becomes a
  DoS/availability ceiling as you scale instance size. Switch to percentage. **[VERIFIED advisor]**
- **M4 — `legacy/` (`glide.ts`, `supabase.ts`, `sync.ts`) is committed dead code**
  and `old glide project test/` sits untracked in the tree. Not bundled (not
  imported), but remove/relocate to shrink attack surface and confusion.
- **M5 — Webhook functions persist the entire raw inbound payload** to
  `integration_intake_events.payload` / `client_history_events.payload`
  (`webhook-update-client:655,934`, `ingest-client-call-summary:406,548`). Any
  secrets/PII a sender includes are stored verbatim and re-surfaced in review UIs.
  Allow-list the fields you store.
- **M6 — `manage-resource` UPDATE is not company-scoped at the query level**
  (`manage-resource:298-304`); it relies on a preceding assert (TOCTOU). Add
  `.eq()` scope constraints to the write for defense in depth.
- **M7 — CORS `*` on JWT-authenticated functions too** (all `manage-*`,
  `upload-client-image`). CSRF risk is limited (Bearer, not cookies) but lock the
  origin anyway (same as M1).
- **L1 — `.env.graphify` holds a real Gemini key**; gitignored, fine, but treat as
  a secret and rotate if it ever touched a shared machine.
- **L2 — `sync-glide` `start_job` accepts an attacker-chosen `glideToken`** from
  the body (`:1055,1093`); low risk but lets a user drive the service-role sync
  with their own credentials.
- **L3 — Error responses echo raw DB error `details`/`hint`** (minor schema leak).
- **L4 — Several client-mutating functions look up the client by `glide_row_id`
  alone** before deriving the company (safe today because the actor is re-checked
  against the derived company) — confirm a UNIQUE constraint on `glide_row_id`.

---

## 2. Performance / load-time / speed

### P1 — Single 1.26 MB JS bundle, zero code splitting (biggest UX win) **[VERIFIED]**
- `dist/assets/index-RoK9ytMf.js` = **1,258,242 bytes** in one chunk. `App.tsx`
  statically imports all 15 pages; there is **no `React.lazy`, no `Suspense`, no
  `manualChunks`**. First paint downloads Dashboard + Clients + ClientDetail +
  the Anthropic SDK before showing anything.
- **Fix (high impact, low risk):**
  - Route-level `React.lazy()` + `<Suspense>` in `App.tsx` for every page. Each
    heavy page (ClientDetail, Clients, SaasClientDetail, Dashboard) becomes its
    own chunk loaded on navigation.
  - Split vendor chunks via Vite `build.rollupOptions.output.manualChunks`
    (react, supabase, and — once server-side — drop the Anthropic SDK from the
    client entirely).
  - Add `build.chunkSizeWarningLimit` awareness; target < 250 KB initial JS.
  - Expected: first-load JS drops well over 60–70% for the common Dashboard entry.

### P2 — `@anthropic-ai/sdk` shipped to the browser
- Large dependency bundled solely for the browser-direct Beacon call. Moving
  Beacon server-side (H1) removes it from the client bundle entirely — a security
  fix that is also a sizeable perf win.

### P3 — Unindexed foreign keys (~15) **[VERIFIED advisor]**
- Missing covering indexes on FKs including `client_contracts.company_id`,
  `client_tasks.company_id`, `company_members.auth_user_id`,
  `client_links.client_id`, `client_history_events.actor_*`,
  `client_advocacy_events.client_id`, `notifications.recipient_member_id`, etc.
- `company_members.auth_user_id` will be on the hot path for the new tenant RLS
  (C2) — index it before shipping those policies or every query pays a seq scan.
- **Fix:** add `CREATE INDEX` for each flagged FK.

### P4 — Duplicate/permissive RLS policies cost every query **[VERIFIED advisor]**
- 11 tables have "multiple permissive policies for authenticated SELECT"
  (`*_no_anon_access` + `*_authenticated_read`). Postgres evaluates both on every
  read. Consolidating to one tenant-scoped policy per action (part of C2) removes
  the double evaluation.

### P5 — Unused indexes (~18) **[VERIFIED advisor]**
- Indexes never used (e.g. `glide_rows_data_gin`, `glide_companies_data_gin`,
  several `clients_*` and `notifications_*`). GIN indexes on `glide_rows`/`glide_companies`
  are large and write-amplifying. Drop the confirmed-unused ones to speed writes
  and shrink storage (verify usage over a full business cycle first).

### P6 — Frontend query hygiene
- 25 `select('*')` reads and 36 distinct `.from()` calls in `Clients.tsx` alone.
  Select only needed columns (roster views pull far more than they render), and
  audit for N+1 patterns in ClientDetail/Dashboard where per-client follow-up
  queries could be batched or moved into a single RPC (`dashboard_kpi_counts_canonical`
  already exists — extend that approach).

---

## 3. Code optimization & refactoring

### R1 — Monster page components **[VERIFIED]**
- `ClientDetail.tsx` **7,493 lines / 275 KB**, `Clients.tsx` 5,833,
  `SaasClientDetail.tsx` 5,519, `Dashboard.tsx` 4,815. These are unmaintainable,
  slow to type-check, and defeat code-splitting granularity.
- **Fix:** extract per-tab/feature components (Program, Outcomes, Contract,
  Pathways, Tasks, History, Advocacy already exist as concepts) into their own
  files + hooks (`useClientDetail`, `useClientRosterFilters`). Target < 500 lines
  per file. This also unlocks finer lazy-loading (P1).

### R2 — No shared Edge Function auth/authz helper **[VERIFIED]**
- `supabase/functions/_shared/` contains only `deno.d.ts`. All 24 functions
  re-implement Bearer parsing, `getUser`, role checks, CORS, and JSON responses.
  Divergence here is exactly how authz bugs slip in.
- **Fix:** create `_shared/auth.ts` (`requireMember(req): {user, member, role,
  companyId}`), `_shared/http.ts` (CORS + JSON), and `_shared/validate.ts`. Every
  function calls one `requireMember` + capability check. Centralizes the fixes
  from §1 and makes future functions secure by default.

### R3 — Centralize the capability model
- `capabilitiesForRole` lives client-side only. Once super-admin + tenant checks
  move server-side (C2/C4), mirror the capability matrix in `_shared/` so the
  frontend and Edge Functions agree from one source of truth.

### R4 — Data-access layer
- Direct `supabase.from()` calls are scattered across pages (150+). Consolidate
  into typed repository functions in `src/lib/` (extend `appOwnedData.ts`) so
  column selection, filters, and the app-owned-vs-mirror branching live in one
  place — easier to optimize (P6) and to reason about what RLS must allow.

### R5 — Generate DB types
- Use `supabase gen types typescript` to replace the many hand-written row
  interfaces (e.g. in `accountContext.tsx`, `beacon/tools.ts`) with generated
  types, killing drift between schema and code.

---

## 4. Suggested execution order

**Phase 0 — Stop the bleeding (today):**
1. Revoke `exec_sql` / `_set_chain_secret` / internal-fn EXECUTE from anon+authenticated; set `search_path` (C1, C4). *(DB-only, no deploy.)*
2. **Add auth to (or delete) `sync-glide-table`** and redeploy — it is an open anonymous write endpoint (C5).
3. Rotate the Anthropic key; confirm no Beacon build is deployed (H1).
4. Enable RLS + revoke anon write grants on the four exposed tables (C3). *(DB-only.)*

**Phase 1 — Close tenant isolation (this week):**
5. Add `company_members.auth_user_id` index + FK indexes on the RLS hot path (P3).
6. Ship tenant-scoped SELECT policies replacing `USING(true)`; server-side
   super-admin table (C2, R3). Test cross-company access is denied.
7. Scope the permissive write policies (H3).
8. Fix `sync-glide` identifier interpolation (C6); validate webhook filter inputs (H5).

**Phase 2 — Harden the edges:**
9. `_shared/auth.ts` refactor; `timingSafeEqual` on the webhook fallback (or drop
   it); lock CORS; fix `prepare-login` enumeration/provisioning; allow-list stored
   payloads (H4, H6, M1, M5, M6, M7, R2).
10. Move Beacon to a `beacon-chat` Edge Function; drop Anthropic SDK from client
    (H1, P2).

**Phase 3 — Performance & maintainability:**
9. Route-level `React.lazy` + `manualChunks` (P1).
10. Break up the monster pages; add repository layer + generated types (R1, R4, R5).
11. Drop confirmed-unused indexes; column-scope queries (P5, P6).
12. Enable leaked-password protection; switch Auth to percentage connections (M2, M3).

---

## 5. Verification checklist (prove each fix)

- [x] `POST /rest/v1/rpc/exec_sql` with anon key returns 403/permission denied.
- [x] `POST /functions/v1/sync-glide-table` with no/invalid auth returns 401.
- [x] Authenticated user of Company A gets 0 rows for Company B via
      `GET /rest/v1/clients` and `/client_contracts`.
- [x] Anon `GET/DELETE /rest/v1/client_links` returns 401/permission denied.
- [x] Re-run Supabase advisors (security + performance): the ERROR-level RLS
      items and the anon-executable `SECURITY DEFINER` warnings are gone.
- [ ] No `sk-ant-` literal in any deployed bundle; Beacon works via Edge Function.
- [ ] First-load JS for `/dashboard` < 250 KB (measure in build output).

---

## 6. Production advisor classification - 2026-07-13

Current production Advisor results after Phases 0, 0.5, 1A, 1B, 1D, and 1E:

- Security Advisor: **0 errors**, 24 warnings, 6 info suggestions.
- Performance Advisor: **0 errors**, 0 warnings, 40 info suggestions.

The six Security info suggestions are intentional service-only tables with RLS
enabled and no browser policy. With RLS enabled, no policy is fail-closed; these
tables remain reachable only through trusted server/service paths.

The remaining 24 Security warnings are intentional authenticated
`SECURITY DEFINER` functions. These are policy helpers, self-authority
resolvers, actor-scoped Dashboard aggregates, or guarded operational RPCs.
Each resolves authority from the signed-in actor rather than trusting a
requested company. Moving policy helpers to a private schema may reduce advisor
noise later, but is not required to close tenant isolation.

Phase 1E resolved the four actionable Security warnings by pinning three mutable
function search paths and revoking anonymous access to the legacy retention
aggregate. It also resolved all 15 Performance warnings:

- 13 redundant permissive `*_no_anon_access` policies all use `USING (false)`
  and therefore never widened access. Removing them preserves the scoped read
  policies and avoids evaluating a second inert policy on each query.
- 2 indexes are byte-for-byte duplicates of retained indexes. Phase 1E drops
  only the newer duplicate names and includes exact index recreation rollback.

The 40 Performance info suggestions are unindexed foreign keys and unused-index
candidates. They remain measured follow-up work: add an FK index only when the
delete/join path needs it, and do not drop a merely unused index until production
usage has been observed over a representative business cycle.

Phase 1E is live and Jay-QAed. Its source is
`20260713025000_security_advisor_cleanup.sql`, with an exact rollback and focused
verifier. Production postflight passed, including scoped retention behavior,
anonymous denial, equivalent-index preservation, and unchanged mirror reads.
