-- Canonicalize app-owned client archetypes to the RetainOS dropdown labels.

update public.clients
set client_archetype_value = case lower(trim(client_archetype_value))
  when 'doer' then 'Doer'
  when 'controller' then 'Controller'
  when 'worrier' then 'Worrier'
  when 'follower' then 'Follower'
  else null
end
where client_archetype_value is not null
  and (
    trim(client_archetype_value) = ''
    or lower(trim(client_archetype_value)) in (
      'doer',
      'controller',
      'worrier',
      'follower'
    )
  );
