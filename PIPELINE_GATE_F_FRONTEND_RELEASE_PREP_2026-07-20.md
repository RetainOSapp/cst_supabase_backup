# Pipeline Gate F — Frontend Release Preparation

Status: **release authorized; fresh-main candidate verified before push**
Prepared: 2026-07-20
Production project: `zjauqflzxzsbpnivzsct`
Production app: `https://app.retainos.ai`

This packet began as the non-executing preparation record. Jay separately approved the Gate F frontend release on 2026-07-20. That approval permits the bounded fresh-main commit, push, Vercel verification, and authorization/regression smoke described here; it does not permit a company setting or automation change.

## Release outcome

Expose the already-reviewed Pipeline frontend to authorized users while retaining every existing server-side safety control:

- Ethical Scaling: Pipeline visible; Viewer access off; all automation paused.
- Moves Method: Renewal Pipeline visible; Viewer access off; all automation paused.
- Sales Kick: Pipeline disabled.
- Early renewals: signed/Won now, future contract Pending, optional status transition on the contract start date.

The database migrations and Edge Functions required by this frontend are already live. Gates D and E proved the early-renewal runtime with 79/79 assertions and left no active QA residue.

## Mandatory packaging correction

The current working branch must **not** be released directly.

- Pipeline branch HEAD: `07946191495f0604a68c4d34fcc61d16aa9aefd2`
- Current local `main`: `b04862cc5e7ef8b2401efe513663103399c162cc`
- Preparation-time `origin/main`: `67709e9775c7838fa232ca6681a1821fcd27d41e`
- Release-candidate base after the mandatory fresh fetch: `a0859d36a1fa52f2998fd00ddc1eb71a1d0fb3d8`
- Merge base of Pipeline HEAD and `origin/main`: Pipeline HEAD

Production has newer Dashboard, history, workspace, invitation, company-switching, milestone, Sales Kick, and Beacon changes. A direct Pipeline commit/push could revert them. The release candidate must be assembled on a **fresh branch from the then-current `origin/main`**, using only reviewed Pipeline changes.

Known overlapping files are `package.json`, `src/components/Header.tsx`, `src/pages/ClientDetail.tsx`, and `src/pages/SaasClientDetail.tsx`. `package.json` requires a manual merge that adds only the Pipeline verification scripts and preserves all newer scripts/dependencies.

## Intended production source

Frontend:

- `src/App.tsx`
- `src/components/Header.tsx`
- `src/components/pipeline/PipelineSetup.tsx`
- `src/lib/pipeline.ts`
- `src/lib/accountContext.tsx` — production account logic only
- `src/pages/Pipeline.tsx`
- Pipeline integrations in `src/pages/ClientDetail.tsx` and `src/pages/SaasClientDetail.tsx`
- Pipeline verifier commands in `package.json`

Repository source of truth for the backend already deployed in Gates A–E:

- `supabase/functions/manage-company-pipeline/`
- `supabase/functions/manage-pipeline-workspace/`
- `supabase/functions/manage-pipeline-automation/`
- reviewed Pipeline changes in shared auth, company customization, client contract, client status, and `supabase/config.toml`
- Pipeline migrations and matching rollbacks from `20260715010000` through `20260720020000`
- the three static verification scripts

Release evidence and the frozen QA/runbook documents may accompany the source. One-time production mutation scripts are not needed by the application and should be reviewed separately before any repository inclusion.

## Explicit release exclusions

Do not include these local prototype/generated artifacts in the production release:

- `pipeline-preview.html`
- `src/pipeline-preview-main.tsx`
- `src/pages/PipelineMockPreview.tsx`
- `src/lib/pipelineMock.ts`
- resettable sample-data UI or mock account provider
- `outputs/`
- local server state or `.env*`

The current production build already proves the prototype strings and entry point are absent from `dist`. When the candidate is transplanted, remove `PipelineMockAccountProvider` from production `accountContext.tsx` unless the preview source is deliberately kept in a separate, non-production-only commit.

## Verified local release evidence

- Phase 0–2 verifier: **55/55 passed**
- Phase 3–4 verifier: **47/47 passed**
- Early-renewal verifier: **20/20 passed**
- TypeScript + Vite production build: **passed**
- Fresh-main candidate JS: `dist/assets/index-cBDhoZ9O.js` (1,291.09 kB; gzip 307.43 kB)
- Fresh-main candidate CSS: `dist/assets/index-CoVqfNqg.css` (73.89 kB; gzip 14.22 kB)
- Beacon regression verification: **44/44 Edge tests, 87/87 DB checks, Edge source pass, and 27/27 frontend checks**
- Milestone-ordering regression: **3/3 passed**
- Existing Vite chunk-size warning remains; it is not introduced as a functional blocker by this gate.
- Candidate bundle excludes `pipeline-preview`, `retainos-local-pipeline-preview`, `Reset sample data`, and `Phase 4 add-on evidence`.

Production baseline captured before release preparation:

- `/` and `/login`: HTTP 200
- index SHA-256: `a08966c34dfddaf0c02365013680292f4398c500d7af1817849c3f5c44a096bc`
- live JS: `assets/index-CGvZqA6H.js`
- live CSS: `assets/index-DTG2j37C.css`
- live ETag: `"071689092c485148f67e96a8213cc91a"`

Run `node scripts/qa-pipeline-gate-f-preflight.mjs` immediately before any authorized release. It is read-only and fails if company gates drift, automation is unpaused, a scheduled activation is pending, or an anonymous Pipeline endpoint does not return 401.

