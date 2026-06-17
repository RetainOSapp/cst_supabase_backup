# Company Pathways & Milestones Polish Plan

Last inspected: 2026-06-16

Scope for this pass: planning only. No app source, migrations, Supabase functions, or deploy work is included in this document refresh.

## 2026-06-16 Product Summary

Company Pathways & Milestones V1 is usable for primary pathways and should stay focused on the primary company journey until the next larger migration gives us more real client data. Secondary offers remain a later feature.

The best next lightweight product slice is:

- Add simple move up/down polish only if ordering feels clunky after real admin usage.
- Keep usage counts and archive blockers visible so admins understand when live clients are attached to an offer or milestone.
- Improve Client Detail completion clarity: show whether completing the current milestone advances to a next milestone or finishes the pathway.
- Keep deeper reporting/formula validation for Moves Method or another larger migrated company.

Suggested QA lens for Jay:

| Area | What to check | Decision needed |
| --- | --- | --- |
| Admin setup | Offers and milestones are understandable for a migrated company. | Does the current setup UI feel safe enough for high-touch migrations? |
| Reordering | Existing controls are usable without accidental journey changes. | Do we need more polish now, or can drag/drop wait? |
| Client completion | Completing a milestone makes the next state obvious. | Is the next/final milestone language clear? |
| Migration gates | Current offer and milestone ids resolve for migrated clients. | Keep as migration QA, not day-to-day customer QA. |

## 2026-06-16 Implementation Follow-Up

Implemented after Jay answered the open product decisions:

- User-facing language now prefers `Pathway` over `Offer` / `Journey` in the Admin pathway setup and Client Detail pathway flows. Internal table/action names still use `offer` for compatibility.
- Restoring an archived pathway now restores its associated archived milestones in the same `unarchive_offer` action.
- Client Detail milestone completion now prompts the user to optionally start another milestone immediately after completion. The selector defaults to the next milestone in line when one exists, but the user can choose another active milestone.
- `manage-client-milestone` responses now include `selectedMilestone`, `nextMilestone`, `isFinalMilestone`, `durationDays`, and `timeToHitDays`.

Decision on milestone renames:

- Do not rewrite historical `client_milestones.metadata.mirrored_milestone_name` snapshots in this slice. Active clients resolve current labels by milestone id, so renamed milestones show correctly in current product surfaces while historical snapshots remain audit-safe.
- If filtering/reporting later needs snapshot rewrites, handle that as a separate explicit migration/tooling action with a preview.

## Current Implemented State

### Data model

- `company_offers` and `company_offer_milestones` exist in `supabase/migrations/20260606170000_company_pathways_milestones_pilot.sql`.
- The company setup migration seeds app-owned offers and milestones once from:
  - `backup_company_offers`
  - `backup_company_offer_milestones`
- App-owned setup rows keep `glide_row_id` as the stable business id used by clients and offer filters.
- `company_offers.status` and `company_offer_milestones.status` support `active` and `archived`.
- `company_offer_milestones.position` is the app-owned order field. Mirrored fallback uses `backup_company_offer_milestones.order`.
- `client_milestones` exists in `supabase/migrations/20260602123000_client_milestones_write_pilot.sql`.
- `client_milestones` stores app-owned progress for client milestone start/completion, duration, time-to-hit, actor attribution, source snapshot, and metadata.
- `clients` stores current offer and milestone pointers in:
  - `offer_milestones_current_offer_id`
  - `offer_milestones_current_milestone_id`
  - `offer_milestones_current_milestone_change_date`
- Secondary offer/milestone fields still exist on the mirrored/client shape, but the app-owned flow intentionally treats secondary offers as deferred.

### Edge functions

- `manage-company-pathway` supports:
  - `create_offer`
  - `update_offer`
  - `archive_offer`
  - `create_milestone`
  - `update_milestone`
  - `archive_milestone`
- `manage-company-pathway` authorizes SuperAdmins and active company Directors only.
- Company setup writes are enabled only for companies with `migration_status in ('pilot', 'migrated')`.
- Archiving an offer or milestone is blocked when active app-owned `clients` currently point at that offer or milestone.
- Archiving an offer also archives its active milestones.
- `manage-client-milestone` supports:
  - `set_pathway`
  - `start_milestone`
  - `complete_milestone`
