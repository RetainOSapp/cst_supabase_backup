-- Refine the milestone breakdown edge-case language after dashboard QA:
-- cross-offer milestone references are shown as a cleanup bucket, not as the
-- foreign milestone's name.

update public.resources
set
  content = replace(
    content,
    '- If a client has a current milestone that belongs to a different offer/pathway than their current offer, RetainOS resolves the milestone name and labels it as from another offer. That usually means the client profile needs pathway/milestone cleanup.',
    '- If a client has a current milestone that does not belong to the selected offer/pathway, RetainOS groups that client under Milestone mismatch. That usually means the client profile needs pathway/milestone cleanup.'
  ),
  updated_at = now()
where slug = 'milestone-progress-breakdown-by-offer';
