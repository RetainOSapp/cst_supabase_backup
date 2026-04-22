/** Glide table IDs that use `glide_sync_jobs` + pg_cron instead of browser-driven "Sync Now". */
export const JOB_BACKED_GLIDE_TABLE_IDS: readonly string[] = [
  "native-table-f33a50a1-9e50-4385-9591-cf783cac5bba", // Company -> Clients -> History
  "native-table-39522032-be7f-423c-bffa-10a81d63ec02", // Company -> Clients
] as const;

const idSet = new Set<string>(JOB_BACKED_GLIDE_TABLE_IDS);

export function isJobBackedGlideTable(glideTableId: string | undefined): boolean {
  if (!glideTableId) return false;
  return idSet.has(glideTableId);
}