- `manage-client-milestone` authorizes:
  - SuperAdmins and Directors for pathway changes.
  - Assigned CSMs for start/complete on assigned clients.
  - Directors for start/complete through the same non-CSM path.
- `complete_milestone` writes/updates a `client_milestones` progress row and advances the client to the next active configured milestone in the current offer when one exists.
- Client milestone writes create `client_history_events` and `app_audit_events`.

### UI surfaces

- Admin/SaaS company detail has a `Pathways` tab in `src/pages/SaasClientDetail.tsx`.
- For pilot/migrated companies, that tab reads `company_offers` and `company_offer_milestones`.
- For mirror-only companies, it falls back to `backup_company_offers` and `backup_company_offer_milestones` and disables editing.
- Admin pathway UI currently supports creating, editing, and archiving active offers/milestones.
- Archived offers are visible in a collapsed section, but archived milestones are not separately exposed.
- Reordering is manual through the milestone `Position` field; there are no move up/down or drag controls.
- There is no unarchive/restore action.
- Client Detail > Pathways & Milestones in `src/pages/ClientDetail.tsx` reads app-owned pathway setup for pilot/migrated companies and mirror setup for mirror-only companies.
- Client Detail resolves current offer and milestone ids to configured names and filters the visible timeline to the active/current offer.
- Client Detail supports:
  - Change Pathway & Milestones for users with pathway management capability.
  - Start Milestone for users with milestone advancement capability.
  - Complete Milestone for users with milestone advancement capability.
- Quick Update in `src/pages/Clients.tsx` includes compact milestone completion and advances the current milestone after `manage-client-milestone` returns a next milestone.
- New Client in `src/pages/Clients.tsx` supports optional initial offer/pathway and starting milestone.
- Clients and Dashboard offer filters prefer app-owned offers for pilot/migrated companies and fall back to mirrored offers for mirror-only companies.

## Remaining UX / Product Gaps

### Reordering

- Current milestone order is editable only by typing a numeric position.
- This is easy to misuse during company setup because duplicate positions, large gaps, and accidental reorder of live client journeys are possible.
- Needed polish:
  - Admin UI controls for move up/down first.
  - Later optional drag-and-drop once the behavior is proven.
  - Server action that accepts the full ordered milestone id list for one offer, validates all ids belong to the same company and offer, and rewrites positions atomically.
  - Clear behavior for active clients when order changes. Suggested v1 rule: allow reorder, but do not mutate client current milestone pointers; only future timeline display and next-completion advancement use the new order.

### Archive / unarchive

- Archive exists and has an active-client guard.
- Unarchive does not exist.
- Archived milestones are hidden inside active offers, so restoring a single archived milestone is not possible from the UI.
- Needed polish:
  - Show archived milestones under each offer, collapsed by default.
  - Add `unarchive_offer` and `unarchive_milestone`.
  - When unarchiving an offer, keep milestones archived unless the actor explicitly restores them, or offer a second confirmation to restore all milestones.
  - Block unarchiving if it would create invalid duplicate active positions only after the reorder action is available, or normalize restored milestones to the end of the offer.
  - Audit before/after for all archive and unarchive actions.

### Edit protections

- Existing archive protection only checks current active clients.
- Existing update actions can rename offers/milestones and change milestone position, target days, TTV, and final flags even when active clients are assigned.
- Needed polish:
  - Separate safe edits from structural edits.
  - Safe edits: display name, target days, TTV/final flags. These can be allowed for active items but should write audit events and be reflected in future labels.
  - Structural edits: milestone offer assignment, order/position, archive, and future delete. These need stronger guards and confirmation.
  - No hard delete for offers/milestones in migration-critical v1.
  - Add usage counts to Admin UI so Directors see how many active clients are on each offer/milestone before editing.
  - Consider showing a warning when renaming a milestone currently used by active clients because historical `client_milestones.metadata.mirrored_milestone_name` may retain the old label.

