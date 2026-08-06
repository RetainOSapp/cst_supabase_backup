#!/usr/bin/env node

import { createClient } from "@supabase/supabase-js";
import { getSupabaseEnv, loadDotEnv } from "./shared-env.mjs";

loadDotEnv();

const { url, serviceRoleKey } = getSupabaseEnv();
const supabase = createClient(url, serviceRoleKey, {
  auth: { persistSession: false },
});

const companyId = "21586391-9a84-4072-9ae6-20436b27bea9";
const periodStart = "2026-07-01T00:00:00.000Z";
const periodEndExclusive = "2026-08-01T00:00:00.000Z";
const dayMs = 86_400_000;
const matchingWindowMs = 120 * dayMs;
const offboardLookbackStart = timestamp(periodStart) - matchingWindowMs;

async function fetchPaged(buildQuery) {
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await buildQuery(from, from + 999);
    if (error) throw error;
    rows.push(...(data ?? []));
    if ((data ?? []).length < 1000) return rows;
  }
}

async function fetchChunked(ids, buildQuery) {
  const rows = [];
  for (let offset = 0; offset < ids.length; offset += 100) {
    const chunk = ids.slice(offset, offset + 100);
    rows.push(
      ...(await fetchPaged((from, to) =>
        buildQuery(chunk, from, to),
      )),
    );
  }
  return rows;
}

function timestamp(value) {
  if (!value) return null;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : null;
}

function isoDay(value) {
  const parsed = timestamp(value);
  return parsed === null ? null : new Date(parsed).toISOString().slice(0, 10);
}

function addCandidate(map, clientId, value) {
  const parsed = timestamp(value);
  if (!clientId || parsed === null) return;
  const candidates = map.get(clientId) ?? new Map();
  candidates.set(new Date(parsed).toISOString(), parsed);
  map.set(clientId, candidates);
}

function inJuly(value) {
  return value >= timestamp(periodStart) && value < timestamp(periodEndExclusive);
}

function acceptedTransition(payload) {
  const from = payload?.from_status;
  const to = payload?.to_status;
  return (
    (from === "front-end" && to === "front-end") ||
    (from === "front-end" && to === "back-end") ||
    (from === "back-end" && to === "back-end")
  );
}

function countBy(values, keyFor) {
  return Object.fromEntries(
    [...values.reduce((counts, value) => {
      const key = keyFor(value);
      counts.set(key, (counts.get(key) ?? 0) + 1);
      return counts;
    }, new Map()).entries()].sort(([left], [right]) =>
      left.localeCompare(right),
    ),
  );
}

function appRetainedAt(event) {
  return (
    timestamp(event.payload?.contract?.start_date) ??
    timestamp(event.payload?.contract?.startDate) ??
    timestamp(event.payload?.retention_date) ??
    timestamp(event.created_at)
  );
}

function hasSuccessor(client, contracts, contractEnd) {
  const summaryEnd =
    timestamp(client.current_contract_end_date_for_filtering) ??
    timestamp(client.current_contract_end_date);
  const summaryStart = timestamp(client.current_contract_start_date);
  if (
    summaryEnd !== null &&
    summaryStart !== null &&
    summaryEnd > contractEnd &&
    summaryStart >= contractEnd - dayMs
  ) {
    return true;
  }
  return contracts.some((contract) => {
    const start = timestamp(contract.start_date);
    const end = timestamp(contract.end_date);
    return (
      start !== null &&
      end !== null &&
      start >= contractEnd - dayMs &&
      start <= contractEnd + matchingWindowMs &&
      end > contractEnd
    );
  });
}

function matchEvent(event, candidates, successorByCandidate) {
  let best = null;
  for (const contractEnd of candidates) {
    const distance = Math.abs(event.retainedAt - contractEnd);
    if (distance > matchingWindowMs) continue;
    if (!event.explicit && !successorByCandidate.get(contractEnd)) continue;
    if (
      best === null ||
      distance < best.distance ||
      (distance === best.distance && contractEnd > best.contractEnd)
    ) {
      best = { contractEnd, distance };
    }
  }
  return best?.contractEnd ?? null;
}

