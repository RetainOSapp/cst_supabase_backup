-- Add cross-offer milestone mismatch guidance after Dashboard QA.

update public.resources
set
  content = replace(
    content,
    '- Missing legacy milestone references appear as Unknown milestone with a shortened ID so Admins can identify data cleanup needs without exposing raw IDs as the main label.',
    '- Missing legacy milestone references appear as Unknown milestone with a shortened ID so Admins can identify data cleanup needs without exposing raw IDs as the main label.
- If a client has a current milestone that belongs to a different offer/pathway than their current offer, RetainOS resolves the milestone name and labels it as from another offer. That usually means the client profile needs pathway/milestone cleanup.'
  ),
  updated_at = now()
where slug = 'milestone-progress-breakdown-by-offer';
