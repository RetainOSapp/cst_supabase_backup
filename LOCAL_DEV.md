# Local Development

This project is a Vite + React app that talks to Supabase. For local work, the
frontend runs on your machine while Supabase auth, data, RPCs, and Edge
Functions can point at an existing Supabase project.

## First-Time Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Create your local environment file:

   ```bash
   cp .env.example .env
   ```

3. Fill in `.env`:

   ```env
   VITE_SUPABASE_URL=https://your-project.supabase.co
   VITE_SUPABASE_ANON_KEY=your_anon_key_here
   ```

   Only use the anon key in frontend env files. Keep service role keys and
   Glide tokens in Supabase Edge Function secrets.

4. Start the app:

   ```bash
   npm run dev
   ```

5. Open the Vite URL, usually:

   ```text
   http://localhost:5173
   ```

## Useful Commands

```bash
npm run dev
npm run build
npm run preview
```

`npm run build` is the quickest local verification before sharing changes.

## Supabase Pieces Expected By The App

The frontend assumes these tables and RPCs already exist in the connected
Supabase project:

- `sync_config`
- `sync_table_list`
- `glide_sync_runs`
- `glide_sync_jobs`
- `exec_sql`
- `_set_chain_secret`
- `get_table_row_estimate`
- `dashboard_kpi_counts_primary`
- `dashboard_kpi_counts_retention`
- `dashboard_clients_list`
- `backup_*` tables produced by the sync pipeline

The main Edge Function is `sync-glide`, with modes for refreshing table lists,
single-table syncs, all-table syncs, and server-side job batches.

## Collaboration Notes

- `.env` and `.env.*` are intentionally ignored, so local secrets stay local.
- Work from this git checkout when making collaborative changes:

  ```text
  /Users/joaogoncalves/Desktop/cst_supabase_backup
  ```

- The downloaded experimental copy can stay as a reference, but this folder is
  the one that can commit, pull, and push.
- The current repo does not include SQL migration files. If we want a fully
  reproducible local/staging backend, the next useful step is exporting the
  Supabase schema/RPCs into migrations.
