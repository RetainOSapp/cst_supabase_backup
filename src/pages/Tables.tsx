import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase.ts";
import { StatusBadge } from "../components/StatusBadge.tsx";

interface SyncTableRow {
  id: string;
  glide_table_id: string;
  glide_table_name: string | null;
  backup_table_name: string | null;
  last_synced_at: string | null;
  last_sync_status: string | null;
  last_discovered_at: string | null;
  last_sync_error: string | null;
  hidden: boolean;
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

type Tab = "synced" | "available" | "archived";

export function Tables() {
  const navigate = useNavigate();
  const [tables, setTables] = useState<SyncTableRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState<Record<string, boolean>>({});
  const [refreshing, setRefreshing] = useState(false);
  const [resyncingAll, setResyncingAll] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>("synced");
  const [counts, setCounts] = useState<Record<string, { rows: number; fields: number }>>({});

  async function fetchTables() {
    const { data } = await supabase
      .from("sync_table_list")
      .select("*")
      .order("glide_table_name", { ascending: true });
    const rows = (data ?? []) as SyncTableRow[];
    setTables(rows);
    setLoading(false);
    fetchCounts(rows);
  }

  async function fetchCounts(rows: SyncTableRow[]) {
    const syncedRows = rows.filter((t) => t.last_synced_at && t.backup_table_name);
    const results: Record<string, { rows: number; fields: number }> = {};

    await Promise.all(
      syncedRows.map(async (t) => {
        try {
          const { count } = await supabase
            .from(t.backup_table_name!)
            .select("*", { count: "exact", head: true });

          const { data: sample } = await supabase
            .from(t.backup_table_name!)
            .select("*")
            .limit(1);

          const fields =
            sample && sample.length > 0
              ? Object.keys(sample[0]).filter(
                  (k) => !["glide_row_id", "synced_at", "data"].includes(k),
                ).length
              : 0;

          results[t.glide_table_id] = { rows: count ?? 0, fields };
        } catch {
          // backup table might not exist yet
        }
      }),
    );

    setCounts(results);
  }

  useEffect(() => {
    fetchTables();
  }, []);

  async function handleRefresh() {
    setRefreshing(true);
    try {
      const { error } = await supabase.functions.invoke("sync-glide", {
        body: { mode: "refresh_tables" },
      });
      if (error) throw error;
      await fetchTables();
    } catch (err) {
      console.error("Refresh failed:", err);
      alert(`Refresh failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setRefreshing(false);
    }
  }

  async function handleSync(e: React.MouseEvent, glideTableId: string) {
    e.stopPropagation();
    setSyncing((prev) => ({ ...prev, [glideTableId]: true }));
    try {
      let hasMore = true;
      while (hasMore) {
        const { data, error } = await supabase.functions.invoke("sync-glide", {
          body: { mode: "single", glideTableId },
        });
        if (error) throw error;
        hasMore = data?.results?.[0]?.hasMore === true;
        await fetchTables();
      }
    } catch (err) {
      console.error("Sync failed:", err);
      alert(`Sync failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setSyncing((prev) => ({ ...prev, [glideTableId]: false }));
    }
  }

  async function handleResyncAll() {
    setResyncingAll(true);
    try {
      const { error } = await supabase.functions.invoke("sync-glide", {
        body: { mode: "all", onlySynced: true },
      });
      if (error) throw error;
      await fetchTables();
    } catch (err) {
      console.error("Re-sync failed:", err);
      alert(`Re-sync failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setResyncingAll(false);
    }
  }

  async function toggleHidden(e: React.MouseEvent, id: string, currentlyHidden: boolean) {
    e.stopPropagation();
    const newVal = !currentlyHidden;
    setTables((prev) =>
      prev.map((t) => (t.id === id ? { ...t, hidden: newVal } : t)),
    );
    await supabase
      .from("sync_table_list")
      .update({ hidden: newVal })
      .eq("id", id);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
      </div>
    );
  }

  const synced = tables.filter((t) => !t.hidden && t.last_synced_at !== null);
  const available = tables.filter((t) => !t.hidden && t.last_synced_at === null);
  const archived = tables.filter((t) => t.hidden);

  const tabItems: { key: Tab; label: string; count: number }[] = [
    { key: "synced", label: "Synced", count: synced.length },
    { key: "available", label: "Available", count: available.length },
    { key: "archived", label: "Archived", count: archived.length },
  ];

  const currentList =
    activeTab === "synced" ? synced : activeTab === "available" ? available : archived;

  const showRowsCols = activeTab === "synced";

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold text-gray-900">Tables</h1>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="text-sm text-indigo-600 hover:text-indigo-800 disabled:text-gray-400 cursor-pointer disabled:cursor-not-allowed transition-colors"
        >
          {refreshing ? "Refreshing..." : "Refresh table list from Glide"}
        </button>
      </div>

      {tables.length === 0 ? (
        <div className="text-center py-20 text-gray-500">
          <p className="text-lg">No Glide tables discovered yet.</p>
          <p className="text-sm mt-1">
            Click <strong>Refresh table list from Glide</strong> to discover tables
            from the configured Glide app.
          </p>
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between mb-6">
            <div className="border-b border-gray-200">
              <nav className="-mb-px flex gap-6" aria-label="Tabs">
                {tabItems.map((tab) => (
                  <button
                    key={tab.key}
                    onClick={() => setActiveTab(tab.key)}
                    className={`whitespace-nowrap pb-3 px-1 border-b-2 text-sm font-medium transition-colors cursor-pointer ${
                      activeTab === tab.key
                        ? "border-indigo-600 text-indigo-600"
                        : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                    }`}
                  >
                    {tab.label}
                    <span
                      className={`ml-2 rounded-full px-2 py-0.5 text-xs ${
                        activeTab === tab.key
                          ? "bg-indigo-100 text-indigo-600"
                          : "bg-gray-100 text-gray-500"
                      }`}
                    >
                      {tab.count}
                    </span>
                  </button>
                ))}
              </nav>
            </div>

            {activeTab === "synced" && synced.length > 0 && (
              <button
                onClick={handleResyncAll}
                disabled={resyncingAll}
                className="px-4 py-2 text-sm rounded-md bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed transition-colors"
              >
                {resyncingAll ? "Re-syncing..." : "Re-sync tables"}
              </button>
            )}
          </div>

          {currentList.length === 0 ? (
            <div className="text-center py-16 text-gray-500">
              {activeTab === "synced" && (
                <>
                  <p>No tables have been synced yet.</p>
                  <p className="text-sm mt-1">
                    Go to the <strong>Available</strong> tab and sync a table to get started.
                  </p>
                </>
              )}
              {activeTab === "available" && (
                <>
                  <p>All discovered tables have been synced.</p>
                  <p className="text-sm mt-1">
                    Click <strong>Refresh table list from Glide</strong> to discover new tables.
                  </p>
                </>
              )}
              {activeTab === "archived" && <p>No archived tables.</p>}
            </div>
          ) : (
            <div className="overflow-x-auto bg-white rounded-lg border border-gray-200 shadow-sm">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Glide Name
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Supabase Table
                    </th>
                    {showRowsCols && (
                      <>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Rows
                        </th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Fields
                        </th>
                      </>
                    )}
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Last Synced
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {currentList.map((t) => {
                    const c = counts[t.glide_table_id];
                    return (
                      <tr
                        key={t.id}
                        onClick={() =>
                          navigate(`/tables/${encodeURIComponent(t.glide_table_id)}`)
                        }
                        className={`hover:bg-gray-50 cursor-pointer transition-colors ${
                          t.hidden ? "opacity-60" : ""
                        }`}
                      >
                        <td className="px-4 py-3">
                          <div className="text-sm font-medium text-gray-900 truncate max-w-[260px]">
                            {t.glide_table_name ?? t.glide_table_id}
                          </div>
                          {t.last_sync_status === "error" && t.last_sync_error && (
                            <p className="text-xs text-red-600 truncate max-w-[260px] mt-0.5">
                              {t.last_sync_error}
                            </p>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <code className="text-xs text-gray-500 font-mono">
                            {t.backup_table_name ?? "--"}
                          </code>
                        </td>
                        {showRowsCols && (
                          <>
                            <td className="px-4 py-3 text-sm text-gray-700 text-right tabular-nums">
                              {c ? c.rows.toLocaleString() : "--"}
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-700 text-right tabular-nums">
                              {c ? c.fields.toLocaleString() : "--"}
                            </td>
                          </>
                        )}
                        <td className="px-4 py-3 text-sm text-gray-700 whitespace-nowrap">
                          {t.last_synced_at ? timeAgo(t.last_synced_at) : "Never"}
                        </td>
                        <td className="px-4 py-3">
                          {t.last_sync_status ? (
                            <StatusBadge status={t.last_sync_status} />
                          ) : (
                            <span className="text-xs text-gray-400">--</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right whitespace-nowrap">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={(e) => handleSync(e, t.glide_table_id)}
                              disabled={syncing[t.glide_table_id]}
                              className="px-3 py-1.5 text-xs rounded-md bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed transition-colors"
                            >
                              {syncing[t.glide_table_id] ? "Syncing..." : "Sync"}
                            </button>
                            <button
                              onClick={(e) => toggleHidden(e, t.id, t.hidden)}
                              title={t.hidden ? "Unarchive" : "Archive"}
                              className="p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600 cursor-pointer transition-colors"
                            >
                              {t.hidden ? (
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
                                  <path d="M3.28 2.22a.75.75 0 0 0-1.06 1.06L14.22 15.28a.75.75 0 0 0 1.06-1.06L3.28 2.22ZM5.04 7.22l1.34 1.34a2 2 0 0 0 2.73 2.73l1.34 1.34A4 4 0 0 1 5.04 7.22Z" />
                                  <path d="M10.14 13.32 8.85 12.03A4 4 0 0 1 4.7 7.88L2.28 5.47a8.03 8.03 0 0 0-1.6 2.33.78.78 0 0 0 0 .4A8 8 0 0 0 8 12.5c.74 0 1.47-.1 2.14-.32v.82l.01.02Z" />
                                  <path d="M8 3.5a8 8 0 0 1 7.32 4.3.78.78 0 0 1 0 .4 8 8 0 0 1-1.6 2.33L11.08 7.9a4 4 0 0 0-4.98-4.98L4.68 1.5A8 8 0 0 1 8 3.5Z" />
                                </svg>
                              ) : (
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
                                  <path fillRule="evenodd" d="M15.32 7.8A8 8 0 0 0 .68 7.8a.78.78 0 0 0 0 .4A8 8 0 0 0 15.32 8.2a.78.78 0 0 0 0-.4ZM8 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" clipRule="evenodd" />
                                </svg>
                              )}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