### Completion from Client Detail

- Client Detail already has Start Milestone and Complete Milestone.
- The completion modal captures start date, completion date, and notes.
- Gaps:
  - The button label says `Complete Milestone`, but the user is not told whether the client will advance and what the next milestone is before saving.
  - The modal does not preview duration/time-to-hit.
  - After completing the final milestone, the current milestone remains the completed milestone; the UI can still look like a current step rather than a completed journey.
- Needed polish:
  - In the completion modal, show current offer, current milestone, and next milestone preview.
  - For final milestone completion, show a `Final milestone` completion state and avoid suggesting there is another step.
  - After save, refresh or locally update timeline and current milestone state so the completed/current distinction is visually obvious.

### Change Pathway / milestone wording

- Product language currently mixes `offer`, `pathway`, `journey`, and `milestone`.
- Admin tab says `Offers & Milestones`; Client Detail says `Pathways & Milestones`; Quick Update says `Journey progress`.
- Suggested v1 wording:
  - Admin setup: `Pathways` for the grouped entity, with small secondary text `Offer-backed client journeys`.
  - Client Detail: `Pathway` and `Current Milestone`.
  - API/internal/table names can remain `offer` to preserve compatibility.
  - Modal title: `Change Pathway` instead of `Change Pathway & Milestones`.
  - Field label: `Starting Milestone` for New Client is good.
- Keep a short implementation note in code comments only where UI names intentionally differ from table names.

### Timeline clarity

- Client Detail timeline is correctly filtered to the current offer, which is important.
- Timeline still needs clearer states:
  - Completed.
  - Current, not started.
  - Current, in progress.
  - Upcoming.
  - Final completed.
- Needed polish:
  - Use the configured ordered milestones as the spine.
  - Overlay client progress rows on that spine.
  - Show target days, actual duration, and time-to-hit as separate compact labels instead of a single dense sentence.
  - If a client has progress for a milestone no longer configured or archived, show it in a `Historical / no longer active in pathway` section rather than hiding it.
  - Show a data source badge: `RetainOS pathway` versus `Glide mirror`.

### Secondary offers later

- Secondary offer fields are not part of the primary v1 and should stay deferred until the primary migration flow is validated.
- Do not add secondary offer setup into the first polish slice.
- Before building secondary offers, decide:
  - Whether a client can have two independently advancing timelines.
  - Whether secondary milestones affect profile upkeep and Dashboard offer filters.
  - Whether Quick Update can complete primary and secondary milestones separately.
  - How to migrate existing Glide secondary offer fields into app-owned `clients` and `client_milestones`.

## Data / Model Risks For Migrated Companies

### Stable id coupling

- App-owned `company_offers.glide_row_id` and `company_offer_milestones.glide_row_id` are used as stable ids by client rows, filters, and progress rows.
- This is compatible with seeded Glide ids and generated RetainOS ids, but it means generated ids must remain globally unique.
- Risk: future import/backfill could accidentally create duplicate RetainOS-generated ids or reuse a mirrored id for the wrong company.
- Mitigation:
  - Keep unique constraints.
  - In migration tooling, always compare by company id plus legacy ids before insert.
  - Add migration QA that every app-owned client current offer/milestone id resolves to an active or archived app-owned company config row.

### Mirror fallback ambiguity

- Mirror-only companies still read from Glide mirror tables.
- Pilot/migrated companies should prefer app-owned configuration, but some screens still fall back to mirror if app-owned reads error or return empty data.
- Risk: a partially seeded migrated company could silently show stale mirror configuration.
- Mitigation:
  - For `migration_status in ('pilot', 'migrated')`, treat missing app-owned offer/milestone config as a migration QA failure rather than an invisible UI fallback on write surfaces.
  - Keep mirror fallback only for explicit `mirror_only` companies and read-only legacy previews.
  - Add an admin-visible warning for pilot/migrated companies with zero app-owned active offers.

### Archived config and historical progress

