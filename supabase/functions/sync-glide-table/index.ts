/// <reference path="../_shared/deno.d.ts" />

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type GlideRow = Record<string, unknown>;

async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;

  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys
    .map((key) => `${JSON.stringify(key)}:${stableStringify(obj[key])}`)
    .join(",")}}`;
}

async function glideGetRows(params: {
  apiToken: string;
  tableId: string;
  limit?: number;
  continuation?: string;
}): Promise<{ data: GlideRow[]; continuation?: string }> {
  const url = new URL(
    `https://api.glideapps.com/tables/${encodeURIComponent(params.tableId)}/rows`,
  );
  if (params.limit != null) url.searchParams.set("limit", String(params.limit));
  if (params.continuation) url.searchParams.set("continuation", params.continuation);

  const res = await fetch(url.toString(), {
    method: "GET",
    headers: {
      Authorization: `Bearer ${params.apiToken}`,
      Accept: "application/json",
    },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `Glide get rows failed (${res.status} ${res.statusText}): ${text || "<no body>"}`,
    );
  }

  const json = await res.json() as any;
  if (!json || typeof json !== "object" || !Array.isArray(json.data)) {
    throw new Error("Unexpected Glide response shape (expected { data: [] }).");
  }

  return { data: json.data as GlideRow[], continuation: json.continuation };
}

async function pickPrimaryKey(row: GlideRow, field?: string): Promise<string> {
  if (field) {
    const value = row[field];
    if (typeof value === "string" && value.length > 0) return value;
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
    if (typeof value === "boolean") return value ? "true" : "false";
  }

  const candidates = ["rowID", "rowId", "id", "_rowId", "_id"];
  for (const candidate of candidates) {
    const value = row[candidate];
    if (typeof value === "string" && value.length > 0) return value;
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }

  return await sha256Hex(stableStringify(row));
}

Deno.serve(async (req) => {
  try {
    if (req.method !== "POST") {
      return new Response("Use POST", { status: 405 });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const body = await req.json().catch(() => ({}));
    const glideToken = typeof body.glideToken === "string" && body.glideToken.length > 0
      ? body.glideToken
      : Deno.env.get("GLIDE_API_TOKEN");

    if (!supabaseUrl || !serviceRoleKey) {
      return Response.json(
        { error: "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY" },
        { status: 500 },
      );
    }
    if (!glideToken) {
      return Response.json(
        { error: "Missing GLIDE_API_TOKEN (set as Supabase secret)" },
        { status: 500 },
      );
    }

    const glideTableId = String(body.glideTableId ?? "");
    const targetTable = String(body.targetTable ?? "glide_companies");
    const primaryKeyField = typeof body.primaryKeyField === "string" && body.primaryKeyField.length > 0
      ? body.primaryKeyField
      : undefined;
    const targetPrimaryKeyColumn = String(body.targetPrimaryKeyColumn ?? "admin_access_id");
    const targetDataColumn = String(body.targetDataColumn ?? "data");
    const limit = body.limit != null ? Number(body.limit) : 500;

    if (!glideTableId) {
      return Response.json(
        { error: "Missing glideTableId in request body" },
        { status: 400 },
      );
    }
    if (!Number.isFinite(limit) || limit <= 0) {
      return Response.json({ error: "Invalid limit" }, { status: 400 });
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    let continuation: string | undefined;
    let pages = 0;
    let rows = 0;
    let upserted = 0;
    const startedAt = new Date().toISOString();

    do {
      const page = await glideGetRows({
        apiToken: glideToken,
        tableId: glideTableId,
        limit,
        continuation,
      });

      pages += 1;
      rows += page.data.length;

      const payload = await Promise.all(
        page.data.map(async (row) => ({
          [targetPrimaryKeyColumn]: await pickPrimaryKey(row, primaryKeyField),
          [targetDataColumn]: row,
          synced_at: new Date().toISOString(),
        })),
      );

      if (payload.length > 0) {
        const { error } = await supabase
          .from(targetTable)
          .upsert(payload, { onConflict: targetPrimaryKeyColumn });
        if (error) throw error;
        upserted += payload.length;
      }

      continuation = page.continuation;
    } while (continuation);

    return Response.json({
      ok: true,
      startedAt,
      finishedAt: new Date().toISOString(),
      glideTableId,
      targetTable,
      primaryKeyField,
      targetPrimaryKeyColumn,
      targetDataColumn,
      pages,
      rowsFetched: rows,
      rowsUpserted: upserted,
    });
  } catch (e) {
    return Response.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
});