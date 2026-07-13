#!/usr/bin/env node

/**
 * Non-destructive verification for Security Phase 0 after the migration/function
 * deploy is intentionally applied to an environment.
 *
 * Usage:
 *   set -a; source .env; set +a
 *   node scripts/verify-security-phase0.mjs
 */

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const anonKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
const serviceRoleKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.supabase_service_role;

if (!supabaseUrl || !anonKey || !serviceRoleKey) {
  console.error(
    "Missing Supabase URL, anonymous key, or service-role key.",
  );
  process.exit(1);
}

const restUrl = `${supabaseUrl.replace(/\/$/, "")}/rest/v1`;
const functionsUrl = `${supabaseUrl.replace(/\/$/, "")}/functions/v1`;

async function request(
  label,
  url,
  options,
  expectedStatuses,
  expectedBodyIncludes = null,
) {
  const expected = Array.isArray(expectedStatuses)
    ? expectedStatuses
    : [];
  const hasUnambiguousExpectations = expected.length > 0
    && new Set(expected).size === expected.length
    && expected.every((status) => Number.isInteger(status) && status >= 100 && status <= 599);

  if (!hasUnambiguousExpectations) {
    return {
      label,
      ok: false,
      status: "not checked",
      expected: expected.join("/") || "<missing>",
      body: "Verifier configuration error: expectedStatuses must contain unique HTTP status codes.",
    };
  }

  let response;
  try {
    response = await fetch(url, options);
  } catch (error) {
    return {
      label,
      ok: false,
      status: "request failed",
      expected: expected.join("/"),
      body: error instanceof Error ? error.message : String(error),
    };
  }

  const body = await response.text().catch(() => "");
  const ok = expected.includes(response.status)
    && (!expectedBodyIncludes || body.includes(expectedBodyIncludes));
  return {
    label,
    ok,
    status: response.status,
    expected: expected.join("/"),
    expectedBodyIncludes,
    body: body.slice(0, 240),
  };
}

const checks = [
  () =>
    request(
      "anon RPC exec_sql is blocked",
      `${restUrl}/rpc/exec_sql`,
      {
        method: "POST",
        headers: {
          apikey: anonKey,
          Authorization: `Bearer ${anonKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ sql: "select 1" }),
      },
      [401, 403, 404],
    ),
  () =>
    request(
      "anon client_links read is blocked",
      `${restUrl}/client_links?select=id&limit=1`,
      {
        method: "GET",
        headers: {
          apikey: anonKey,
          Authorization: `Bearer ${anonKey}`,
        },
      },
      [401, 403],
    ),
  () =>
    request(
      "anon client_advocacy_events read is blocked",
      `${restUrl}/client_advocacy_events?select=id&limit=1`,
      {
        method: "GET",
        headers: {
          apikey: anonKey,
          Authorization: `Bearer ${anonKey}`,
        },
      },
      [401, 403],
    ),
  () =>
    request(
      "anon glide_companies read is blocked",
      `${restUrl}/glide_companies?select=*&limit=1`,
      {
        method: "GET",
        headers: {
          apikey: anonKey,
          Authorization: `Bearer ${anonKey}`,
        },
      },
      [401, 403],
    ),
  () =>
    request(
      "anon glide_rows read is blocked",
      `${restUrl}/glide_rows?select=*&limit=1`,
      {
        method: "GET",
        headers: {
          apikey: anonKey,
          Authorization: `Bearer ${anonKey}`,
        },
      },
      [401, 403],
    ),
  () =>
    request(
      "sync-glide-table with anon auth is blocked by the function",
      `${functionsUrl}/sync-glide-table`,
      {
        method: "POST",
        headers: {
          apikey: anonKey,
          Authorization: `Bearer ${anonKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ glideTableId: "phase0-negative-check" }),
      },
      [401],
    ),
  () =>
    request(
      "sync-glide-table with invalid bearer is blocked",
      `${functionsUrl}/sync-glide-table`,
      {
        method: "POST",
        headers: {
          apikey: anonKey,
          Authorization: "Bearer phase0-invalid-bearer",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ glideTableId: "phase0-negative-check" }),
      },
      [401],
    ),
  () =>
    request(
      "sync-glide-table service role reaches the target allowlist",
      `${functionsUrl}/sync-glide-table`,
      {
        method: "POST",
        headers: {
          apikey: anonKey,
          Authorization: `Bearer ${serviceRoleKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          glideTableId: "phase0-authorized-noop",
          targetTable: "phase0_forbidden_target",
          limit: 1,
        }),
      },
      [400],
      "Unsupported targetTable",
    ),
];

const results = [];
for (const check of checks) {
  results.push(await check());
}

for (const result of results) {
  const marker = result.ok ? "PASS" : "FAIL";
  console.log(`${marker} ${result.label}: status ${result.status} (expected ${result.expected})`);
  if (!result.ok && result.body) {
    console.log(`  body: ${result.body}`);
  }
}

if (results.some((result) => !result.ok)) {
  process.exit(1);
}
