# Glide → Supabase Backup

A web dashboard and Supabase Edge Function pipeline that automatically discovers, syncs, and backs up all tables from a Glide app into Supabase Postgres — with individually typed columns, batched processing for large datasets, and a full sync history log.

## How It Works

1. **Configure** — A `sync_config` table stores your Glide app ID. The system uses this to discover every table available in the app.
2. **Discover** — Clicking "Refresh table list from Glide" calls the Glide internal API to enumerate all tables and populates `sync_table_list`.
3. **Sync** — When you sync a table (individually or in bulk), the Edge Function:
   - Fetches the table's schema from Glide and dynamically creates a typed Postgres `backup_*` table (or adds new columns if the schema has changed).
   - Pulls rows in batches of 5,000 per invocation (500 per API page) to stay within Edge Function CPU limits.
   - Upserts rows into the backup table, keyed on `glide_row_id`.
   - If more rows remain, the UI automatically re-invokes the function until the full table is synced.
   - Supports both **Big Tables** (v2 API) and **regular Glide tables** (legacy `queryTables` API) with automatic fallback on 404.
4. **Monitor** — Every sync run is logged to `glide_sync_runs` with status, row counts, timing, and any errors.

## Project Structure

```
├── src/                        # React + Vite frontend
│   ├── pages/
│   │   ├── Login.tsx           # Email OTP login (Supabase Auth)
│   │   ├── Tables.tsx          # Main dashboard — synced / available / archived tabs
│   │   ├── TableDetail.tsx     # Row preview, sync trigger, metadata for a single table
│   │   └── SyncLog.tsx         # Full history of all sync runs
│   ├── components/
│   │   ├── AuthGuard.tsx       # Route protection (redirects to login if unauthenticated)
│   │   ├── Header.tsx          # Top navigation bar
│   │   └── StatusBadge.tsx     # Colored status pill (success / error / running / partial)
│   └── lib/
│       └── supabase.ts         # Supabase client singleton
├── supabase/
│   └── functions/
│       ├── sync-glide/         # Primary Edge Function — discovery, schema-driven sync, batching
│       └── sync-glide-table/   # Simpler single-table sync (original, kept as reference)
├── legacy/                     # Archived local Node.js sync scripts (no longer used)
├── index.html                  # Vite entry point
├── vite.config.ts
├── tsconfig.json
├── package.json
└── .env                        # Environment variables (not committed)
```

## Supabase Tables

| Table | Prefix | Purpose |
|---|---|---|
| `sync_config` | `sync_` | Stores the Glide app ID and active flag |
| `sync_table_list` | `sync_` | One row per discovered Glide table — tracks name, backup table name, sync status, errors, continuation tokens, hidden flag |
| `glide_sync_runs` | (audit) | Log of every sync invocation — status, rows fetched, pages, errors, timestamps |
| `backup_*` | `backup_` | Dynamically created tables mirroring Glide data with typed columns + `glide_row_id`, `synced_at`, and raw `data` JSONB |

A Postgres function `exec_sql` is used by the Edge Function to run dynamic DDL (CREATE TABLE, ALTER TABLE, RLS policies).

## Getting Started

For a shorter local collaboration checklist, see [`LOCAL_DEV.md`](./LOCAL_DEV.md).

### Prerequisites

- A [Supabase](https://supabase.com) project
- A [Glide](https://www.glideapps.com) app with API access
- Node.js 18+

### 1. Clone and install

```bash
git clone <repo-url>
cd cst_supabase_backup
npm install
```

### 2. Configure environment variables

Copy the example and fill in your values:

```bash
cp .env.example .env
```

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your_anon_key_here
```

### 3. Set Supabase secrets

The Edge Function needs these as Supabase secrets (set via the Supabase Dashboard under Edge Functions → Secrets):

| Secret | Description |
|---|---|
| `GLIDE_API_TOKEN` | Your Glide API bearer token |

`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `SUPABASE_ANON_KEY` are automatically available to Edge Functions.

### 4. Set up the database

Ensure these exist in your Supabase project:

- **`sync_config`** table with columns: `id` (uuid, PK), `glide_app_id` (text), `active` (boolean, default true)
- **`sync_table_list`** table with columns: `id` (uuid, PK), `sync_config_id` (uuid, FK), `glide_table_id` (text, unique), `glide_table_name` (text), `backup_table_name` (text), `hidden` (boolean, default false), `last_synced_at` (timestamptz), `last_sync_status` (text), `last_sync_error` (text), `last_schema_hash` (text), `last_discovered_at` (timestamptz), `sync_continuation` (text), `updated_at` (timestamptz)
- **`glide_sync_runs`** table with columns: `id` (uuid, PK), `glide_table_id` (text), `status` (text), `error` (text), `rows_fetched` (int), `pages_fetched` (int), `started_at` (timestamptz, default now), `finished_at` (timestamptz)
- **`exec_sql`** Postgres function that executes dynamic SQL (used for CREATE TABLE, ALTER TABLE)

Insert your Glide app ID into `sync_config`:

```sql
INSERT INTO sync_config (glide_app_id) VALUES ('your_glide_app_id_here');
```

### 5. Run the dev server

```bash
npm run dev
```

Open the URL shown in the terminal (usually `http://localhost:5173`). Log in with your email — Supabase will send a one-time pin code.

### 6. Deploy Edge Functions

Edge Functions are deployed via the Supabase Dashboard or CLI. The primary function is `sync-glide`.

## Usage

### Tables Page

The main dashboard is split into three tabs:

- **Synced** — Tables that have been backed up at least once. Shows Glide name, Supabase table name, row count, field count, last sync time, and status. Includes a "Re-sync tables" button to re-sync all of them.
- **Available** — Discovered tables that haven't been synced yet. Click the sync button to kick off the first sync (creates the backup table automatically).
- **Archived** — Tables you've hidden from the main view. Can be restored.

Click any row to open the **Table Detail** page, which shows a 20-row preview, total row count, sync status, Glide table ID and Supabase table name (with copy buttons), and a Sync Now button.

### Sync Log

A full history of all sync operations across all tables, showing status, row counts, and timestamps.

## Glide API Endpoints Used

| Endpoint | Purpose |
|---|---|
| `functions.prod.internal.glideapps.com/api/apps/{appId}/tables` | Discover all tables in the app |
| `functions.prod.internal.glideapps.com/api/apps/{appId}/tables/{tableId}/schema` | Fetch column schema for a table |
| `api.glideapps.com/tables/{tableId}/rows` | Fetch rows from Big Tables (v2 API, supports pagination) |
| `api.glideapp.io/api/function/queryTables` | Fallback for non-Big Tables (legacy API) |

## Batching and Large Tables

Tables with many rows (e.g. 170,000+) are synced in batches of **5,000 rows per Edge Function invocation** to avoid CPU time limits. The continuation token is persisted in `sync_table_list.sync_continuation`, and the UI automatically re-invokes the function until all rows are transferred. Each API page fetches 500 rows, and upserts are chunked at 500 rows per database call.