async function main() {
  const [
    companyResult,
    settingsResult,
    clients,
    contracts,
    statusSnapshots,
  ] = await Promise.all([
    supabase
      .from("companies")
      .select("id,name")
      .eq("id", companyId)
      .single(),
    supabase
      .from("company_settings")
      .select("allow_status_change_retention")
      .eq("company_id", companyId)
      .maybeSingle(),
    fetchPaged((from, to) =>
      supabase
        .from("clients")
        .select(
          "glide_row_id,client_name,program_status_value,churn_reason_value,program_latest_suspended_date,archived_at,exclude_from_dashboard_analytics,client_age_date_offboarded,client_age_date_offboarded_for_filtering,current_contract_start_date,current_contract_of_days,current_contract_end_date,current_contract_end_date_for_filtering",
        )
        .eq("company_id", companyId)
        .range(from, to),
    ),
    fetchPaged((from, to) =>
      supabase
        .from("client_contracts")
        .select("client_id,start_date,end_date")
        .eq("company_id", companyId)
        .is("archived_at", null)
        .or("status.is.null,status.neq.archived")
        .range(from, to),
    ),
    fetchPaged((from, to) =>
      supabase
        .from("client_history_events")
        .select("legacy_client_glide_row_id,payload")
        .eq("company_id", companyId)
        .eq("event_type", "client_status_changed")
        .range(from, to),
    ),
  ]);
  if (companyResult.error) throw companyResult.error;
  if (settingsResult.error) throw settingsResult.error;

  const filteredClients = clients.filter((client) => {
    if (client.archived_at || client.exclude_from_dashboard_analytics) {
      return false;
    }
    if (["front-end", "back-end"].includes(client.program_status_value)) {
      return true;
    }
    const offboardedAt =
      timestamp(client.client_age_date_offboarded) ??
      timestamp(client.client_age_date_offboarded_for_filtering);
    return (
      client.program_status_value === "off-boarded" &&
      !String(client.churn_reason_value ?? "").trim() &&
      offboardedAt !== null &&
      offboardedAt >= offboardLookbackStart
    );
  });
  const clientById = new Map(
    filteredClients.map((client) => [client.glide_row_id, client]),
  );
  const contractsByClient = new Map();
  for (const contract of contracts) {
    if (!clientById.has(contract.client_id)) continue;
    const rows = contractsByClient.get(contract.client_id) ?? [];
    rows.push(contract);
    contractsByClient.set(contract.client_id, rows);
  }

  const candidatesByClient = new Map();
  for (const client of filteredClients) {
    addCandidate(
      candidatesByClient,
      client.glide_row_id,
      client.current_contract_end_date_for_filtering ??
        client.current_contract_end_date,
    );
  }
  for (const contract of contracts) {
    if (!clientById.has(contract.client_id)) continue;
    addCandidate(candidatesByClient, contract.client_id, contract.end_date);
  }
  for (const event of statusSnapshots) {
    if (!clientById.has(event.legacy_client_glide_row_id)) continue;
    addCandidate(
      candidatesByClient,
      event.legacy_client_glide_row_id,
      event.payload?.before?.current_contract_end_date,
    );
  }

  const potentiallyEligibleOffboardedIds = filteredClients
    .filter((client) => client.program_status_value === "off-boarded")
    .map((client) => client.glide_row_id);

  const [appEvents, legacyEvents] = await Promise.all([
    fetchChunked(potentiallyEligibleOffboardedIds, (chunk, from, to) =>
      supabase
        .from("client_history_events")
        .select(
          "legacy_client_glide_row_id,event_type,payload,created_at",
        )
        .eq("company_id", companyId)
        .in("legacy_client_glide_row_id", chunk)
        .in("event_type", [
          "client_retention_recorded",
          "client_status_changed",
        ])
        .range(from, to),
    ),
    fetchChunked(potentiallyEligibleOffboardedIds, (chunk, from, to) =>
      supabase
        .from("backup_company_clients_history")
        .select(
          "client_id,modified_date,original_value,value,change_type_code",
        )
        .in("client_id", chunk)
        .eq("change_type_code", "program-status")
        .range(from, to),
    ),
  ]);

  const allowStatusChangeRetention =
    settingsResult.data?.allow_status_change_retention === true;
  const eventsByClient = new Map();
  function addEvent(clientId, retainedAt, explicit) {
    if (!clientId || retainedAt === null) return;
    const rows = eventsByClient.get(clientId) ?? [];
    rows.push({ retainedAt, explicit });
    eventsByClient.set(clientId, rows);
  }
  for (const event of appEvents) {
    if (event.event_type === "client_retention_recorded") {
      addEvent(event.legacy_client_glide_row_id, appRetainedAt(event), true);
    } else if (
      allowStatusChangeRetention &&
      acceptedTransition(event.payload)
    ) {
      addEvent(event.legacy_client_glide_row_id, timestamp(event.created_at), false);
    }
  }
  for (const event of legacyEvents) {
    const accepted =
      ["front-end", "back-end"].includes(event.original_value) &&
      ["front-end", "back-end"].includes(event.value);
    if (accepted) {
      addEvent(event.client_id, timestamp(event.modified_date), false);
    }
  }

  const addedCohort = [];
  for (const clientId of potentiallyEligibleOffboardedIds) {
    const client = clientById.get(clientId);
    const candidates = [
      ...(candidatesByClient.get(clientId)?.values() ?? []),
    ];
    const clientContracts = contractsByClient.get(clientId) ?? [];
    const successorByCandidate = new Map(
      candidates.map((candidate) => [
        candidate,
        hasSuccessor(client, clientContracts, candidate),
      ]),
    );
    const retainedByCandidate = new Map();
    for (const event of eventsByClient.get(clientId) ?? []) {
      const matched = matchEvent(event, candidates, successorByCandidate);
      if (matched === null) continue;
      const current = retainedByCandidate.get(matched);
      retainedByCandidate.set(
        matched,
        current === undefined ? event.retainedAt : Math.min(current, event.retainedAt),
      );
    }

    const offboardedAt =
      timestamp(client.client_age_date_offboarded) ??
      timestamp(client.client_age_date_offboarded_for_filtering);
    const periodContracts = candidates
      .filter((contractEnd) => offboardedAt >= contractEnd)
      .map((contractEnd) => {
        const retainedAt = retainedByCandidate.get(contractEnd) ?? null;
        return {
          contractEnd,
          retainedAt,
          reportingDate: Math.max(contractEnd, retainedAt ?? contractEnd),
        };
      })
      .filter((contract) => inJuly(contract.reportingDate));
    if (periodContracts.length === 0) continue;
    addedCohort.push({
      client_id: clientId,
      client_name: client.client_name,
      churn_reason: client.churn_reason_value,
      suspended_at: isoDay(client.program_latest_suspended_date),
      offboarded_at: isoDay(offboardedAt),
      retained: periodContracts.some((contract) => contract.retainedAt !== null),
      contract_end_dates: periodContracts.map((contract) =>
        isoDay(contract.contractEnd),
      ),
      retained_dates: periodContracts
        .map((contract) => isoDay(contract.retainedAt))
        .filter(Boolean),
    });
  }

  const currentResult = await supabase.rpc(
    "_dashboard_renewal_cohort_counts_fast_unchecked",
    {
      p_company_id: companyId,
      p_csm_id: null,
      p_secondary_assignee_id: null,
      p_program_values: null,
      p_offer_id: null,
      p_client_start_date_from: null,
      p_client_start_date_to: null,
      p_date_range_start: periodStart,
      p_date_range_end: "2026-07-31T00:00:00.000Z",
      p_assigned_team_member_id: null,
    },
  );
  if (currentResult.error) throw currentResult.error;
  const current = currentResult.data?.[0] ?? {};
  const currentCohortIds = new Set(current.renewal_cohort_client_ids ?? []);
  const currentRetainedIds = new Set(current.retained_client_ids ?? []);
  const missingCohort = addedCohort.filter(
    (client) => !currentCohortIds.has(client.client_id),
  );
  const missingRetained = missingCohort.filter((client) => client.retained);
  const expectedEligible =
    Number(current.renewal_cohort_clients ?? 0) + missingCohort.length;
  const expectedRetained =
    Number(current.retained_clients ?? 0) + missingRetained.length;
  const currentActiveUnresolved = [...currentCohortIds].filter((clientId) => {
    const client = clientById.get(clientId);
    return (
      client &&
      ["front-end", "back-end"].includes(client.program_status_value) &&
      !currentRetainedIds.has(clientId)
    );
  }).length;
  const reconstructedOffboardedIds = new Set(
    addedCohort.map((client) => client.client_id),
  );
  const currentOffboardedNotReconstructed = [...currentCohortIds]
    .map((clientId) => clientById.get(clientId))
    .filter(
      (client) =>
        client?.program_status_value === "off-boarded" &&
        !reconstructedOffboardedIds.has(client.glide_row_id),
    )
    .map((client) => ({
      client_id: client.glide_row_id,
      client_name: client.client_name,
      churn_reason: client.churn_reason_value,
      suspended_at: isoDay(client.program_latest_suspended_date),
      offboarded_at: isoDay(
        client.client_age_date_offboarded ??
          client.client_age_date_offboarded_for_filtering,
      ),
      summary_contract_end: isoDay(
        client.current_contract_end_date_for_filtering ??
          client.current_contract_end_date,
      ),
    }));

  console.log(
    JSON.stringify(
      {
        mode: "read-only",
        company: companyResult.data.name,
        period: "July 2026",
        current: {
          eligible: Number(current.renewal_cohort_clients ?? 0),
          retained: Number(current.retained_clients ?? 0),
        },
        reconstructed_normal_completions: {
          eligible: addedCohort.length,
          retained: addedCohort.filter((client) => client.retained).length,
          churn_reasons: countBy(
            addedCohort,
            (client) => client.churn_reason ?? "(none)",
          ),
        },
        missing_from_current_scope: {
          eligible: missingCohort.length,
          retained: missingRetained.length,
        },
        expected_after_fix: {
          eligible: expectedEligible,
          retained: expectedRetained,
          active_unresolved: currentActiveUnresolved,
          retention_percentage:
            expectedEligible === 0
              ? 0
              : Math.round((expectedRetained / expectedEligible) * 100),
        },
        live_matches_expected:
          missingCohort.length === 0 &&
          missingRetained.length === 0,
        missing_normal_completion_examples: missingCohort.slice(0, 20),
        current_offboarded_not_reconstructed:
          currentOffboardedNotReconstructed.slice(0, 20),
        retained_normal_completion_examples: addedCohort
          .filter((client) => client.retained)
          .slice(0, 20),
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error.message ?? "MM July retention audit failed.");
  process.exit(1);
});
