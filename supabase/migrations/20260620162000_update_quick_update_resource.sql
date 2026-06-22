-- Refresh the RetainOS Help draft for Quick Update after auditing the old
-- text-only CST guide against the current RetainOS interaction modal.

update public.resources
set
  title = 'Making a quick update in RetainOS',
  type = 'video',
  description = 'RetainOS guide for logging a client interaction, updating contact cadence, outcomes, custom fields, and current milestone progress from the Clients page.',
  content = $_$Resource category: Working with Clients

Audience: CSM, Admin, Director, Support

Operational purpose: Use Quick Update after a client interaction to keep the client profile current without opening every full profile section.

RetainOS status: Quick Update is live for app-owned pilot/migrated companies. Mirror-only CST data remains read-only until the company is migrated.

Where to start:
- Go to Clients.
- Find the client using search, filters, list view, card view, or calendar view.
- Click Quick Update on the client row/card.
- Review the context cards at the top of the modal before editing.

What the context cards show:
- North Star.
- Current Next Steps.
- Date of Last Contact.
- Date of Next Contact.

What Quick Update can update:
- Next Steps: what the client should work on next.
- Notes: extra context from the latest interaction.
- Date of Last Contact: when the latest client interaction happened.
- Date of Next Contact: when the next follow-up should happen.
- Success: whether the client is currently successful according to the company's outcome options.
- Progress: the client's current progress health signal.
- Buy In: the client's current buy-in health signal.
- Custom fields: any active company-level client custom fields that should be updated repeatedly.
- Pathway progress: complete the client's current milestone and optionally start the next or another active milestone.

What Quick Update does not replace:
- Changing the client's pathway/offer belongs in Client Detail > Pathways & Milestones.
- Editing North Star, profile details, links, Director Notes, contract data, or offboarding details belongs in the full client profile.
- Call attendance is still future scope; do not record this resource as if call attendance is already in Quick Update.

How to save a normal interaction:
- Open Quick Update for the client.
- Update Next Steps if the client's next focus changed.
- Add Notes when the conversation context should be preserved in history.
- Set Date of Last Contact to the interaction date.
- Set Date of Next Contact if the next follow-up is known.
- Update Success, Progress, and Buy In only when those signals changed or should be refreshed.
- Update any relevant custom fields.
- Click Save Quick Update.

How to update milestone progress:
- Open Quick Update for the client.
- Review the Current pathway / milestone block.
- Choose the Completion Date.
- Click Complete current milestone when the client has completed that milestone.
- If the next milestone should start immediately, enable Start another milestone after completing this one.
- Select the milestone to start and the Start Date.
- Save the milestone action.

What RetainOS saves:
- The current client profile fields are updated.
- A Quick Update event is saved to client history.
- Outcome values and dates are refreshed when updated.
- Custom field values are saved to the app-owned custom field records.
- Milestone completion/start actions update pathway progress and write audit/history context.
- Profile upkeep scoring can use Quick Update history as proof that the profile is being maintained.

Permissions and data state:
- SuperAdmin, Director, Support, and assigned CSM users can use Quick Update where permitted.
- CSM users can quick update assigned clients only.
- Viewers do not see Quick Update.
- Mirror-only companies show a read-only preview until migrated into app-owned RetainOS data.

How RetainOS improves on the old CST text guide:
- The old CST guide focused on a yellow lightning bolt and a short list of fields.
- RetainOS makes Quick Update a structured interaction log with context cards, contact cadence, health/outcome signals, custom fields, history, and milestone progression.
- RetainOS intentionally keeps pathway/offer reassignment in the full client profile so CSMs do not accidentally change a client's program while logging a fast interaction.

Re-recording notes:
- Record this from the Clients page.
- Show opening Quick Update from both the list/card context if helpful.
- Show the context cards first so users understand what they are reviewing.
- Demonstrate a realistic interaction update: Next Steps, Notes, Last Contact, Next Contact, Progress, Buy In, and one custom field.
- Demonstrate completing the current milestone and starting the next milestone.
- Mention that pathway/offer changes are handled from Client Detail > Pathways & Milestones, not Quick Update.$_$,
  loom_embed_url = null,
  status = 'draft',
  is_dynamic = false,
  dynamic_key = null,
  scope = 'retainos_help',
  company_legacy_id = null,
  updated_at = now()
where slug = 'how-to-make-a-quick-update';
