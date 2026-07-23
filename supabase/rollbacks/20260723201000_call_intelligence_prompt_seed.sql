-- Safe only while no run references these prompt snapshots.

delete from public.call_intelligence_prompt_definitions
where version in ('legacy_v1', 'structured_v2')
  and (
    scope = 'fixed'
    or prompt_key in (
      'stress_test',
      'sales_coach',
      'filler_words',
      'onboarding',
      'renewal',
      'escalation',
      'client_buyin_detectors'
    )
  );
