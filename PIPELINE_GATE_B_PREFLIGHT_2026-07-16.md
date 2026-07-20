# Pipeline Gate B Preflight — 2026-07-16

Status: **amended Gate B approved, deployed operationally disabled, verified,
and closed on 2026-07-16. Ethical Scaling and every other company remain off.**

Gate A is closed. Its inert database transaction is already applied, all five
Pipeline tables remain empty, and both company gates remain disabled. Gate B
is limited to deploying six Edge Function closures while the product remains
operationally disabled for every company.

## Frozen Scope

Deployment order is fixed:

1. `manage-company-pipeline` — new
2. `manage-pipeline-workspace` — new
3. `manage-pipeline-automation` — new
4. `manage-client-status` — modified existing function
5. `manage-client-contract` — modified existing function
6. `manage-company-customization` — modified existing function

No frontend deploy, database migration, scheduler, seed, configuration write,
company enablement, automation run, commit, push, or `main` change belongs to
Gate B. Every function must retain `verify_jwt = true`; deployment must never
use `--no-verify-jwt`, `--prune`, or any command that changes unrelated
functions.

The deterministic local closure manifest is produced by:

```sh
node scripts/hash-pipeline-gate-b.mjs
```

The three new function closures include their `index.ts` plus
`_shared/auth.ts`, `_shared/http.ts`, and `_shared/deno.d.ts`. The three
modified existing functions are self-contained `index.ts` closures. The tool
requires the exact immutable import
`https://esm.sh/@supabase/supabase-js@2.101.1`, explicit JWT verification for
all six functions, sorted paths, file bytes and SHA-256 hashes, closure hashes,
and a deterministic manifest SHA-256.

Final reviewed local manifest (2026-07-16):

- canonical manifest SHA-256: `a2dc651859eec02d13b31155a50a899f5806b2a63f6c8f9107c41130de4d7baa`
- serialized output SHA-256: `62b6025ec5c46e8c3ecd4b255a219e2f98e207449997cd8bdb386b1aa5ec9045`

| Function | Closure bytes | Closure SHA-256 |
| --- | ---: | --- |
| `manage-company-pipeline` | 45,691 | `c967de700902e9c77f79b9cb6fd3e907289c63b143b9dfd8af4b26e2610e2864` |
| `manage-pipeline-workspace` | 36,300 | `4e5d0d8ca3b2e0686c65d2909b5c11958a8bca2d92c504e4bd195c7516146faf` |
| `manage-pipeline-automation` | 12,401 | `c8ddc09341f3dde429e1e9958fdb454b2ecd9e2876ecb1d2dffe3103392f2d88` |
| `manage-client-status` | 19,522 | `be1c860b913765cc62d207458c51866d1d22f31b05cf3126b0a802d5fda7f41b` |
| `manage-client-contract` | 35,438 | `0126d670937f023c366f21ba4fcb8552a892be1a55598bdbf220b99fd7d6e528` |
| `manage-company-customization` | 46,916 | `73b6d264f63b3e0088681647ee5d0d7576daa755bae64646e9ae34eef2b282ab` |

The non-executing probe packet output SHA-256 is
`9b6032a8ba747bfd5212d4caa315ca24d71da051d560a8f7d836c3def936f3d9`.

## Current Production Versions and Rollback Fingerprints

These values were captured read-only before Gate B preparation. They must be
captured again immediately before any approved deployment; any mismatch stops
the rollout.

| Existing function | Production version | `verify_jwt` | Production catalog SHA | Downloaded raw source SHA-256 |
| --- | ---: | --- | --- | --- |
| `manage-client-contract` | 13 | true | `b571a0a45c61ac52988d36063529c45c1465830670e98d1ff1c0f9c0f85438d1` | `81035a777a6de9c477a8e79c3ce8331c4586ce0f60c7a4225a9ce788abb079d9` |
| `manage-client-status` | 8 | true | `f0f9989ee7760453c754e6b1e14468012ca46cb6ac3a68f758c9e8756cce1a7c` | `258f4e72690fecc6c7e28c4af7b3ae03d512eab6b866d92c81d87b10ab043655` |
| `manage-company-customization` | 23 | true | `63cd542d5d35bdd5ff7ce2d481d030650e4583cfa220d1e682822c8cb112ed06` | `5a17ee2eb83059e1d3f8b4f4536386344692999244ca16dfd99004b786932118` |

