# Jev comparison harness (T31)

No live Jev call was made for this PR. Vidyut runs the comparison on his machine,
with his key and his go. Do not use the private held-out set before its frozen run.

With TYPESAFE_API_KEY already in his local .env, the command is:

```sh
node --env-file-if-exists=.env --import tsx eval/ablation/jev.ts --inputs /private/jev-inputs.json
```

The input file is a nonempty JSON array. Each case has earlier, later and page
strings, plus baseline: { answers, latencyMs }. answers is the four TypedAnswer
values from T19, with threshold: null, one for each owner question. Baseline
latency is the measured elapsed time for those same four questions, including the
separate page request. Keep the file outside the repo. All cases are validated
before the first provider request; a partial or thresholded baseline is rejected.

The client uses the existing schema's instructions and option labels unchanged.
All four questions use Jev Choice, so each owner option has a corresponding
criterion. Pair questions and page_type are separate requests with the same
source_text representation as T19. No unsure threshold is introduced. Selected
option probability and the provider's confidence are retained as separate values.

Output is JSON with per-case agreement, per-question match counts and elapsed
latency summaries. p50/p90 use nearest rank. These are agreement with the supplied
baseline, not accuracy or evidence that either provider is correct. Input text and
private case identifiers are not emitted. HTTP/provider error bodies are not
returned or printed. Original per-call UsageRows are returned and appended to
runs/usage.jsonl; a log write failure does not discard a paid response.

Default model: jev-1.14.0; --model jev-1.13.0 is also supported. Both use the
documented $0.042 per million input tokens, with free output tokens. Error rows
with zero tokens indicate unreported usage, not a promise of zero billing. This
ablation client makes one attempt per request; it does not silently retry a paid
comparison. It has no SDK dependency and makes no catalogue call.

Official references checked November 8, 2026:

- https://docs.typesafe.ai/api/system-one
- https://api.typesafe.ai/openapi.json
- https://docs.typesafe.ai/models

The JSON responses under packages/pz/test/recorded/jev are deterministic synthetic
contract fixtures shaped from the official Choice schema. They are not captured
live responses and do not measure provider accuracy, calibration or speed. Tests
inject fetch and clocks, verify exact question transport and request splitting,
compute agreement and latency, and check that credential echoes cannot enter
answers, usage rows or exceptions. A real comparison result is still pending
Vidyut's authorized run; no ablation score has been published as a live result.
