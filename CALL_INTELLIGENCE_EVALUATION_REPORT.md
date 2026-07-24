# Call Intelligence V1 Evaluation Report

Date: 2026-07-24  
Status: quality-v3 remediation complete locally; focused paid retest pending approval
Production impact: none

## Corpus and execution

- Five user-supplied Fathom/Zapier calls, 253,045 transcript characters.
- Corpus and raw provider results remain under `.call-intelligence-private/`
  and are ignored by Git.
- Model: `gpt-5.6-terra`.
- Reasoning: `medium`.
- Price lineage: `openai-standard-2026-07-23`.
- 55/55 provider requests completed across the baseline and two focused
  corrections, with no retries in either correction run.
- Total actual evaluation spend: 2,592,327 micros ($2.592327).
- All raw transcripts, provider outputs, and the deterministic replay remain
  private and Git-ignored.

## Legacy versus structured baseline

| Metric | Eight-prompt legacy V1 | One-pass structured V2 | Change |
| --- | ---: | ---: | ---: |
| Requests | 40 | 5 | 87.5% fewer |
| Input tokens | 519,949 | 71,958 | 86.2% fewer |
| Output tokens | 12,343 | 12,286 | 0.5% fewer |
| Cost | $1.485023 | $0.364187 | 75.5% lower |
| Cumulative provider latency | 189.068s | 98.270s | 48.0% lower |
| Schema-valid calls | N/A | 5/5 | 100% |

Structured V2 demonstrates the intended economic advantage: one provider pass
produces the full result for roughly one quarter of the eight-prompt legacy
cost, with far less repeated transcript input.

## Promotion result

The baseline does **not** pass production promotion:

- JSON/schema validity: 5/5.
- Exact quote found somewhere in the transcript: 180/197 (91.4%).
- Exact quote found inside the cited timestamp utterance: 146/197 (74.1%).
- Calls with every evidence item grounded at its timestamp: 0/5.
- Hard promotion pass: 0/5.

The failures include stitched excerpts, omitted interior words, quotes attached
to the wrong timestamp, and a smaller number of materially unsupported excerpts.
Near-exact wording is still a failure because the product labels these values
as transcript evidence.

The private corpus currently has no human-authored expected labels, so it proves
schema, evidence, usage, latency, and cost behavior but does not independently
prove subjective sentiment/archetype quality. Jay's pilot QA remains required.

## Evidence-v1 retest

The approved five-call structured-only retest completed with exactly five
provider requests, no retries, and $0.372006 actual cost against the $1.13
rounded ceiling.

| Metric | Result |
| --- | ---: |
| Input tokens | 73,646 |
| Output tokens | 12,526 |
| Reasoning tokens | 6,984 |
| Cumulative provider latency | 142.242s |
| Timestamp-grounded unique evidence | 55/67 (82.1%) |
| Correctly attributed unique evidence | 42/67 (62.7%) |
| Fully accepted calls | 0/5 |

All five results were rejected by the runtime quote and attribution gates. One
also failed a result-field check because two evidence occurrences contained 14
words despite the prompt's 12-word maximum. Aggregate corpus analysis found 14
unique transcript speaker labels: 11 exactly matched calendar participants, one
was a safe unique first-name match, and two were genuinely absent and therefore
must remain `unknown`. Terra inferred client/team roles for some unknown labels
instead of preserving `unknown`.

## Evidence-v2 correction and final pipeline result

`structured_v2_evidence_v2` now:

- allows at most one evidence item per claim;
- asks for one uninterrupted 4–12-word excerpt from one utterance;
- forbids stitching, paraphrasing, grammar repair, ellipses, and cross-speaker
  combinations;
- tells the model to use an empty evidence array instead of an uncertain quote;
- limits quote size to 120 characters and validates 4–12 normalized words;
- verifies every quote occurs inside the exact cited timestamp context before a
  run can succeed;
- derives an explicit transcript-speaker-to-role map from sanitized matched
  participant records, never emails or internal IDs;
- presents the transcript as explicit timestamped utterance records and requires
  each evidence timestamp, role, and quote to come from the same record;
- permits a unique first-name match while forcing genuinely unmapped or
  ambiguous speakers to `unknown`;
