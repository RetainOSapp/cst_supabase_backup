import fs from "node:fs";

const migration = fs.readFileSync(
  "supabase/migrations/20260807170000_dashboard_successor_contract_retention_evidence.sql",
  "utf8",
);
const rollback = fs.readFileSync(
  "supabase/rollbacks/20260807170000_dashboard_successor_contract_retention_evidence.sql",
  "utf8",
);
const precedenceMigration = fs.readFileSync(
  "supabase/migrations/20260807173000_dashboard_successor_contract_evidence_precedence.sql",
  "utf8",
);
const precedenceRollback = fs.readFileSync(
  "supabase/rollbacks/20260807173000_dashboard_successor_contract_evidence_precedence.sql",
  "utf8",
);
const precedenceFix = fs.readFileSync(
  "supabase/migrations/20260807174500_dashboard_successor_contract_precedence_fix.sql",
  "utf8",
);
const precedenceFixRollback = fs.readFileSync(
  "supabase/rollbacks/20260807174500_dashboard_successor_contract_precedence_fix.sql",
  "utf8",
);
const eventBinding = fs.readFileSync(
  "supabase/migrations/20260807180000_dashboard_successor_contract_event_binding.sql",
  "utf8",
);
const eventBindingRollback = fs.readFileSync(
  "supabase/rollbacks/20260807180000_dashboard_successor_contract_event_binding.sql",
  "utf8",
);
const decisionMonth = fs.readFileSync(
  "supabase/migrations/20260723100000_dashboard_renewal_decision_month.sql",
  "utf8",
);

const checks = [
  [
    "uses both current-summary and stored successor contracts",
    migration.includes("client.current_contract_start_date as retained_at") &&
      migration.includes("from public.client_contracts contract"),
  ],
  [
    "requires a successor contract to extend beyond its own start",
    migration.includes(
      "where evidence.successor_end_date > evidence.retained_at",
    ),
  ],
  [
    "excludes add-on contracts from successor retention evidence",
    (migration.match(/contract_type', 'standard'\) <> 'add_on'/g) ?? [])
      .length >= 2,
  ],
  [
    "feeds successor contracts through the existing retention matcher",
    migration.includes("select * from successor_contract_retention_events"),
  ],
  [
    "keeps synthetic successor evidence non-explicit",
    migration.includes("false as is_explicit"),
  ],
  [
    "preserves the existing nearest-candidate 120-day matcher",
    decisionMonth.includes("partition by event.event_key") &&
      decisionMonth.includes(
        "between candidate.contract_end_date - interval '120 days'",
      ) &&
      decisionMonth.includes(
        "and candidate.contract_end_date + interval '120 days'",
      ),
  ],
  [
    "preserves early-versus-late decision-month attribution",
    decisionMonth.includes(
      "greatest(\n      candidate.contract_end_date,\n      coalesce(retention.retained_at, candidate.contract_end_date)",
    ),
  ],
  [
    "patch fails closed unless both expected function fragments are unique",
    migration.includes("successor_scope_count <> 1") &&
      migration.includes("retention_events_count <> 1"),
  ],
  [
    "rollback is data-preserving and symmetric",
    rollback.includes("does not modify customer records") &&
      rollback.includes("original_successor_scope") &&
      rollback.includes("original_retention_events"),
  ],
  [
    "service-only unchecked RPC grants remain enforced",
    migration.includes(
      "from public, anon, authenticated;\ngrant execute on function public._dashboard_renewal_cohort_counts_fast_unchecked",
    ) && migration.includes("to service_role;"),
  ],
  [
    "precedence foundation projects explicit evidence for ranking",
    precedenceMigration.includes("event.is_explicit") &&
      precedenceMigration.includes(
        "min(link.retained_at) filter (where link.is_explicit)",
      ),
  ],
  [
    "precedence patch shape-checks all three function changes",
    precedenceMigration.includes("successor_flag_count <> 1") &&
      precedenceMigration.includes("candidate_projection_count <> 1") &&
      precedenceMigration.includes("retained_selection_count <> 1"),
  ],
  [
    "precedence rollback restores all three original fragments",
    precedenceRollback.includes("original_successor_flag") &&
      precedenceRollback.includes("original_candidate_projection") &&
      precedenceRollback.includes("original_retained_selection"),
  ],
  [
    "final successor evidence remains candidate-validated and non-explicit",
    precedenceFix.includes("false as is_explicit") &&
      precedenceFix.includes("Contracts cannot renew themselves"),
  ],
  [
    "final precedence is successor then explicit then legacy",
    precedenceFix.includes(`safe_retained_selection constant text := $safe$
    coalesce(
      min(link.retained_at) filter (
        where link.event_key like 'successor-contract:%'
      ),
      min(link.retained_at) filter (where link.is_explicit),
      min(link.retained_at)
    ) as retained_at`),
  ],
  [
    "final precedence rollback is symmetric",
    precedenceFixRollback.includes("unsafe_successor_flag") &&
      precedenceFixRollback.includes("unsafe_retained_selection"),
  ],
  [
    "synthetic evidence is bound to its successor start and extending end",
    eventBinding.includes(
      "successor_client.current_contract_start_date = event.retained_at",
    ) &&
      eventBinding.includes(
        "successor_contract.start_date = event.retained_at",
      ) &&
      eventBinding.includes(
        "successor_contract.end_date > candidate.contract_end_date",
      ),
  ],
  [
    "legacy inferred evidence retains successor corroboration",
    eventBinding.includes(
      "event.event_key not like 'successor-contract:%'",
    ) &&
      eventBinding.includes("from successor_contract_evidence successor"),
  ],
  [
    "successor event binding rollback is symmetric",
    eventBindingRollback.includes("bound_candidate_filter") &&
      eventBindingRollback.includes("broad_candidate_filter"),
  ],
];

let failures = 0;
for (const [label, passed] of checks) {
  if (passed) {
    console.log(`PASS ${label}`);
  } else {
    failures += 1;
    console.error(`FAIL ${label}`);
  }
}

if (failures > 0) {
  console.error(`\n${failures} successor-contract retention checks failed.`);
  process.exit(1);
}

console.log(`\n${checks.length} successor-contract retention checks passed.`);
