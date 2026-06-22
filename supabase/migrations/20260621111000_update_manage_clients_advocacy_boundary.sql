-- Correct the CSM orientation resource now that Advocacy & Growth controls are live.

update public.resources
set
  content = replace(
    content,
    '- Dedicated Testimonial, Review, and Referral asked/received controls from the old CST walkthrough are not live yet as write controls. For now, use health filters to identify candidates and track follow-up through Next Steps or Tasks until the client advocacy outcome fields ship.',
    '- Advocacy & Growth controls are live for app-owned clients. Use them in Quick Update or Client Detail > Outcomes to track Review, Testimonial, Referral, and Renewal / Upsell asks and received wins.'
  ),
  updated_at = now()
where slug = 'how-to-manage-clients';
