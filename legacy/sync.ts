import { glideGetRows } from './glide.js';
import { getSupabaseAdmin } from './supabase.js';
import { createHash } from 'node:crypto';

// Maps Glide internal column codes → friendly names stored in the data JSONB
const GLIDE_COLUMN_MAP: Record<string, string> = {
  QKMWa: 'adminAccessId',
  csfff: 'companyId',
  WwDVK: 'clientId',
  '5bGrj': 'isGroupCall',
  '0mU5H': 'recordingUrl',
  dPl6t: 'uploaded',
  UdC7f: 'processStart',
  Eg1WB: 'processComplete',
  RZLHa: 'showResults',
  e4NMG: 'transcript',
  KVdUu: 'companyCustomValue',
  CkFan: 'summaryValue',
  wYdKP: 'titleValue',
  iJofL: 'callTypeValue',
  agkmM: 'redFlagValue',
  '34KRe': 'greenLightValue',
  '4MZ0X': 'clientSentimentGeneratedValue',
  FBPYX: 'csmSentimentGeneratedValue',
  '408zf': 'callScoreValue',
  qH2rM: 'callScoreNumber',
  de4Qn: 'archetypeValue',
  '95xv8': 'addedFromApi',
  '7eJuY': 'attendeeEmailsValue',
  P429R: 'reviewReviewerId',
  SvzxW: 'reviewNeedsReview',
  LESzU: 'reviewNeedsReviewTime',
  yylSU: 'reviewMarkAsReviewed',
  oRESA: 'reviewMarkAsReviewedTime',
};

const TARGET_TABLE = 'company_clients_ai_analysis';

function getEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(',')}}`;
}

function mapGlideRow(raw: Record<string, unknown>): Record<string, unknown> {
  const mapped: Record<string, unknown> = {};
  for (const [glideCode, value] of Object.entries(raw)) {
    const colName = GLIDE_COLUMN_MAP[glideCode] ?? glideCode;
    mapped[colName] = value;
  }
  return mapped;
}

function pickRowId(raw: Record<string, unknown>): string {
  // $rowID is Glide's built-in unique row identifier — most reliable
  const rowId = raw['$rowID'];
  if (typeof rowId === 'string' && rowId.length > 0) return rowId;
  // Fallback: deterministic hash so repeat syncs stay idempotent
  return createHash('sha256').update(stableStringify(raw)).digest('hex');
}

async function main() {
  const apiToken = getEnv('GLIDE_API_TOKEN');
  const glideTableId = getEnv('GLIDE_TABLE_ID');
  const limit = process.env.GLIDE_LIMIT ? Number(process.env.GLIDE_LIMIT) : 500;
  if (!Number.isFinite(limit) || limit <= 0) throw new Error('Invalid GLIDE_LIMIT');

  const supabase = getSupabaseAdmin();

  const { data: run, error: runErr } = await supabase
    .from('glide_sync_runs')
    .insert({ glide_table_id: glideTableId, status: 'running' })
    .select('id')
    .single();
  if (runErr) throw runErr;

  const runId = run.id as string;
  let continuation: string | undefined;
  let pages = 0;
  let fetched = 0;

  try {
    do {
      const page = await glideGetRows({ apiToken, tableId: glideTableId, limit, continuation });

      pages += 1;
      fetched += page.data.length;
      console.log(`Page ${pages}: fetched ${page.data.length} rows (total so far: ${fetched})`);

      const seen = new Map<string, { glide_row_id: string; data: Record<string, unknown>; synced_at: string }>();
      for (const raw of page.data) {
        const rawRow = raw as Record<string, unknown>;
        const id = pickRowId(rawRow);
        const mapped = mapGlideRow(rawRow);
        seen.set(id, { glide_row_id: id, data: mapped, synced_at: new Date().toISOString() });
      }
      const payload = Array.from(seen.values());

      if (payload.length > 0) {
        const { error } = await supabase
          .from(TARGET_TABLE)
          .upsert(payload, { onConflict: 'glide_row_id', ignoreDuplicates: false });
        if (error) {
          console.error('Upsert error:', JSON.stringify(error));
          throw new Error(error.message ?? JSON.stringify(error));
        }
        console.log(`  → upserted ${payload.length} rows into ${TARGET_TABLE}`);
      }

      continuation = page.continuation;
    } while (continuation);

    await supabase
      .from('glide_sync_runs')
      .update({
        finished_at: new Date().toISOString(),
        status: 'success',
        rows_fetched: fetched,
        pages_fetched: pages,
      })
      .eq('id', runId);

    console.log(
      JSON.stringify({ ok: true, target_table: TARGET_TABLE, pages_fetched: pages, rows_fetched: fetched }, null, 2)
    );
  } catch (e: any) {
    const message = e?.message ? String(e.message) : String(e);
    await supabase
      .from('glide_sync_runs')
      .update({
        finished_at: new Date().toISOString(),
        status: 'error',
        error: message,
        rows_fetched: fetched,
        pages_fetched: pages,
      })
      .eq('id', runId);
    throw e;
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