- Active client archive checks only inspect current client pointers, not all historical `client_milestones`.
- That is acceptable for archive safety if archive means "not available for new/current assignment," but the UI must still resolve names for historical rows.
- Mitigation:
  - Client timeline/history lookups should include archived company milestones when resolving historical progress labels.
  - Report/dashboard filters should use active offers by default but retain historical labels for events.

### Position and auto-advance semantics

- `complete_milestone` advances to the next active configured milestone by `position`.
- Risk: reordering a live offer changes future auto-advance behavior.
- Mitigation:
  - Add confirmation and usage counts when reordering offers with active clients.
  - Record reorder audit with before/after ordered ids.
  - Do not rewrite existing `client_milestones` progress rows during reorder.

### Company-by-company migration gates

- Before moving a company to `pilot` or `migrated`, validate:
  - Mirrored offers seed into `company_offers`.
  - Mirrored offer milestones seed into `company_offer_milestones`.
  - Every app-owned active client current offer id resolves.
  - Every app-owned active client current milestone id resolves under its current offer.
  - Duplicate/missing milestone positions are reported.
  - Active clients are not pointing at archived app-owned offers/milestones.
  - Glide secondary offer fields are inventoried but not mutated in v1.

## Edge Function / API Changes Needed

### `manage-company-pathway`

Add actions:

- `reorder_milestones`
  - Body: `companyLegacyId`, `offerId`, `milestoneIds`.
  - Validate actor is SuperAdmin or Director.
  - Validate company is `pilot` or `migrated`.
  - Validate offer belongs to company and is active.
  - Validate every id belongs to the same company and offer.
  - Validate the set exactly matches active milestones for the offer unless an explicit partial reorder mode is intentionally designed.
  - Update positions in a transaction-like sequence; if true DB transaction support is not available in the function, prefer a SQL RPC for atomic reorder.
  - Write one audit event with ordered ids before/after.

- `unarchive_offer`
  - Restore `status = 'active'`, clear `archived_at`.
  - Do not automatically restore milestones in v1 unless the request explicitly includes `restoreMilestones: true`.
  - If restoring milestones, append them after active milestones to avoid position collisions.
  - Write audit.

- `unarchive_milestone`
  - Validate parent offer exists and is active.
  - Restore `status = 'active'`, clear `archived_at`.
  - Position restored milestone at the end if needed.
  - Write audit.

Harden existing actions:

- Return usage counts for archive errors, ideally with a small sample of affected active clients for Admin UI display.
- For `update_milestone`, decide whether `position` edits are still accepted after `reorder_milestones` exists. Preferred: remove position from generic edit and route all position changes through reorder.
- Add optimistic concurrency guard later if multiple admins edit setup concurrently. Minimal version: include `updated_at` in edit payload and reject stale saves.

### `manage-client-milestone`

Add response metadata:

- Include `selectedMilestone`, `nextMilestone`, and `isFinalMilestone` consistently for start/complete/set responses.
- Include computed `durationDays` and `timeToHitDays` at top level for UI preview/save messaging.
- On final milestone completion, consider setting a client-level metadata flag later, but do not add new schema in the smallest slice.

Potential future actions, not first slice:

- `undo_complete_milestone` or `reopen_milestone`, only after product decides who can correct mistakes.
- `set_secondary_pathway`, only after secondary offer model is designed.

## First Smallest Useful Implementation Slice

Recommended slice: "Safe admin reorder + clearer client completion preview."

Why this first:

- It directly addresses company-by-company migration setup without touching secondary offers.
- It reduces the highest-risk admin behavior: manual numeric ordering.
- It improves the day-to-day client flow where CSMs/Directors complete milestones.
- It can be QAed on Ethical Scaling without destructive changes.

Concrete scope:

1. Add `reorder_milestones` to `manage-company-pathway`.
2. Add Admin UI move up/down buttons for active milestones inside one offer.
3. Remove or disable direct `Position` editing in the milestone edit modal once move up/down is available.
4. Show active client usage counts beside each offer and milestone in Admin UI.
5. In Client Detail completion modal, preview next milestone and final-milestone state.
6. Keep archive behavior unchanged except for displaying clearer affected-client errors.

Out of scope for this first slice:

