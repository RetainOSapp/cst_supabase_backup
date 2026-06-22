-- Refresh the Next Steps resource as a concise usage/best-practice guide
-- rather than another full Quick Update walkthrough.

update public.resources
set
  title = 'Using Next Steps well',
  type = 'video',
  description = 'RetainOS guide for writing useful Next Steps that preserve client context, action items, and follow-up plans.',
  content = $_$Resource category: Working with Clients

Audience: CSM, Admin, Director, Support

Operational purpose: Help CSMs write Next Steps in a way that makes the next client interaction easier, keeps context visible, and prevents clients from falling through the cracks.

RetainOS status: Live for app-owned pilot/migrated clients. Next Steps can be updated from Quick Update, from Client Detail > Program > Update Next Steps/Contact, and through the Call Summary / Next Steps webhook when configured.

How to think about Next Steps:
- Next Steps is the operational handoff for the next interaction.
- It should capture what just happened, what matters now, what the client should do next, and what the CSM should follow up on.
- It is not meant to replace every note, task, transcript, or call summary. Use Notes for broader context and Tasks when a specific to-do needs an owner and due date.

What a good Next Steps entry includes:
- Brief interaction context: call, Slack thread, async check-in, support message, or review.
- Client state: wins, blockers, frustration, confidence, risk, or momentum.
- Agreed action items: what the client is doing before the next touchpoint.
- CSM follow-up: what the CSM needs to check, send, prepare, or escalate.
- Next contact plan: when the next call or outreach should happen.

Example structure:
- Had a call today about lead generation. Client is frustrated with slow progress but acknowledged they were away for two weeks and did not implement the previous campaign changes.
- Before the next call, client will launch a Facebook ads campaign with a $20/day budget.
- Next call is Wednesday, July 5 at 3pm ET. Review campaign setup, early lead quality, and whether support is needed.

Where to update Next Steps:
- Use Quick Update when you are logging an interaction and also want to refresh contact dates, health signals, custom fields, pathway progress, or advocacy.
- Use Client Detail > Program > Update Next Steps/Contact when you only need to update Next Steps, Date of Last Contact, and Date of Next Contact.
- Use the Call Summary / Next Steps webhook for automated summaries from Fathom or another call tool.

History and accountability:
- RetainOS saves Next Steps updates into client history when they are updated through Quick Update or the Program update action.
- History lets the team see previous entries, dates, and who made the update.
- Use history when you need to understand the client relationship, previous commitments, or why the current plan changed.

Best practices:
- Keep the newest entry useful without requiring someone to read the entire history.
- Write in plain language a teammate could act on if they inherited the client tomorrow.
- Include the next date or follow-up rhythm whenever possible.
- Separate action-oriented Next Steps from long-form notes. If the entry is getting too long, put broader context in Notes and keep Next Steps focused on the next move.
- If an item needs a hard due date or assignee, create a Task instead of burying it only in Next Steps.

Related resources:
- Making a quick update in RetainOS.
- Tracking client contact cadence.
- Understanding and updating a client profile.
- AI-generated call summaries into client profiles.

Re-recording notes:
- Keep this short and focused on writing quality.
- Do not re-record the full Quick Update workflow here.
- Show one realistic before/after Next Steps example.
- Show that the entry appears in the client profile and is captured in History.
- Mention that Date of Next Contact and Tasks should be used when the follow-up needs scheduling or ownership.$_$,
  loom_embed_url = 'https://www.loom.com/share/45273309c9be4c89af3fe33d9f662b6d',
  status = 'draft',
  is_dynamic = false,
  dynamic_key = null,
  scope = 'retainos_help',
  company_legacy_id = null,
  updated_at = now()
where slug = 'using-the-next-steps-feature';
