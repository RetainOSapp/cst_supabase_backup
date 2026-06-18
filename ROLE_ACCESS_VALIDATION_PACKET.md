# Role Access Validation Packet

Created: 2026-06-17

Purpose: validate migration-critical access for SuperAdmin, Director, Support,
CSM, and Viewer before Moves Method or another external company cutover.

This packet is the QA checklist and code-audit map. Use it with
`OFFICIAL_COMPANY_ROLLOUT_CHECKLIST.md` during internal migration QA.

## Code Source Of Truth

- Role resolution: `src/lib/accountContext.tsx`
- Route gating: `src/App.tsx`
- Sidebar visibility: `src/components/Header.tsx`
- Client roster scoping: `src/pages/Clients.tsx`
- Client detail scoping and write controls: `src/pages/ClientDetail.tsx`
- Dashboard scoping: `src/pages/Dashboard.tsx`
- CSM Reports scoping: `src/pages/CsmReports.tsx`
- Daily Pulse scoping: `src/pages/DailyPulse.tsx`
- Tasks scoping: `src/pages/Tasks.tsx`
- Admin Hub / company settings / integrations: `src/pages/SaasClientDetail.tsx`
- Resources visibility: `src/pages/Resources.tsx`
- Server-side write authorization: `supabase/functions/manage-*`

## Role Mapping

| Role | Source |
| --- | --- |
| SuperAdmin | Email in `VITE_SUPER_ADMIN_EMAILS` / `SUPER_ADMIN_EMAILS` |
| Director | `role = director` in `company_members`, or mirror `role_id = 1` |
| Support | `role = support` in `company_members`, or mirror `role_id = 2` |
| CSM | `role = csm` in `company_members`, or mirror `role_id = 3` |
| Viewer | `is_read_only = true`, `role = viewer`, or mirror `role_read_only_user = true` |

## Capability Matrix From Code

| Area / action | SuperAdmin | Director | Support | CSM | Viewer |
| --- | --- | --- | --- | --- | --- |
| Company switcher / View As | Yes | No | No | No | No |
| SaaS Clients | Yes | No | No | No | No |
| Dev tables / sync logs | Yes | No | No | No | No |
| Dashboard | Yes | Yes | Yes | Assigned only | Read-only KPIs/charts |
| Dashboard AI Insights tab | Yes | Yes | No | No | No |
| CSM Reports | Yes | Yes | Yes | No | No |
| Daily Pulse | Yes | Yes | Yes | Assigned only | Yes |
| Clients list | Yes | Yes | Yes | Assigned only | Yes |
| Client detail | Yes | Yes | Yes | Assigned only | Yes |
| Quick Update | Yes | Yes | Yes | Assigned only | No |
| Edit client profile | Yes | Yes | Yes | Assigned only | No |
| Director Notes visible/editable | Yes | Yes | No | No | No |
| Contracts create/edit/archive | Yes | Yes | Yes | Assigned only | No |
| Contracts delete | Yes only | No | No | No | No |
| Outcomes update | Yes | Yes | Yes | Assigned only | No |
| Start/complete milestones | Yes | Yes | No | Assigned only | No |
| Change client pathway | Yes | Yes | No | No | No |
| Tasks page | Yes | Yes | Yes | Assigned only | No |
| Create task | Yes | Yes | Yes | Assigned/own scope | No |
| Admin Hub | Yes | Yes | No | No | No |
| Team management | Yes | Yes | No | No | No |
| Company customization/settings | Yes | Yes | No | No | No |
| Integration token list/create/revoke | Yes only | No | No | No | No |
| Resources | Yes | Yes | Yes | Yes | Yes |
| RetainOS Help drafts visible | Yes | No | No | No | No |
| Company Resource drafts visible | Yes | Yes | No | No | No |
| Resource create/edit | Yes | No | No | No | No |
| Beacon local pilot | Yes only, intentionally uncommitted | No | No | No | No |

## Server-Side Write Guard Audit

| Function family | Server roles allowed | CSM assignment check | Notes |
| --- | --- | --- | --- |
| `manage-client-create` | SuperAdmin, Director, Support, CSM | CSM-created clients assign to that CSM | Viewer excluded |
| `manage-client-profile` | SuperAdmin, Director, Support, CSM | CSM can edit assigned/secondary-assigned clients only | Director Notes only SuperAdmin/Director |
| `manage-client-quick-update` | SuperAdmin, Director, Support, CSM | CSM assigned/secondary-assigned only | Viewer excluded |
| `manage-client-outcomes` | SuperAdmin, Director, Support, CSM | CSM assigned/secondary-assigned only | Viewer excluded |
| `manage-client-status` / `manage-client-offboard` | SuperAdmin, Director, Support, CSM | CSM assigned/secondary-assigned only | Viewer excluded |
| `manage-client-contract` | SuperAdmin, Director, Support, CSM | CSM assigned/secondary-assigned only | Delete is SuperAdmin-only |
| `manage-client-milestone` | SuperAdmin, Director, CSM | CSM assigned/secondary-assigned only | Pathway changes require SuperAdmin/Director |
| `manage-client-task` | SuperAdmin, Director, Support, CSM | CSM assigned/secondary-assigned only when linked to client | Viewer excluded |
| `manage-company-member` | SuperAdmin, Director | Not applicable | Company team/admin only |
| `manage-company-customization` | SuperAdmin, Director | Not applicable | Company config only |
| `manage-company-pathway` | SuperAdmin, Director | Not applicable | Company config only |
| `manage-integration-token` | SuperAdmin only | Not applicable | Token values returned once |
| `manage-integration-review` | SuperAdmin, Director | Not applicable | Support intentionally excluded |
| Inbound webhooks | Company integration token or global fallback secret | Not user-role based | Token management is SuperAdmin-only |

