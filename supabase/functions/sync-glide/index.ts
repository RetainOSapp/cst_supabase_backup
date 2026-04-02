/// <reference path="../_shared/deno.d.ts" />

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type GlideRow = Record<string, unknown>;
type SupabaseClient = ReturnType<typeof createClient>;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value))
    return `[${value.map(stableStringify).join(",")}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys
    .map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`)
    .join(",")}}`;
}

function normalizeTableName(glideName: string): string {
  return "backup_" +
    glideName
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, "")
      .replace(/\s+/g, "_")
      .replace(/_+/g, "_")
      .replace(/^_|_$/g, "");
}

function normalizeColumnName(glideName: string): string {
  return glideName
    .replace(/([a-z])([A-Z])/g, "$1_$2")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
}

function glideTypeToSql(kind: string): string {
  switch (kind) {
    case "date-time":
      return "timestamptz";
    case "number":
      return "double precision";
    case "boolean":
      return "boolean";
    default:
      return "text";
  }
}

// ---------------------------------------------------------------------------
// Glide API wrappers
// ---------------------------------------------------------------------------

function publicTableId(id: string): string {
  return id.replace(/^native-table-/, "");
}

class NotBigTableError extends Error {
  constructor(msg: string) { super(msg); this.name = "NotBigTableError"; }
}

async function glideGetRows(params: {
  apiToken: string;
  tableId: string;
  limit?: number;
  continuation?: string;
}): Promise<{ data: GlideRow[]; continuation?: string }> {
  const tid = publicTableId(params.tableId);
  const url = new URL(
    `https://api.glideapps.com/tables/${encodeURIComponent(tid)}/rows`,
  );
  if (params.limit != null)
    url.searchParams.set("limit", String(params.limit));
  if (params.continuation)
    url.searchParams.set("continuation", params.continuation);

  const res = await fetch(url.toString(), {
    method: "GET",
    headers: {
      Authorization: `Bearer ${params.apiToken}`,
      Accept: "application/json",
    },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    if (res.status === 404) {
      throw new NotBigTableError(text);
    }
    throw new Error(
      `Glide rows API ${res.status} ${res.statusText}: ${text || "<no body>"}`,
    );
  }

  const json = (await res.json()) as any;
  if (!json || typeof json !== "object" || !Array.isArray(json.data)) {
    throw new Error("Unexpected Glide rows response shape.");
  }
  return { data: json.data as GlideRow[], continuation: json.continuation };
}

async function glideQueryTableRows(params: {
  apiToken: string;
  appId: string;
  tableId: string;
}): Promise<GlideRow[]> {
  const res = await fetch("https://api.glideapp.io/api/function/queryTables", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${params.apiToken}`,
    },
    body: JSON.stringify({
      appID: params.appId,
      queries: [
        { tableName: params.tableId, utc: true },
      ],
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `Glide queryTables API ${res.status} ${res.statusText}: ${text || "<no body>"}`,
    );
  }

  const json = (await res.json()) as any;
  if (Array.isArray(json) && json.length > 0 && Array.isArray(json[0]?.rows)) {
    return json[0].rows as GlideRow[];
  }
  if (json && Array.isArray(json.rows)) {
    return json.rows as GlideRow[];
  }
  if (Array.isArray(json)) {
    return json as GlideRow[];
  }
  throw new Error("Unexpected queryTables response shape.");
}

interface GlideSchemaColumn {
  id: string;
  name: string;
  type: { kind: string };
}

async function glideGetSchema(
  appId: string,
  tableId: string,
  apiToken: string,
): Promise<GlideSchemaColumn[]> {
  const url = `https://functions.prod.internal.glideapps.com/api/apps/${encodeURIComponent(appId)}/tables/${encodeURIComponent(tableId)}/schema`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${apiToken}`,
      Accept: "application/json",
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `Glide schema API ${res.status}: ${text || "<no body>"}`,
    );
  }
  const json = (await res.json()) as any;
  return (json?.data?.columns ?? []) as GlideSchemaColumn[];
}