The three new functions are absent from production. Current rollback sources
are held only in the local temporary evidence directory
`/tmp/pipeline-gate-b-prod-20260716`; they are not repository source and must
not be trusted without a fresh two-list race check.

A second read-only production catalog list on 2026-07-16 confirmed the three
existing versions, JWT flags, and catalog hashes above are unchanged and the
three new functions remain absent. A future approved deployment must still
repeat the fresh List A → download → List B check immediately before changing
the first function.

## Required Pre-Approval Closure

Local closure review now proves:

- all six closures use the pinned Supabase client import and explicitly enable
  JWT verification;
- automation preview returns a stable disabled/empty response when the company
  gate is off, while automation run returns 403 and creates no run row;
- contract and status writers resolve membership by `auth_user_id` first with
  exact normalized-email fallback, reject inactive/read-only members, and
  return controlled 403 authorization denials rather than generic 500s;
- customization authorization denials are likewise controlled; and
- Phase 0–4 local verification and the deterministic manifest pass together.

Result: all closure requirements passed. Phase 0–2 verification is 55/55,
Phase 3–4 verification is 43/43, the production build passes, and the packet's
execution argument fails closed. Jay subsequently approved this amended packet;
the completion evidence below records the exact deployment and runtime result.

### Pre-deploy hash stop and amendment — 2026-07-16

Jay approved the original Gate B packet. The mandatory pre-deploy manifest
check then stopped before the first function because a final reviewer had
replaced one normalized-email fallback in each new function from `ilike` to
exact `eq`. That closes a wildcard membership-match risk for authenticated
emails containing `%` or `_`; `company_members.email` is database-constrained
to trimmed lowercase, so exact matching preserves the intended fallback.

The change is exactly three bytes smaller in each new `index.ts`. No deploy or
production mutation occurred. The fresh rollback List A → download → List B
check had already passed, all three downloaded rollback sources matched their
recorded hashes, and the full production function catalog was unchanged. The
amended hashes above now replace the original manifest and require confirmation
before attempting the first deploy again.

## Post-Approval Disabled/JWT Probe Matrix

The non-executing packet can be inspected locally with:

```sh
node scripts/prepare-pipeline-gate-b-probes.mjs --json
```

That script performs no network requests and contains no deploy or mutation
implementation. The probes below run only after separate Gate B approval.

| Probe | Cases | Required result |
| --- | --- | --- |
| Gateway JWT | POST to all six with no authorization, garbage bearer, expired JWT, and wrong-project JWT | 401 for every POST; OPTIONS 200 is acceptable |
| Disabled companies | Valid Ethical Scaling and Moves Method sessions | access says `enabled=false`; workspace returns empty arrays; create returns 403; zero residue |
| Disabled automation | preview and run while master gate is off | preview is controlled and empty; run is 403; no automation-run row |
| Configuration roles | SuperAdmin, writable Director, Support, CSM, Viewer, read-only, inactive, no-member, cross-tenant | only SuperAdmin/writable Director can read configuration; ordinary/ineligible roles are 403; no mutation calls |
| Existing function reachability | empty contract/status payloads and invalid customization view | eligible writer reaches deliberate 400 validation; unauthorized user receives 403; no successful write |
| Fingerprint and smoke | gates/settings, five Pipeline tables, clients/contracts/tasks/history/audit, nonce residue, app/login/client/task/integration | no Gate B residue; concurrent normal writes reconciled by source and time; all smoke checks pass |

Before and after fingerprints must include full company gate/settings rows,
counts plus maximum timestamps and row hashes for mutable core tables, and an
exact unique probe nonce search. Counts alone are insufficient because normal
production writes may occur during the test window.

## Partial Deployment and Rollback Rules

1. List production functions (List A), download exact current sources for the
   three modified functions into a fresh temporary directory, then list again
   (List B). Versions, JWT flags, and catalog hashes must match A exactly.
