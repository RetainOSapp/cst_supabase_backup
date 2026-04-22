import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabase.ts";
import { StatusBadge } from "./StatusBadge.tsx";

export interface GlideSyncJob {
  id: string;
  glide_table_id: string;
  status: string;
  continuation: string | null;
  rows_fetched_total: number;
  rows_upserted_total: number;
  pages_total: number;
  batch_count: number;
  started_at: string;
  last_progress_at: string;
  finished_at: string | null;
  last_error: string | null;
  error_count: number;
  needs_restart_from_top: boolean;
}

function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return "—";
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h ${m}m ${sec}s`;
  if (m > 0) return `${m}m ${sec}s`;
  return `${sec}s`;
}

function formatNumber(n: number | null | undefined): string {
  if (n == null) return "—";
  return n.toLocaleString();
}

interface Props {
  glideTableId: string;
  backupTableName: string | null;
  onAnyChange?: () => void;
}

export function JobProgressPanel({ glideTableId, backupTableName, onAnyChange }: Props) {
  const [job, setJob] = useState<GlideSyncJob | null>(null);
  const [backupRowCount, setBackupRowCount] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const lastOnChangeRef = useRef(onAnyChange);
  lastOnChangeRef.current = onAnyChange;
  const inFlightRef = useRef(false);
  const lastStatusRef = useRef<string | null>(null);

  const loadJob = useCallback(async (): Promise<GlideSyncJob | null> => {
    const { data } = await supabase
      .from("glide_sync_jobs")
      .select("*")
      .eq("glide_table_id", glideTableId)
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const next = (data ?? null) as GlideSyncJob | null;
    setJob(next);
    return next;
  }, [glideTableId]);

  const loadBackupCount = useCallback(async () => {
    if (!backupTableName) {
      setBackupRowCount(null);
      return;
    }
    const { data, error } = await supabase.rpc("get_table_row_estimate", {
      p_table: backupTableName,
    });
    if (error) {
      setBackupRowCount(null);
      return;
    }
    const num = typeof data === "number" ? data : Number(data);
    setBackupRowCount(Number.isFinite(num) ? num : null);
  }, [backupTableName]);

  useEffect(() => {
    let cancelled = false;

    async function tick() {
      if (inFlightRef.current) return;
      inFlightRef.current = true;
      try {
        const next = await loadJob();
        if (cancelled) return;
        await loadBackupCount();
        if (cancelled) return;
        const status = next?.status ?? null;
        if (status !== lastStatusRef.current) {
          lastStatusRef.current = status;
          lastOnChangeRef.current?.();
        }
      } finally {
        inFlightRef.current = false;
      }
    }

    void tick();

    const interval = setInterval(() => {
      const active =
        lastStatusRef.current === "queued" ||
        lastStatusRef.current === "running" ||
        lastStatusRef.current === "partial" ||
        lastStatusRef.current === "error";
      if (!active) return;
      void tick();
    }, 3000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [loadJob, loadBackupCount]);

  const isActive = job &&
    (job.status === "queued" ||
      job.status === "running" ||
      job.status === "partial");

  const hasResumable = job &&
    (job.status === "error" ||
      job.status === "partial" ||
      job.needs_restart_from_top);

  const elapsedMs = job
    ? new Date(
        job.status === "success" || job.status === "cancelled"
          ? (job.finished_at ?? job.last_progress_at)
          : job.last_progress_at,
      ).getTime() - new Date(job.started_at).getTime()
    : 0;

  const throughput = job && elapsedMs > 0
    ? Math.round((job.rows_fetched_total / (elapsedMs / 1000)) * 60)
    : null;

  const heartbeatAgeMs = job ? Date.now() - new Date(job.last_progress_at).getTime() : 0;
  const isStalled = !!job &&
    (job.status === "running" || job.status === "partial" || job.status === "queued") &&
    heartbeatAgeMs > 45_000;

  const handleStart = useCallback(async (resume: boolean) => {
    setBusy(true);
    setActionError(null);
    try {
      // Force a token refresh before invoking so a stale JWT doesn't 401 at the gateway.
      const { data: sessionData, error: sessionErr } = await supabase.auth.getSession();
      if (sessionErr) throw sessionErr;
      if (!sessionData.session) {
        throw new Error("Your session expired. Please refresh the page and sign in again.");
      }

      const { data, error } = await supabase.functions.invoke("sync-glide", {
        body: { mode: "start_job", glideTableId, resume },
      });
      if (error) {
        const status = (error as { context?: { status?: number } }).context?.status;
        if (status === 401) {
          throw new Error("Your session expired. Please refresh the page and sign in again.");
        }
        throw error;
      }
      if (data?.error) throw new Error(String(data.error));
      const next = await loadJob();
      lastStatusRef.current = next?.status ?? null;
      lastOnChangeRef.current?.();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, [glideTableId, loadJob]);

  const handleCancel = useCallback(async () => {
    if (!job) return;
    if (!confirm("Cancel this sync job? pg_cron will stop scheduling new batches for it.")) {
      return;
    }
    setBusy(true);
    setActionError(null);
    try {
      const { error } = await supabase
        .from("glide_sync_jobs")
        .update({ status: "cancelled", finished_at: new Date().toISOString() })
        .eq("id", job.id);
      if (error) throw error;
      const next = await loadJob();
      lastStatusRef.current = next?.status ?? null;
      lastOnChangeRef.current?.();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, [job, loadJob]);

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <h2 className="text-base font-semibold text-gray-900">
            Server-side sync job
          </h2>
          <p className="text-xs text-gray-500 mt-0.5">
            pg_cron drives batches every 30s. You can close this tab — the chain runs on the server.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {!isActive && (
            <button
              type="button"
              onClick={() => handleStart(false)}
              disabled={busy}
              className="px-3 py-1.5 text-sm rounded-md bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed transition-colors"
            >
              {job ? "Start new full sync" : "Start full sync"}
            </button>
          )}
          {hasResumable && !isActive && (
            <button
              type="button"
              onClick={() => handleStart(true)}
              disabled={busy}
              className="px-3 py-1.5 text-sm rounded-md bg-white border border-indigo-600 text-indigo-700 hover:bg-indigo-50 disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed transition-colors"
            >
              Resume last job
            </button>
          )}
          {isActive && (
            <button
              type="button"
              onClick={handleCancel}
              disabled={busy}
              className="px-3 py-1.5 text-sm rounded-md bg-white border border-red-600 text-red-700 hover:bg-red-50 disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed transition-colors"
            >
              Cancel
            </button>
          )}
        </div>
      </div>

      {actionError && (
        <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {actionError}
        </div>
      )}

      {!job ? (
        <div className="text-sm text-gray-500 py-6 text-center">
          No server-side job yet. Click <strong>Start full sync</strong> to kick one off.
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
            <Stat label="Status" value={<StatusBadge status={job.status} />} />
            <Stat label="Rows fetched" value={formatNumber(job.rows_fetched_total)} />
            <Stat label="Rows upserted" value={formatNumber(job.rows_upserted_total)} />
            <Stat label="Backup table count" value={formatNumber(backupRowCount)} />
            <Stat label="Pages" value={formatNumber(job.pages_total)} />
            <Stat label="Batches" value={formatNumber(job.batch_count)} />
            <Stat label="Elapsed" value={formatDuration(elapsedMs)} />
            <Stat
              label="Throughput"
              value={throughput != null ? `${formatNumber(throughput)} rows/min` : "—"}
            />
          </div>

          <div className="text-xs text-gray-500 flex flex-wrap gap-x-4 gap-y-1 mb-2">
            <span>
              Started: {new Date(job.started_at).toLocaleString()}
            </span>
            <span>
              Last heartbeat: {new Date(job.last_progress_at).toLocaleTimeString()}
            </span>
            {job.finished_at && (
              <span>
                Finished: {new Date(job.finished_at).toLocaleString()}
              </span>
            )}
            {job.error_count > 0 && (
              <span className="text-amber-600">
                Errors retried: {job.error_count}/5
              </span>
            )}
          </div>

          {isStalled && (
            <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              <div className="font-medium mb-0.5">
                No heartbeat for {Math.round(heartbeatAgeMs / 1000)}s
              </div>
              <div className="text-xs">
                The edge function likely hit its wall-clock timeout mid-batch. pg_cron
                will auto-reclaim this job once the heartbeat is {">"}90s stale and resume from the saved continuation.
              </div>
            </div>
          )}

          {job.last_error && (
            <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              <div className="font-medium mb-0.5">
                {job.needs_restart_from_top
                  ? "Glide rejected the saved cursor — manual resume will restart from the top"
                  : "Last batch note"}
              </div>
              <div className="text-xs break-all">{job.last_error}</div>
            </div>
          )}

          {job.status === "success" && (
            <div className="mt-3 rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800">
              Sync finished successfully.
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-gray-500">{label}</div>
      <div className="text-lg font-semibold text-gray-900 mt-0.5">{value}</div>
    </div>
  );
}