interface GlideAppTable {
  id: string;
  name: string;
}

async function glideGetAppTables(
  appId: string,
  apiToken: string,
): Promise<GlideAppTable[]> {
  const url = `https://functions.prod.internal.glideapps.com/api/apps/${encodeURIComponent(appId)}/tables`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${apiToken}`,
      Accept: "application/json",
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `Glide app tables API ${res.status}: ${text || "<no body>"}`,
    );
  }
  const json = (await res.json()) as any;
  const raw = json?.data ?? json;
  if (Array.isArray(raw)) {
    return raw.map((t: any) => ({ id: String(t.id ?? ""), name: String(t.name ?? t.id ?? "") }));
  }
  if (raw && typeof raw === "object") {
    return Object.entries(raw).map(([id, val]: [string, any]) => ({
      id,
      name: typeof val === "object" && val?.name ? String(val.name) : id,
    }));
  }
  throw new Error("Unexpected Glide app tables response shape.");
}

// ---------------------------------------------------------------------------
// Row ID extraction
// ---------------------------------------------------------------------------

async function pickRowId(raw: GlideRow): Promise<string> {
  const rid = raw["$rowID"];
  if (typeof rid === "string" && rid.length > 0) return rid;
  for (const candidate of ["rowID", "rowId", "id", "_rowId", "_id"]) {
    const v = raw[candidate];
    if (typeof v === "string" && v.length > 0) return v;
    if (typeof v === "number" && Number.isFinite(v)) return String(v);
  }
  return sha256Hex(stableStringify(raw));
}

// ---------------------------------------------------------------------------
// Dynamic table management via raw SQL
// ---------------------------------------------------------------------------

async function ensureBackupTable(
  db: SupabaseClient,
  backupTableName: string,
  columns: GlideSchemaColumn[],
): Promise<{ columnMap: Record<string, string> }> {
  const columnMap: Record<string, string> = {};
  const colDefs: string[] = [
    `"glide_row_id" text PRIMARY KEY`,
  ];

  for (const col of columns) {
    const pgCol = normalizeColumnName(col.name);
    columnMap[col.id] = pgCol;
    colDefs.push(`"${pgCol}" ${glideTypeToSql(col.type.kind)}`);
  }

  colDefs.push(`"synced_at" timestamptz NOT NULL DEFAULT now()`);
  colDefs.push(`"data" jsonb`);

  const createSql = `CREATE TABLE IF NOT EXISTS "public"."${backupTableName}" (${colDefs.join(", ")})`;
  const { error: createErr } = await db.rpc("exec_sql", { sql: createSql });
  if (createErr) {
    throw new Error(`Failed to create ${backupTableName}: ${createErr.message}`);
  }

  for (const col of columns) {
    const pgCol = normalizeColumnName(col.name);
    const alterSql = `ALTER TABLE "public"."${backupTableName}" ADD COLUMN IF NOT EXISTS "${pgCol}" ${glideTypeToSql(col.type.kind)}`;
    try { await db.rpc("exec_sql", { sql: alterSql }); } catch (_) { /* column may already exist */ }
  }

  try {
    await db.rpc("exec_sql", { sql: `ALTER TABLE "public"."${backupTableName}" ENABLE ROW LEVEL SECURITY` });
  } catch (_) { /* already enabled */ }

  try {
    const policySql = `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='${backupTableName}' AND policyname='auth_read_${backupTableName}') THEN CREATE POLICY "auth_read_${backupTableName}" ON "public"."${backupTableName}" FOR SELECT TO authenticated USING (true); END IF; END $$`;
    await db.rpc("exec_sql", { sql: policySql });
  } catch (_) { /* policy may already exist */ }

  try {
    await db.rpc("exec_sql", { sql: "NOTIFY pgrst, 'reload schema'" });
  } catch (_) { /* non-critical */ }

  return { columnMap };
}

// ---------------------------------------------------------------------------
// MODE: refresh_tables
// ---------------------------------------------------------------------------

async function handleRefreshTables(
  db: SupabaseClient,
  glideToken: string,
): Promise<Response> {
  const { data: configs, error: cfgErr } = await db
    .from("sync_config")
    .select("id, glide_app_id")
    .eq("active", true);
  if (cfgErr) throw cfgErr;
  if (!configs || configs.length === 0) {
    return jsonResponse({ ok: true, message: "No active sync configs" });
  }

  let totalDiscovered = 0;
  for (const cfg of configs) {
    const tables = await glideGetAppTables(cfg.glide_app_id, glideToken);
    const now = new Date().toISOString();

    for (const t of tables) {
      const backupName = normalizeTableName(t.name);
      await db
        .from("sync_table_list")
        .upsert(
          {
            sync_config_id: cfg.id,
            glide_table_id: t.id,
            glide_table_name: t.name,
            backup_table_name: backupName,
            last_discovered_at: now,
            updated_at: now,
          },
          { onConflict: "glide_table_id" },
        );
      totalDiscovered++;
    }
  }

  return jsonResponse({ ok: true, tablesDiscovered: totalDiscovered });
}

// ---------------------------------------------------------------------------
// MODE: single / all — schema-driven typed sync
// ---------------------------------------------------------------------------

const DEFAULT_MAX_ROWS = 5000;
const PAGE_SIZE = 500;
const UPSERT_CHUNK = 500;

async function syncOneTable(
  db: SupabaseClient,
  glideToken: string,
  tableRow: {
    glide_table_id: string;
    glide_table_name: string | null;
    backup_table_name: string;
    sync_config_id: string;
  },
  appId: string,
  maxRows: number,
): Promise<{
  glideTableId: string;
  name: string | null;
  backupTable: string;
  pages: number;
  rowsFetched: number;
  rowsUpserted: number;
  status: string;
  hasMore?: boolean;
  error?: string;
}> {
  const { error: runInsertErr, data: run } = await db
    .from("glide_sync_runs")
    .insert({
      glide_table_id: tableRow.glide_table_id,
      status: "running",
    })
    .select("id")
    .single();
  if (runInsertErr) throw runInsertErr;
  const runId = run.id as string;

  let pages = 0;
  let rowsFetched = 0;
  let rowsUpserted = 0;

  try {
    const schemaCols = await glideGetSchema(
      appId,
      tableRow.glide_table_id,
      glideToken,
    );

    const { columnMap } = await ensureBackupTable(
      db,
      tableRow.backup_table_name,
      schemaCols,
    );

    const schemaHash = await sha256Hex(stableStringify(schemaCols));
    await db
      .from("sync_table_list")
      .update({ last_schema_hash: schemaHash, updated_at: new Date().toISOString() })
      .eq("glide_table_id", tableRow.glide_table_id);

    const { data: contData } = await db
      .from("sync_table_list")
      .select("sync_continuation")
      .eq("glide_table_id", tableRow.glide_table_id)
      .single();

    let nextContinuation: string | undefined;
    let usedFallback = false;

    try {
      let continuation: string | undefined = contData?.sync_continuation ?? undefined;
      do {
        const page = await glideGetRows({
          apiToken: glideToken,
          tableId: tableRow.glide_table_id,
          limit: PAGE_SIZE,
          continuation,
        });
        pages += 1;
        rowsFetched += page.data.length;

        const batch: Record<string, unknown>[] = [];
        for (const raw of page.data) {
          const rowId = await pickRowId(raw);
          const row: Record<string, unknown> = {
            glide_row_id: rowId,
            synced_at: new Date().toISOString(),
            data: raw,
          };
          for (const [glideColId, pgCol] of Object.entries(columnMap)) {
            row[pgCol] = raw[glideColId] ?? null;
          }
          batch.push(row);
        }

        if (batch.length > 0) {
          for (let i = 0; i < batch.length; i += UPSERT_CHUNK) {
            const chunk = batch.slice(i, i + UPSERT_CHUNK);
            const { error: upsertErr } = await db
              .from(tableRow.backup_table_name)
              .upsert(chunk, { onConflict: "glide_row_id" });
            if (upsertErr) throw upsertErr;
            rowsUpserted += chunk.length;
          }
        }

        continuation = page.continuation;

        if (rowsFetched >= maxRows && continuation) {
          nextContinuation = continuation;
          break;
        }
      } while (continuation);

      if (!continuation) {
        nextContinuation = undefined;
      }
    } catch (e: any) {
      if (e instanceof NotBigTableError) {
        usedFallback = true;
        const rows = await glideQueryTableRows({
          apiToken: glideToken,
          appId,
          tableId: tableRow.glide_table_id,
        });
        pages = 1;
        rowsFetched = rows.length;

        for (let i = 0; i < rows.length; i += UPSERT_CHUNK) {
          const slice = rows.slice(i, i + UPSERT_CHUNK);
          const batch: Record<string, unknown>[] = [];
          for (const raw of slice) {
            const rowId = await pickRowId(raw);
            const row: Record<string, unknown> = {
              glide_row_id: rowId,
              synced_at: new Date().toISOString(),
              data: raw,
            };
            for (const [glideColId, pgCol] of Object.entries(columnMap)) {
              row[pgCol] = raw[glideColId] ?? null;
            }
            batch.push(row);
          }
          if (batch.length > 0) {
            const { error: upsertErr } = await db
              .from(tableRow.backup_table_name)
              .upsert(batch, { onConflict: "glide_row_id" });
            if (upsertErr) throw upsertErr;
            rowsUpserted += batch.length;
          }
        }

        nextContinuation = undefined;
      } else {
        throw e;
      }
    }

    const hasMore = !!nextContinuation;
    const syncStatus = hasMore ? "partial" : "success";
    const now = new Date().toISOString();

    await db
      .from("sync_table_list")
      .update({
        sync_continuation: nextContinuation ?? null,
        updated_at: now,
      })
      .eq("glide_table_id", tableRow.glide_table_id);

    await db
      .from("glide_sync_runs")
      .update({
        finished_at: now,
        status: syncStatus,
        rows_fetched: rowsFetched,
        pages_fetched: pages,
      })
      .eq("id", runId);

    await db
      .from("sync_table_list")
      .update({
        last_synced_at: now,
        last_sync_status: syncStatus,
        last_sync_error: hasMore ? `Synced ${rowsFetched} rows so far — more remain. Click Sync again to continue.` : null,
        updated_at: now,
      })
      .eq("glide_table_id", tableRow.glide_table_id);

    return {
      glideTableId: tableRow.glide_table_id,
      name: tableRow.glide_table_name,
      backupTable: tableRow.backup_table_name,
      pages,
      rowsFetched,
      rowsUpserted,
      status: syncStatus,
      hasMore,
    };
  } catch (e: any) {
    const message = e?.message ? String(e.message) : String(e);
    const now = new Date().toISOString();

    await db
      .from("glide_sync_runs")
      .update({
        finished_at: now,
        status: "error",
        error: message,
        rows_fetched: rowsFetched,
        pages_fetched: pages,
      })
      .eq("id", runId);

    await db
      .from("sync_table_list")
      .update({
        last_synced_at: now,
        last_sync_status: "error",
        last_sync_error: message,
        updated_at: now,
      })
      .eq("glide_table_id", tableRow.glide_table_id);

    return {
      glideTableId: tableRow.glide_table_id,
      name: tableRow.glide_table_name,
      backupTable: tableRow.backup_table_name,
      pages,
      rowsFetched,
      rowsUpserted,
      status: "error",
      error: message,
    };
  }
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "Use POST" }, 405);
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceRoleKey) {
      return jsonResponse(
        { error: "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY" },
        500,
      );
    }

    const authHeader = req.headers.get("Authorization") ?? "";
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const {
      data: { user },
      error: authErr,
    } = await userClient.auth.getUser();
    if (authErr || !user) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const body = await req.json().catch(() => ({}));
    const mode: string = body.mode ?? "single";

    const glideToken =
      typeof body.glideToken === "string" && body.glideToken.length > 0
        ? body.glideToken
        : Deno.env.get("GLIDE_API_TOKEN");
    if (!glideToken) {
      return jsonResponse(
        { error: "Missing GLIDE_API_TOKEN (set as secret or pass in body)" },
        500,
      );
    }

    // ---- refresh_tables mode ----
    if (mode === "refresh_tables") {
      return await handleRefreshTables(adminClient, glideToken);
    }

    // ---- validation for sync modes ----
    const maxRows = body.maxRows != null ? Number(body.maxRows) : DEFAULT_MAX_ROWS;
    if (!Number.isFinite(maxRows) || maxRows <= 0) {
      return jsonResponse({ error: "Invalid maxRows" }, 400);
    }

    // ---- single mode ----
    if (mode === "single") {
      const glideTableId = String(body.glideTableId ?? "");
      if (!glideTableId) {
        return jsonResponse(
          { error: "Missing glideTableId for single mode" },
          400,
        );
      }

      const { data: tableRow, error: tblErr } = await adminClient
        .from("sync_table_list")
        .select("glide_table_id, glide_table_name, backup_table_name, sync_config_id")
        .eq("glide_table_id", glideTableId)
        .single();
      if (tblErr || !tableRow) {
        return jsonResponse(
          { error: `Table ${glideTableId} not found in sync_table_list. Run refresh_tables first.` },
          404,
        );
      }

      const { data: cfg } = await adminClient
        .from("sync_config")
        .select("glide_app_id")
        .eq("id", tableRow.sync_config_id)
        .single();
      if (!cfg) {
        return jsonResponse({ error: "sync_config not found" }, 500);
      }

      const result = await syncOneTable(
        adminClient,
        glideToken,
        tableRow,
        cfg.glide_app_id,
        maxRows,
      );
      return jsonResponse({
        ok: result.status === "success" || result.status === "partial",
        results: [result],
      });
    }

    // ---- all mode ----
    if (mode === "all") {
      let allQuery = adminClient
        .from("sync_table_list")
        .select("glide_table_id, glide_table_name, backup_table_name, sync_config_id");

      if (body.onlySynced) {
        allQuery = allQuery.not("last_synced_at", "is", null).eq("hidden", false);
      }

      const { data: allTables, error: allErr } = await allQuery;
      if (allErr) throw allErr;
      if (!allTables || allTables.length === 0) {
        return jsonResponse({
          ok: true,
          results: [],
          message: "No tables in sync_table_list. Run refresh_tables first.",
        });
      }

      const configCache = new Map<string, string>();
      const results = [];

      for (const tableRow of allTables) {
        let appId = configCache.get(tableRow.sync_config_id);
        if (!appId) {
          const { data: cfg } = await adminClient
            .from("sync_config")
            .select("glide_app_id")
            .eq("id", tableRow.sync_config_id)
            .single();
          appId = cfg?.glide_app_id ?? "";
          configCache.set(tableRow.sync_config_id, appId);
        }
        if (!appId) continue;

        const result = await syncOneTable(
          adminClient,
          glideToken,
          tableRow,
          appId,
          maxRows,
        );
        results.push(result);
      }

      const allOk = results.every((r) => r.status === "success" || r.status === "partial");
      return jsonResponse({ ok: allOk, results });
    }

    return jsonResponse({ error: `Unknown mode: ${mode}` }, 400);
  } catch (e: any) {
    return jsonResponse(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      500,
    );
  }
});
