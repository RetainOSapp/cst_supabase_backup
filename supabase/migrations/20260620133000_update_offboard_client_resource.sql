-- Refresh the RetainOS Help draft for offboarding clients after the
-- RetainOS actual-end-date and churn classification flow was added.

update public.resources
set
  title = 'How to offboard a client',
  type = 'video',
  description = 'Guide CSMs and Directors through RetainOS client offboarding, including actual end date, churn classification, churn reason, notes, and offer-fit capture.',
  content = $_$Resource category: Working with Clients

Audience: CSM, Director, Admin

Operational purpose: Move a client out of active delivery while preserving the data RetainOS needs for churn reporting, offer-fit review, history, and audit.

RetainOS flow:
- Open the client profile.
- In the Program section, choose Change Status.
- Set New Status to Offboarded.
- Enter the client's actual end date. Use the real end date, even if the update is being recorded later.
- RetainOS compares the actual end date to the current contract end date and shows one of three classifications:
  - Churned when the actual end date is before the contract end date.
  - Completed - did not churn when the client reached or passed the contract end date.
  - Needs review when no contract end date is available.
- If the client churned, choose the churn reason and add churn notes explaining the context.
- Choose whether the client was a good fit for the offer.
- Click Finalize Offboarding.

What RetainOS saves:
- Program status becomes Offboarded.
- Actual offboard date is saved on the client record.
- Churn reason and churn notes are saved when the client churned.
- Offer-fit answer, churn status, contract end date used for classification, and recorder metadata are saved in the client offboarding metadata.
- A client history event and audit event are created for the status change.

RetainOS review note: This replaces the old Glide CST offboarding walkthrough. Re-record the Loom after Jay QA confirms the RetainOS offboarding modal and reporting behavior.$_$,
  loom_embed_url = 'https://www.loom.com/share/ef3f3d322ed74a6e9a674de780a83b1d',
  status = 'draft',
  is_dynamic = false,
  dynamic_key = null,
  scope = 'retainos_help',
  company_legacy_id = null,
  updated_at = now()
where slug = 'how-to-offboard-a-client';