- Unarchive.
- Drag-and-drop.
- Secondary offers.
- Bulk pathway import.
- Historical correction/undo.
- Any source-of-truth migration status changes.

## QA Checklist

### Read-only and fallback

- Mirror-only company Pathways tab shows Glide mirror data and editing controls are disabled.
- Pilot/migrated company Pathways tab shows `RetainOS pilot data` / app-owned config.
- Pilot/migrated company with missing app-owned setup is surfaced as a migration warning, not silently treated as editable mirror data.

### Admin create/edit/reorder

- Director can create an offer for their company only.
- Director can create milestones under their company's offer only.
- Director cannot manage another company's pathways by passing another `companyLegacyId`.
- CSM/Support/Viewer cannot call `manage-company-pathway` successfully.
- Reorder move up/down persists after reload.
- Reorder does not change client current offer/milestone pointers.
- Reorder changes future auto-advance order only for subsequent completions.
- Duplicate positions are not created by the UI reorder path.

### Archive safety / no data loss

- Archiving an offer used by active clients is blocked.
- Archiving a milestone used by active clients is blocked.
- Archive error displays the number of affected active clients.
- Archiving an unused offer sets `status = 'archived'` and `archived_at`, and cascades active milestones to archived.
- Archiving never deletes rows from `company_offers`, `company_offer_milestones`, `clients`, or `client_milestones`.
- Historical client progress and history events still resolve readable milestone names after archive.
- Archived offers/milestones do not appear in New Client, Change Pathway, Quick Update completion, or active offer filters.
- Archived offers remain inspectable in Admin.

### Client Detail pathway progression

- Assigned CSM can start and complete milestones for assigned clients.
- Assigned CSM cannot change pathway.
- CSM cannot update unassigned clients.
- Director/SuperAdmin can change pathway and complete milestones.
- Completing a milestone writes/updates one active `client_milestones` row for that client/milestone.
- Completing a milestone writes `client_history_events` and `app_audit_events`.
- Completing a non-final milestone advances the current milestone to the next active configured milestone.
- Completing the final milestone shows a final/completed state without pretending there is a next milestone.
- Duration uses milestone start date to completion date.
- Time-to-hit uses onboarded date to completion date.
- Overridden dates are saved and reflected in timeline/history.

### Quick Update and New Client

- Quick Update completes the same current milestone as Client Detail.
- Quick Update shows the updated next milestone after save.
- New Client optional initial offer/milestone only lists active app-owned milestones for pilot/migrated companies.
- New Client still works when the user chooses `Set up later`.

### Migration gates

- For a newly migrated company, compare mirrored and app-owned offer counts.
- Compare mirrored and app-owned milestone counts by offer.
- Verify every active app-owned client current offer resolves to a company offer.
- Verify every active app-owned client current milestone resolves to a milestone under that current offer.
- Verify active app-owned clients do not point to archived config.
- Verify no active offer has duplicate active milestone positions.
- Verify secondary offer fields are inventoried and left untouched.

## Open Product Decisions

- Should Directors be allowed to reorder milestones when active clients are already in the offer, or should SuperAdmin approval be required? Directos should be able to reorder milestones indepdently of clients being already in an offer.
- Should milestone renames update only future labels, or should existing `client_milestones.metadata.mirrored_milestone_name` snapshots be rewritten for consistency? When we change a milestone to be renamed we can prompt the client to ask if they want to rename existing clients in that milestone or keep them as they are and only use it moving forward. This can mess up milestone filtering, so I am inclined to say this should always be applicable for every active client and maybe just leave "out" offboarded clients. I will let you chime in on this one.
- When a final milestone is completed, should the client remain on that milestone, move to a special completed state, or clear the current milestone? when a milestone is completed the user should be prompted to start the next milestone in line (or any other the user wants)
- Should archived offers be restorable with all milestones in one action, or should restore be item-by-item only? when an offer is restored all associated milestones should automatically be restored.
- What is the user-facing canonical term: `Pathway`, `Offer`, or `Journey`? It should be labeled Pathway, is a bettee term as offer can be confused with Front end Offer or backend offer (and we call those Programs in retainOS), so Pathway should be the right term moving forward.
