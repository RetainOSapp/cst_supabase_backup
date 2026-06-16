# CSV Bulk Import / Export Safety Net

Local implementation status: export plus preview-before-import is wired on `/clients`.

## Scope

- Export is available for the selected company and current roster filters.
- Mirror-only companies are export/template only.
- Import is only shown when the selected company already supports app-owned New Client writes.
- Import uses `manage-client-create`; the browser does not write directly to app-owned tables.
- Every import requires an uploaded CSV, preview validation, and an explicit `Import Valid Rows` click.

## Template Columns

```csv
client_name,client_email,client_business,client_phone,program_status,date_onboarded,csm_id,csm_name,csm_email,offer_id,offer_name,contract_start_date,contract_end_date,contract_monthly_value,contract_notes,client_archetype,north_star,next_steps,director_notes,notes,customfield1,customfield2,customfield3,customfield4,customfield5,customfield6,customfield7
```

## Import Mapping

Currently imported through `manage-client-create`:

- `client_name`
- `client_email`
- `client_business`
- `program_status`
- `date_onboarded`
- CSM assignment by `csm_id`, `csm_email`, or `csm_name`
- Offer/pathway by `offer_id` or `offer_name`
- `contract_start_date`
- `contract_end_date`
- `client_archetype`
- `north_star`

Previewed/exported but not imported yet:

- phone
- contract monthly value
- contract notes
- next steps
- director notes
- notes
- customfield1 through customfield7

## Guardrails

- Unknown program/status blocks that row.
- Unknown CSM blocks that row unless the importer is an assigned-CSM user, where the server assigns the actor.
- Unknown offer/pathway blocks that row.
- Invalid date values block that row.
- Rows with warnings can still import, but warned fields are not written yet.
- Server authorization remains the final gate for every created client.

## Jay QA Checklist

- Export a mirror-only company and confirm no import button appears.
- Export Ethical Scaling with filters applied and confirm exported rows match the filtered roster, not only the visible page.
- Download the template and fill three rows: one valid, one unknown CSM, one invalid date.
- Upload the file and confirm preview counts show one ready row and blocked rows with clear messages.
- Click `Import Valid Rows` and confirm only the valid client is created.
- Confirm the created client appears in Clients and Client Detail with name, email/business, status, CSM, onboarded date, offer, contract start/end, archetype, and North Star where provided.
- Confirm fields marked as preview-only were not silently written.
