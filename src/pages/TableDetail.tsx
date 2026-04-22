import { useEffect, useState, useCallback } from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "../lib/supabase.ts";
import { isJobBackedGlideTable } from "../lib/jobBackedGlideTables.ts";
import { JobProgressPanel } from "../components/JobProgressPanel.tsx";

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <button
      onClick={handleCopy}
      title="Copy to clipboard"
      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors cursor-pointer"
    >
      {copied ? (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5 text-green-500">
          <path fillRule="evenodd" d="M12.416 3.376a.75.75 0 0 1 .208 1.04l-5 7.5a.75.75 0 0 1-1.154.114l-3-3a.75.75 0 0 1 1.06-1.06l2.353 2.353 4.493-6.74a.75.75 0 0 1 1.04-.207Z" clipRule="evenodd" />
        </svg>
      ) : (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
          <path d="M5.5 3.5A1.5 1.5 0 0 1 7 2h2.879a1.5 1.5 0 0 1 1.06.44l2.122 2.12a1.5 1.5 0 0 1 .439 1.061V9.5A1.5 1.5 0 0 1 12 11V8.621a3 3 0 0 0-.879-2.121L9 4.379A3 3 0 0 0 6.879 3.5H5.5Z" />
          <path d="M4 5a1.5 1.5 0 0 0-1.5 1.5v6A1.5 1.5 0 0 0 4 14h5a1.5 1.5 0 0 0 1.5-1.5V8.621a1.5 1.5 0 0 0-.44-1.06L7.94 5.439A1.5 1.5 0 0 0 6.878 5H4Z" />
        </svg>
      )}
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