- uses a supported strict-schema regex to require 4–12 whitespace-separated
  words, rather than relying on prompt compliance alone;
- rejects evidence whose claimed role does not match the mapped speaker at the
  cited timestamp;
- keeps the migration seed synchronized mechanically with the runtime prompt
  and schema.

The schema constraint follows OpenAI's documented Structured Outputs support
for the string [`pattern` property](https://developers.openai.com/api/docs/guides/structured-outputs#supported-schemas).

The approved evidence-v2 run completed five provider requests with no retries
for $0.371111, below its $1.18 ceiling.

| Metric | Raw evidence-v2 result |
| --- | ---: |
| Input tokens | 88,852 |
| Output tokens | 9,932 |
| Reasoning tokens | 4,752 |
| Cumulative provider latency | 94.168s |
| Timestamp-grounded and correctly attributed evidence | 65/67 (97.0%) |
| Raw hard-passing calls | 3/5 |

The two rejected citations were unsupported model output, and a third citation
violated the 4–12-word evidence contract. The production pipeline now fails
closed at the optional-evidence-item boundary: it removes malformed,
timestamp-ungrounded, or role-misattributed citations, never edits or repairs
the model text, and still rejects any invalid required analysis field.

A zero-provider-call deterministic replay through that sanitizer and validator
first produced 5/5 technical hard passes. A separate transcript-level quality
review then found that two calls contained conflicting participant identities:
the model correctly fell back to `unknown`, but those outputs were not useful
enough for ownership or score review. It also found one factually supported
next step whose citation failed the evidence contract, and two overconfident
archetypes.

## Quality-v3 remediation

`structured_v2_quality_v3` now:

- quarantines calls with exact-name or transcript-relevant first-name
  client/team role collisions before any provider request;
- sends quarantined calls to reconciliation and cancels the queued run with a
  non-sensitive error category;
- requires one structurally valid, grounded, correctly attributed citation for
  every returned next step or omits the entire next step; semantic
  owner/action/date review remains a human quality gate;
- permits a named archetype only with high confidence and two distinct
  behavioral moments; otherwise it safely suppresses the label to
  `insufficient_evidence`;
- includes synthetic participant-collision and adversarial prompt-injection
  boundary coverage.

A second zero-provider-call replay through the quality-v3 production gates
produced:

| Metric | Quality-v3 deterministic replay |
| --- | ---: |
| Eligible / quarantined calls | 3 / 2 |
| Schema-valid eligible calls | 3/3 |
| Hard-passing eligible calls | 3/3 |
| Retained evidence grounded and correctly attributed | 44/44 (100%) |
| Unsupported evidence / claim removed | 2 / 1 |
| Weak archetypes suppressed | 2 |
| Provider requests / added cost | 0 / $0 |

Relative to the eight-prompt legacy flow, final evidence-v2 used 82.9% fewer
input tokens, 19.5% fewer output tokens, cost 75.0% less, and had 50.2% lower
cumulative provider latency.

## Subjective quality review

The private review found calls 1–3 useful and faithful overall, with strong
summary, signal, and pain-point selection and no critical unsupported claim.
Calls 4–5 were blocked by the participant-role collision described above. Call
scores were plausible for calls 1–3 but unreliable for the collided calls.
No prompt-injection attempt appeared in the five real calls, so the existing
synthetic adversarial case is coverage, not yet a provider-level resistance
result.

## Decision

Do not promote yet. The known quality blockers are remediated locally and the
zero-cost replay proves that the deterministic gates behave as intended, but
the new quality-v3 prompt and schema have not received fresh provider output.
Before promotion:

1. approve and run a three-call quality-v3 structured-only retest; the two
   collided calls must be quarantined with zero provider cost;
2. run the synthetic adversarial prompt-injection case through the provider;
3. review those private outputs for summary, sentiment, next steps, score, and
   conservative archetype quality;
4. separately approve the disabled-first production pilot.

The combined dry-run ceiling for steps 1–2 is 936,559 micros ($0.94 rounded):
753,051 micros for the three eligible private calls and 183,508 micros for the
single synthetic adversarial call.
