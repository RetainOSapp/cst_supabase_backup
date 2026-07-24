# Call Intelligence V1 Evaluation Report

Date: 2026-07-24  
Status: baseline and evidence-v1 retest complete; evidence-v2 retest pending approval
Production impact: none

## Corpus and execution

- Five user-supplied Fathom/Zapier calls, 253,045 transcript characters.
- Corpus and raw provider results remain under `.call-intelligence-private/`
  and are ignored by Git.
- Model: `gpt-5.6-terra`.
- Reasoning: `medium`.
- Price lineage: `openai-standard-2026-07-23`.
- 40 immutable Glide `legacy_v1` requests plus five structured V2 requests.
- 45/45 provider requests completed.
- Actual combined cost: 1,849,210 micros ($1.849210).
- Conservative approved ceiling: $5.26.

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

## Evidence-v2 correction

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
- permits a unique first-name match while forcing genuinely unmapped or
  ambiguous speakers to `unknown`;
- uses a supported strict-schema regex to require 4–12 whitespace-separated
  words, rather than relying on prompt compliance alone;
- rejects evidence whose claimed role does not match the mapped speaker at the
  cited timestamp;
- keeps the migration seed synchronized mechanically with the runtime prompt
  and schema.

The schema constraint follows OpenAI's documented Structured Outputs support
for the string `pattern` property:
https://developers.openai.com/api/docs/guides/structured-outputs#supported-schemas

The evidence-v2 structured-only dry run plans five provider requests with a
conservative maximum of 1,123,498 micros ($1.13 rounded). It has not been
executed.

## Decision

Do not promote either completed run. Run the five-call evidence-v2
structured-only retest.
Promotion requires:

1. 5/5 schema-valid results;
2. 100% timestamp-scoped quote grounding and speaker-role attribution;
3. 5/5 hard passes;
4. acceptable sentiment, score, pain-point, next-step, and archetype review by
   Jay;
5. no automatic client-profile, Notes, or Next Steps writes.
