-- Clarify that client profile images can now be uploaded during manual
-- creation, while still allowing pasted image URLs.

update public.resources
set
  content = replace(
    content,
    'Add optional profile context: business name, email, profile image URL, status, onboarding date, archetype, North Star, and next steps.',
    'Add optional profile context: business name, email, profile image upload or image URL, status, onboarding date, archetype, North Star, and next steps.'
  ),
  updated_at = now()
where slug = 'add-clients-manually';
