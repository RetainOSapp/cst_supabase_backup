-- Refresh the RetainOS Help draft for configuring offers/pathways and milestones
-- after confirming the RetainOS Pathways & Milestones admin flow.

update public.resources
set
  title = 'How to customize milestones and offers',
  type = 'video',
  description = 'Admin guide for configuring RetainOS pathways, offers, milestone order, target timing, and archive/restore behavior.',
  content = $_$Resource category: Setup & Onboarding

Audience: Admin, Director, SuperAdmin

Operational purpose: Configure the company's primary offer/pathway structure and the ordered milestones clients move through during delivery.

RetainOS terminology:
- Glide called these Offers and Milestones.
- RetainOS surfaces the same setup as Pathways & Milestones because each offer represents the client journey/pathway for that offer.

RetainOS flow:
- Go to Admin Hub for the company, or open the SaaS Client Detail as SuperAdmin.
- Open the Pathways & Milestones tab.
- Click + New Pathway to create a new offer/pathway.
- Enter the pathway name and save.
- Find the pathway in the list and click + Milestone.
- Enter the milestone name.
- Optionally set target days to complete, Time to Value, and Final milestone.
- Save the milestone.
- Use Edit on a pathway or milestone to rename it or adjust milestone settings.
- Use the up/down arrow controls to reorder active milestones inside a pathway.
- Use Archive instead of delete when a pathway or milestone is no longer used.
- Restore archived pathways or milestones from the archived sections when needed.

RetainOS guardrails:
- Mirror-only companies are read-only. Editing unlocks when the company is in RetainOS write mode.
- Archive is blocked when active clients are currently assigned to that pathway or milestone.
- Archiving a pathway also archives its milestones.
- Restoring a pathway restores its associated milestones.
- Restoring an individual milestone appends it to the end of the active order.

Re-recording notes:
- Show the Pathways & Milestones tab rather than the old Glide More > Admin path.
- Say Pathway/Offer once at the start so existing CST users understand the terminology change.
- Show + New Pathway, + Milestone, Edit, Archive, Restore, and the up/down reorder controls.
- Do not describe hard delete; RetainOS uses archive/restore for safer reporting history.$_$,
  loom_embed_url = 'https://www.loom.com/share/5b5151c6a03a429197099887774c06ee',
  status = 'draft',
  is_dynamic = false,
  dynamic_key = null,
  scope = 'retainos_help',
  company_legacy_id = null,
  updated_at = now()
where slug = 'customize-milestones-offers';
