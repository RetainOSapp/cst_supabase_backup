-- Refresh the old CST global note search resource for the RetainOS
-- Clients > Notes search mode.

insert into public.resources (
  slug,
  title,
  type,
  description,
  content,
  loom_embed_url,
  status,
  is_dynamic,
  dynamic_key,
  sort_order,
  scope,
  company_legacy_id
)
values (
  'global-note-search-across-client-profiles',
  'Global note search across client profiles',
  'video',
  'RetainOS guide for searching current Next Steps and client history across the filtered client roster.',
  $_$Resource category: Working with Clients

Audience: CSM, Admin, Director, Support

Operational purpose: Find previous client notes, Next Steps, call summaries, and history entries without opening client profiles one by one.

RetainOS status: Live for app-owned pilot/migrated clients and mirrored legacy history. The RetainOS version is accessed from Clients > Notes, not from a hidden three-dot CST view switch.

When to use it:
- You remember sharing a resource, strategy, link, or recommendation but cannot remember which client it was for.
- You want to find every client where a topic was mentioned, such as webinar, book, referral, launch, guarantee, objection, hiring, or ads.
- You want to search your own book of business by applying the CSM filter first.
- You want to search a smaller segment, such as one offer, one status, one milestone, overdue renewals, stale contacts, or red/yellow health clients.

How to search:
- Open Clients.
- Apply any roster filters you want first.
- Click Apply filters.
- Switch the view mode to Notes.
- Enter at least two characters in Search Notes.
- Click Search.
- Review the matching notes and snippets.
- Click View to open the client profile behind the result.

What RetainOS searches:
- Current Next Steps on the client profile.
- App-owned client history events, including notes, Next Steps, summaries, and history titles.
- Call-summary / integration history where those summaries were written into client history.
- Migrated legacy CST history values where available, including old Next Steps, call tracker, renewal, program, contract, and North Star history entries.

How filters work:
- Notes search respects the same applied Clients filters as List, Cards, and Calendar.
- Client Name narrows which clients are searched.
- CSM and Secondary Assignee narrow ownership.
- Status, Offer, Milestone, Renewals, Last Contact, Next Contact, Success, Progress, Buy-In, and Advocacy filters narrow the client set before RetainOS searches notes.
- If a result is missing, clear filters and search again before assuming the note does not exist.

How to read results:
- Source badges explain where the match came from, such as Current Next Steps, Next Steps History, History Note, Call Summary, or Legacy Next Steps.
- The highlighted snippet shows the matching text in context.
- The date shows when the current/history entry was last recorded when that information is available.
- The client card shows the client and assigned CSM.
- View opens the client profile.

Migration QA checklist:
- Search a known word from a current Next Steps field and confirm the client appears.
- Search a known word from an old CST Next Steps history entry and confirm it appears as a legacy/history result when legacy history is available.
- Apply a CSM filter and confirm results are limited to that CSM's clients.
- Apply an Offer or Milestone filter and confirm results narrow correctly.
- Click View on a result and confirm it opens the correct client profile.
- Search with filters cleared if you are validating whether historical notes migrated at all.

Boundaries:
- Search is text-based keyword search today, not AI semantic search.
- It searches client notes/history sources, not every file or external document linked from a client.
- Director-only private profile notes are intentionally not the primary search surface for this workflow.
- Future versions could add AI-assisted semantic search, saved searches, direct deep-linking into the matching History event, and Beacon-powered Q&A over client history.

Related resources:
- Making a quick update in RetainOS.
- Using Next Steps well.
- Understanding client history in RetainOS.
- Filtering clients in RetainOS.
- AI-generated call summaries into client profiles.

Re-recording notes:
- Show Clients > Notes.
- Apply a CSM or Offer filter first, then search.
- Demonstrate a Current Next Steps result and a History / Legacy result if available.
- Click View to open the client.
- Explain that filters narrow the searched client set before RetainOS searches note content.
- Mention that this replaces the old CST "Switch to Next Step Search" table.$_$,
  'https://www.loom.com/share/28725bf410ac4c4d8c72065c5f439dc2',
  'draft',
  false,
  null,
  500,
  'retainos_help',
  null
)
on conflict (slug) do update set
  title = excluded.title,
  type = excluded.type,
  description = excluded.description,
  content = excluded.content,
  loom_embed_url = excluded.loom_embed_url,
  status = excluded.status,
  is_dynamic = excluded.is_dynamic,
  dynamic_key = excluded.dynamic_key,
  sort_order = excluded.sort_order,
  scope = excluded.scope,
  company_legacy_id = excluded.company_legacy_id,
  updated_at = now();