2. Rehash the intended local closure immediately before each single-function
   deployment. Deploy only in the frozen order above.
3. List functions after every deployment. Exactly one intended version may
   change, its JWT flag must remain true, and unrelated functions must remain
   byte/version-identical. Stop on any discrepancy.
4. If a modified existing function must be rolled back, redeploy the freshly
   downloaded exact production source in reverse deployment order and verify
   its behavior and JWT flag. Never synthesize rollback source from memory.
5. Removing a newly created function is a separate destructive production
   mutation and requires separate explicit approval. Until then, leave it
   deployed but unreachable behind JWT, server authorization, and disabled
   company gates.
6. After any rollback or partial stop, rerun the disabled-company fingerprint
   and application smoke checks and report the exact versions that remain.

Gate B stops after deployment evidence and disabled/JWT QA. Ethical Scaling
configuration and enablement belong to Gate C and require another approval.

## Gate B Completion Evidence — 2026-07-16

Jay approved the amended manifest
`a2dc651859eec02d13b31155a50a899f5806b2a63f6c8f9107c41130de4d7baa`.
Immediately before deployment, the manifest matched, the production catalog
matched its baseline, and the fresh List A → rollback download → List B proof
was race-free. The three downloaded existing sources matched their recorded
raw SHA-256 values exactly.

Functions were deployed individually in the frozen order. After every deploy,
the entire catalog was compared to the preceding snapshot and exactly one
intended function changed. The final catalog differs from the original baseline
in exactly these six functions:

| Function | Final version | JWT | Final production catalog SHA |
| --- | ---: | --- | --- |
| `manage-company-pipeline` | 1 | true | `9b78ebe3cc05f80cfece27fe74b5019f17a1c7dd0e216ef3f51b2330fac12df2` |
| `manage-pipeline-workspace` | 1 | true | `875e58371c3469665dd713174cae3761ec55e769e11a2d4cb1234d34854d1f7d` |
| `manage-pipeline-automation` | 1 | true | `c63698662c195a6e1254a8b7f857c4a46201a56edca3ae8d994fbc433e6dd27c` |
| `manage-client-status` | 9 | true | `b66f54c233b31707a02d95ffba57943abcad94c1c66ba4ad8aef42c563dbb232` |
| `manage-client-contract` | 14 | true | `2147d20182751a48da6b396cc5ef259bf7760fa82ddbc5121baec9fa1d71fe21` |
| `manage-company-customization` | 24 | true | `a7aa9de80684f982688ce4c749367e97425c9099a3bbdb02c1884779dc08f66c` |

Runtime proof:

- 24/24 gateway POST probes returned 401: missing, garbage, expired, and
  wrong-project tokens against all six functions.
- OPTIONS returned 200 for all six functions.
- 23/23 valid-session and residue checks passed using existing SuperAdmin,
  writable Director, CSM, and cross-company accounts. No users or memberships
  were created.
- Ethical Scaling and Moves Method both returned disabled access and empty
  workspaces. SuperAdmin and writable Director could read disabled
  configuration; CSM configuration denied 403; cross-company access denied 403.
- Item creation and automation execution denied while disabled. Automation
  preview returned the stable empty response. Contract, status, and
  customization no-op probes reached deliberate 400 validation, while an
  unauthorized customization role returned 403.
- Both company gate rows were byte-equivalent before/after. All five Pipeline
  tables remained at zero rows.
- Core counts were identical before/after: clients 4,767, contracts 2,930,
  tasks 7,686, Client History 5,608, and audit events 5,813.
- App root, login, clients, tasks, and integrations routes returned 200.

No existing same-company Support, active Viewer/read-only, or inactive-only
ES/MM auth identity exists. Those role cases were not fabricated through
production mutations. Static authorization checks pass, CSM and cross-tenant
denials passed live, and the unavailable cases remain required before any role
is introduced or enabled during Gate C. An archived MM row was not a valid
inactive test because the same email also has an active same-company membership.

No frontend deploy, company configuration, company enablement, automation run,
sample data, commit, push, or `main` change occurred. Gate C requires separate
approval.