## Future release procedure (requires separate approval)

1. Fetch and record the current `origin/main` SHA.
2. Create a fresh `codex/pipeline-gate-f-release` branch from that exact SHA.
3. Transplant only the intended production source listed above. Resolve overlapping files by preserving current-main behavior and adding the bounded Pipeline hunks.
4. Exclude all mock, generated, local-secret, and one-time mutator artifacts.
5. Run the read-only Gate F preflight.
6. Run all three Pipeline verifiers, the full production build, `git diff --check`, and the mock-marker bundle scan.
7. Review the complete candidate diff against `origin/main`, including migration/function source parity with what is already live.
8. Only after explicit release approval: commit with the RetainOS repo identity and push the reviewed release to `main`, which triggers Vercel.
9. Confirm Vercel is Ready, `/` and `/login` are 200, record the new asset hashes, then execute the smoke matrix below.

## Post-release smoke matrix

Start read-only. Do not create, move, close, archive, or scan a Pipeline item during the first smoke.

| Actor | Required proof |
| --- | --- |
| Anonymous/unknown | Login loads; no Pipeline data or function access; Pipeline endpoints return 401. |
| SuperAdmin | Switch to ES and MM; Pipeline navigation, Workspace, Admin configuration, selectors, filters, client search, and drawers render. Sales Kick has no Pipeline entry. |
| Director | Sees/manages own-company Pipeline and configuration; cannot access another company. |
| Support | Sees/manages operational Pipeline items; cannot configure pipelines. |
| Assigned CSM | Sees only Pipeline items for assigned clients and can perform allowed item actions. |
| Unassigned CSM | Cannot list or directly mutate another CSM's item/client. |
| Viewer/read-only/inactive | Viewer stays hidden while Viewer access is off; read-only and inactive actors cannot write. |

Current real-account coverage is incomplete: MM has two active authenticated CSM memberships but no authenticated Director membership in the app-owned roster; ES has no authenticated member identities in this roster. Therefore Director, Support, Viewer, read-only, inactive, and cross-tenant runtime checks require bounded temporary test identities based on the previously passing Gate C1 role harness. That harness must be amended for both ES and MM being enabled, snapshot/restore every touched membership, delete every temporary auth identity, perform no business-data writes, and prove zero residue. Running it is part of the separately approved release/smoke gate—not this preparation gate.

Existing-surface regression smoke:

- Company switching clears prior-company Pipeline state without flashing data.
- Dashboard, Clients, Tasks, Client Detail, Admin Hub, Call AI, and Beacon still load according to role.
- Client contract creation retains existing behavior, including non-early renewals.
- Early-renewal UI renders against the already-proven server contract; no additional live early-renewal write is required for Gate F.

## Stop conditions

Stop and roll back/repair before broader access if any of these occur:

- candidate is not based on the current `origin/main`;
- an unrelated current-main change disappears from the diff or UI;
- any verifier/build/diff/mock-marker check fails;
- company data flashes across a switch or role boundary;
- any role denial, Viewer-off behavior, or anonymous 401 check fails;
- a Pipeline automation is no longer paused or a schedule is unexpectedly pending;
- existing Dashboard, Clients, Tasks, Client Detail, Admin, Call AI, or Beacon behavior regresses;
- the browser reports an uncaught Pipeline error.

## Rollback posture

- Record the exact pre-release `origin/main` SHA and Vercel deployment before pushing.
- Application rollback is a normal revert of the single Gate F frontend release commit followed by Vercel verification; do not reset shared history.
- Database migrations and Edge Functions remain in place because they are additive, server-authorized, and safely hidden by frontend/company gates.
- If a live incident requires immediate containment, disable the affected company's Pipeline gate and keep automation paused. That is an emergency production configuration mutation and must be recorded in audit/evidence.
- Verify `/`, `/login`, prior asset restoration, company switching, and affected roles after rollback.

## Approval boundary

This preparation gate became executable when Jay provided the separate authorization:

> **Approve Pipeline Gate F frontend release.**

That approval authorized building the fresh-main release candidate, final verification, commit/push to `main`, Vercel verification, and the bounded post-release smoke described here. It did not authorize enabling Sales Kick, enabling Viewer access, unpausing automation, or broad rollout beyond the already configured ES/MM visibility.

## Release closure

- Production commit: `fb4e3da` (`release Pipeline workflows and early renewals`)
- Production base: `a0859d36a1fa52f2998fd00ddc1eb71a1d0fb3d8`
- Vercel bundle: `assets/index-cBDhoZ9O.js`
- Public smoke: `/` 200 and `/login` 200
- Director: ES workspace and configuration allowed
- Support: ES workspace allowed; configuration denied
- Assigned CSM: MM shows exactly Melissa Moore and Merrilyn Sikorski
- CSM denial: unassigned MM item write denied; ES cross-tenant workspace denied
- Inactive Viewer: denied; active Viewer with Viewer gate off receives disabled/empty workspace
- Read-only Director: disabled/empty workspace; configuration denied
- Smoke residue: zero Pipeline writes, zero automation-run changes, zero temporary auth identities
- Final safety state: ES/MM enabled, Sales Kick disabled, Viewer access off everywhere, all automation paused, zero pending activations

The in-app browser had no authenticated production session, so the automated visible smoke ended at the healthy login page. Jay's authenticated visual click-through remains the final human observation check; server-side role enforcement and cleanup are complete.