## QA Checklist

Use one known user per role. For SuperAdmin, also test with View As set to the
migrated company.

| Check | SuperAdmin | Director | Support | CSM | Viewer | Evidence |
| --- | --- | --- | --- | --- | --- | --- |
| Login succeeds and resolves the expected role label | Not started | Not started | Not started | Not started | Not started | Screenshot / note |
| Sidebar shows only allowed nav items | Not started | Not started | Not started | Not started | Not started | Screenshot |
| Direct URL to disallowed pages shows "You do not have access here" | Not started | Not started | Not started | Not started | Not started | Routes tested |
| Clients list loads correct company scope | Not started | Not started | Not started | Not started | Not started | Count / screenshot |
| CSM only sees assigned or secondary-assigned clients | N/A | N/A | N/A | Not started | N/A | Spot-check 2 clients |
| Viewer sees Clients but no Quick Update buttons | N/A | N/A | N/A | N/A | Not started | Screenshot |
| Client detail blocks CSM direct URL to unassigned client | N/A | N/A | N/A | Not started | N/A | Error text |
| Director Notes visible only to SuperAdmin/Director | Not started | Not started | Not started | Not started | Not started | Screenshot |
| Quick Update appears for working roles and saves only where allowed | Not started | Not started | Not started | Not started | N/A | History event |
| Client profile edit respects assignment and Director Notes rules | Not started | Not started | Not started | Not started | N/A | Saved event / denied case |
| Contract create/edit/archive works for working roles | Not started | Not started | Not started | Not started | N/A | Test contract |
| Contract delete appears only for SuperAdmin | Not started | Not started | Not started | Not started | N/A | Screenshot |
| Milestone complete/start works for SuperAdmin, Director, assigned CSM | Not started | Not started | N/A | Not started | N/A | History/event |
| Pathway change appears only for SuperAdmin/Director | Not started | Not started | Not started | Not started | N/A | Screenshot |
| Dashboard company-wide vs assigned-client/read-only scope is correct | Not started | Not started | Not started | Not started | Not started | Counts / filters |
| AI Insights tab only appears for SuperAdmin/Director | Not started | Not started | Not started | Not started | N/A | Screenshot |
| CSM Reports accessible to SuperAdmin/Director/Support only | Not started | Not started | Not started | Not started | Not started | Route check |
| Daily Pulse respects CSM assignment scope | Not started | Not started | Not started | Not started | Not started | Count / screenshot |
| Tasks page hidden from Viewer and scoped for CSM | Not started | Not started | Not started | Not started | Not started | Route + task count |
| Admin Hub accessible only to SuperAdmin/Director | Not started | Not started | Not started | Not started | Not started | Route check |
| Team management works only for SuperAdmin/Director | Not started | Not started | N/A | N/A | N/A | Add/edit/archive test |
| Company customization/settings save only for SuperAdmin/Director | Not started | Not started | N/A | N/A | N/A | Save event |
| Integration tokens list/create/revoke only for SuperAdmin | Not started | N/A | N/A | N/A | N/A | Token panel |
| Resources list visible to all roles | Not started | Not started | Not started | Not started | Not started | Screenshot |
| RetainOS Help drafts visible/editable only for SuperAdmin | Not started | Not started | Not started | Not started | Not started | Screenshot |
| Company Resource drafts visible to Director but editable only by SuperAdmin | Not started | Not started | Not started | Not started | Not started | Screenshot |

## Decisions Applied

1. Viewer dashboard access:
   - Viewers can access Dashboard.
   - Viewer KPI cards and chart segments are not clickable.
   - Viewer cannot open dashboard client-name drilldowns or search client names.

2. Support Admin Hub decision:
   - Current code keeps Support out of Admin Hub and company settings.
   - Decision: keep Support operational-only for Moves Method.

3. Integration review:
   - Support cannot see or use integration review.
   - `manage-integration-review` now allows only SuperAdmin and Director.
   - Deployed to Supabase project `zjauqflzxzsbpnivzsct` on 2026-06-17.

4. Resource draft visibility:
   - Resources are visible to all company roles once published.
   - RetainOS Help drafts are SuperAdmin-only.
   - Company Resource drafts are visible to Directors for their company.
   - Resource creation/editing remains SuperAdmin-only.

## Close Conditions

- Jay decision pass was completed on 2026-06-17.
- Code audit and implementation pass completed on 2026-06-17.
- `npm run build` passed.
- `manage-integration-review` was deployed after narrowing Support access.
- Future company cutover QA should still spot-check each role with the matrix
  above, but the roadmap role-access policy item is closed.
