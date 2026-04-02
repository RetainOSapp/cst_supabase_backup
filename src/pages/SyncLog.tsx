import { useEffect, useState, useCallback } from "react";
import { supabase } from "../lib/supabase.ts";
import { StatusBadge } from "../components/StatusBadge.tsx";

interface SyncRun {
  id: string;
  glide_table_id: string;
  started_at: string;
  finished_at: string | null;
  status: string;
  error: string | null;
  rows_fetched: number;
  pages_fetched: number;
}

interface TableNameMap {
  [glideTableId: string]: string;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleString();
}

function duration(start: string, end: string | null): string {
  if (!end) return "--";
  const ms = new Date(end).getTime() - new Date(start).getTime();
  if (ms < 1000) return `${ms}ms`;
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${remainingSeconds}s`;
}

const PAGE_SIZE = 25;

export function SyncLog() {
  const [runs, setRuns] = useState<SyncRun[]>([]);
  const [tableNames, setTableNames] = useState<TableNameMap>({});
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [expandedError, setExpandedError] = useState<string | null>(null);

  const fetchRuns = useCallback(async () => {
    const { data: tables } = await supabase
      .from("sync_table_list")
      .select("glide_table_id, glide_table_name");
    const nameMap: TableNameMap = {};
    for (const t of tables ?? []) {
      if (t.glide_table_name) nameMap[t.glide_table_id] = t.glide_table_name;
    }
    setTableNames(nameMap);

    const from = page * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    const { data, count } = await supabase
      .from("glide_sync_runs")
      .select("*", { count: "exact" })
      .order("started_at", { ascending: false })
      .range(from, to);

    setRuns((data ?? []) as SyncRun[]);
    setTotal(count ?? 0);
    setLoading(false);
  }, [page]);

  useEffect(() => {
    fetchRuns();
  }, [fetchRuns]);

  const totalPages = Math.ceil(total / PAGE_SIZE);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-gray-900">Sync Log</h1>
      </div>

      {runs.length === 0 ? (
        <div className="text-center py-16 text-gray-500">
          No sync runs recorded yet.
        </div>
      ) : (
        <>
          <div className="overflow-x-auto bg-white rounded-lg border border-gray-200 shadow-sm">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  {["Status", "Table", "Started", "Duration", "Rows", "Pages", "Error"].map(
                    (h) => (
                      <th
                        key={h}
                        className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                      >
                        {h}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {runs.map((run) => (
                  <tr key={run.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <StatusBadge status={run.status} />
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700">
                      {tableNames[run.glide_table_id] ?? (
                        <span className="font-mono text-xs text-gray-500">
                          {run.glide_table_id}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700 whitespace-nowrap">
                      {formatDate(run.started_at)}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700 whitespace-nowrap">
                      {duration(run.started_at, run.finished_at)}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700">
                      {run.rows_fetched.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700">
                      {run.pages_fetched}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700 max-w-xs">
                      {run.error ? (
                        <button
                          onClick={() =>
                            setExpandedError(
                              expandedError === run.id ? null : run.id,
                            )
                          }
                          className="text-left cursor-pointer"
                        >
                          {expandedError === run.id ? (
                            <span className="text-red-600 break-all">
                              {run.error}
                            </span>
                          ) : (
                            <span className="text-red-600 truncate block max-w-[200px]">
                              {run.error}
                            </span>
                          )}
                        </button>
                      ) : (
                        <span className="text-gray-400">--</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4">
              <p className="text-sm text-gray-500">
                Showing {page * PAGE_SIZE + 1}--
                {Math.min((page + 1) * PAGE_SIZE, total)} of {total}
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  disabled={page === 0}
                  className="px-3 py-1 text-sm rounded border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
                >
                  Previous
                </button>
                <button
                  onClick={() =>
                    setPage((p) => Math.min(totalPages - 1, p + 1))
                  }
                  disabled={page >= totalPages - 1}
                  className="px-3 py-1 text-sm rounded border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