export function TableDetail() {
  const { glideTableId } = useParams<{ glideTableId: string }>();
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [tableName, setTableName] = useState<string | null>(null);
  const [backupTable, setBackupTable] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [columns, setColumns] = useState<string[]>([]);
  const [notSynced, setNotSynced] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [lastSyncError, setLastSyncError] = useState<string | null>(null);
  const [lastSyncStatus, setLastSyncStatus] = useState<string | null>(null);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [totalRows, setTotalRows] = useState<number | null>(null);

  const load = useCallback(async () => {
    if (!glideTableId) return;

    const { data: tableInfo } = await supabase
      .from("sync_table_list")
      .select("glide_table_name, backup_table_name, last_sync_error, last_sync_status, last_synced_at")
      .eq("glide_table_id", glideTableId)
      .single();

    const name = tableInfo?.glide_table_name ?? null;
    const bTable = tableInfo?.backup_table_name ?? null;
    setTableName(name);
    setBackupTable(bTable);
    setLastSyncError(tableInfo?.last_sync_error ?? null);
    setLastSyncStatus(tableInfo?.last_sync_status ?? null);
    setLastSyncedAt(tableInfo?.last_synced_at ?? null);

    if (!bTable) {
      setNotSynced(true);
      setLoading(false);
      return;
    }

    const { data, error } = await supabase
      .from(bTable)
      .select("*")
      .order("synced_at", { ascending: false })
      .limit(20);

    if (error) {
      if (
        error.message?.includes("does not exist") ||
        error.code === "42P01" ||
        error.message?.includes("relation") 
      ) {
        setNotSynced(true);
        setLoading(false);
        return;
      }
      console.error("Error loading preview:", error);
      setRows([]);
      setColumns([]);
      setLoading(false);
      return;
    }

    const rowData = (data ?? []) as Record<string, unknown>[];
    setRows(rowData);
    setNotSynced(false);

    const { data: estimate, error: estErr } = await supabase.rpc(
      "get_table_row_estimate",
      { p_table: bTable },
    );
    if (estErr) {
      setTotalRows(null);
    } else {
      const num = typeof estimate === "number" ? estimate : Number(estimate);
      setTotalRows(Number.isFinite(num) ? num : null);
    }

    const colSet = new Set<string>();
    for (const r of rowData) {
      for (const k of Object.keys(r)) {
        if (k !== "data") colSet.add(k);
      }
    }
    setColumns(Array.from(colSet).sort());
    setLoading(false);
  }, [glideTableId]);

  useEffect(() => {
    load();
  }, [load]);

  const usesServerSyncJob = isJobBackedGlideTable(glideTableId);

  async function handleSync() {
    if (!glideTableId) return;
    setSyncing(true);
    try {
      let hasMore = true;
      while (hasMore) {
        const { data, error } = await supabase.functions.invoke("sync-glide", {
          body: { mode: "single", glideTableId },
        });
        if (error) throw error;
        hasMore = data?.results?.[0]?.hasMore === true;
        await load();
      }
    } catch (err) {
      console.error("Sync failed:", err);
      alert(`Sync failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setSyncing(false);
    }
  }

  function truncate(value: unknown, maxLen = 60): string {
    if (value === null || value === undefined) return "";
    const str = typeof value === "string" ? value : JSON.stringify(value);
    return str.length > maxLen ? str.slice(0, maxLen) + "..." : str;
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Link
            to="/"
            className="text-indigo-600 hover:text-indigo-800 text-sm"
          >
            &larr; Back
          </Link>
          <h1 className="text-xl font-semibold text-gray-900">
            {tableName ?? glideTableId}
          </h1>
          <span className="text-sm text-gray-500">
            ({rows.length}{totalRows != null ? ` of ${totalRows.toLocaleString()}` : ""} rows shown)
          </span>
        </div>
        {!usesServerSyncJob && (
          <button
            onClick={handleSync}
            disabled={syncing}
            className="px-4 py-2 text-sm rounded-md bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed transition-colors"
          >
            {syncing ? "Syncing..." : "Sync Now"}
          </button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-x-6 gap-y-1 mb-4 text-xs text-gray-500">
        {glideTableId && (
          <div className="flex items-center gap-1">
            <span className="font-medium text-gray-600">Glide Table ID:</span>
            <code className="font-mono bg-gray-100 px-1.5 py-0.5 rounded">{glideTableId}</code>
            <CopyButton text={glideTableId} />
          </div>
        )}
        {backupTable && (
          <div className="flex items-center gap-1">
            <span className="font-medium text-gray-600">Supabase Table Name:</span>
            <code className="font-mono bg-gray-100 px-1.5 py-0.5 rounded">{backupTable}</code>
            <CopyButton text={backupTable} />
          </div>
        )}
      </div>

      {usesServerSyncJob && glideTableId && (
        <div className="mb-6">
          <JobProgressPanel
            glideTableId={glideTableId}
            backupTableName={backupTable}
            onAnyChange={load}
          />
        </div>
      )}

      {!usesServerSyncJob && lastSyncStatus === "error" && lastSyncError && (
        <div className="mb-6 rounded-lg bg-red-50 border border-red-200 px-4 py-3">
          <div className="flex items-start gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 text-red-500 shrink-0 mt-0.5">
              <path fillRule="evenodd" d="M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0Zm-8-5a.75.75 0 0 1 .75.75v4.5a.75.75 0 0 1-1.5 0v-4.5A.75.75 0 0 1 10 5Zm0 10a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z" clipRule="evenodd" />
            </svg>
            <div className="min-w-0">
              <p className="text-sm font-medium text-red-800">
                Last sync failed{lastSyncedAt ? ` (${new Date(lastSyncedAt).toLocaleString()})` : ""}
              </p>
              <p className="text-sm text-red-700 mt-1 break-all">{lastSyncError}</p>
            </div>
          </div>
        </div>
      )}

      {notSynced ? (
        <div className="text-center py-16 text-gray-500">
          <p>This table has not been synced yet.</p>
          <p className="text-sm mt-1">
            {usesServerSyncJob ? (
              <>
                Use <strong>Start full sync</strong> in the server-side job panel above to create the backup table and populate data.
              </>
            ) : (
              <>
                Click <strong>Sync Now</strong> above to create the backup table and populate data.
              </>
            )}
          </p>
        </div>
      ) : rows.length === 0 ? (
        <div className="text-center py-16 text-gray-500">
          <p>No rows synced for this table yet.</p>
          <p className="text-sm mt-1">
            {usesServerSyncJob ? (
              <>
                Use <strong>Start full sync</strong> in the server-side job panel above to populate data.
              </>
            ) : (
              <>
                Click <strong>Sync Now</strong> above to populate data.
              </>
            )}
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto bg-white rounded-lg border border-gray-200 shadow-sm">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                {columns.slice(0, 10).map((col) => (
                  <th
                    key={col}
                    className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                  >
                    {col}
                  </th>
                ))}
                {columns.length > 10 && (
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    +{columns.length - 10} more
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {rows.map((row, idx) => (
                <tr
                  key={String(row.glide_row_id ?? idx)}
                  className="hover:bg-gray-50"
                >
                  {columns.slice(0, 10).map((col) => (
                    <td
                      key={col}
                      className="px-4 py-3 text-sm text-gray-700 max-w-xs truncate"
                      title={String(row[col] ?? "")}
                    >
                      {truncate(row[col])}
                    </td>
                  ))}
                  {columns.length > 10 && (
                    <td className="px-4 py-3 text-xs text-gray-400">...</td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
