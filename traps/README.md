# Trap set

Planted by us; not an accuracy number. Each case takes a synthetic fixture from `fixtures/traces/`, applies one small mutation, and states the stop state and false-certainty counters the code must give. `pz traps` runs them all and prints:

`wrong origins 0 of n (95% upper bound X%), false-certainty 0/0/0/0, planted by us, by construction`

The bound is 1 minus 0.05^(1/n), the 95% upper bound on the error rate after 0 failures in n cases. The false-certainty numbers count cases where a counter did not match what the case plants, so 0/0/0/0 means every planted problem was caught and nothing else fired.

| Case | What it plants | Why |
|---|---|---|
| 01 nudged-number | A page in the earliest cluster gives 15 instead of 14 | Different numbers at the start of the trail are CONFLICTING, never an origin |
| 02 negated-span | The origin page's sentence follows "It is a myth that", on a page not marked meta | Review Focus 2: a negated span never backs an origin; `pz verify` fires `negated` |
| 03 unread-parent-stale-origin | An unread candidate parent, with ORIGIN_FOUND left in the stored decision | An unread parent blocks an origin; the stale stored origin fires the first counter |
| 04 cap-hit | The time cap was hit | A partial walk is PARTIAL |
| 05 tool-failure | Search failed | A failed call is TOOL_FAILED, never a decision about the claim |
| 06 empty-results | No pages came back | NO_PAGES_FOUND |
| 07 late-metadata-date | Metadata date later than the first capture, flag not set | The capture caps the date and the disagreement must be flagged; `pz verify` fires `date_cap` |
| 08 typed-readout-measured | A model-typed readout tagged measured | Fires the second counter: typed answers must say inferred |
| 09 card-number-not-in-spans | A card sentence with a number no span carries | Fires the third counter: the card may not say more than the spans |
| 10 undated-shown-dated | An unconfirmed date that still carries a date to display | Fires the fourth counter: undated nodes are shown undated |

After the mutation, the runner stores the decision the rules give, as a pipeline run would, unless the case sets `decision` itself (only case 03 does, to plant a stale origin).

Each case also lists the `pz verify` checks its planted problem must fire (`expect.verify`, empty when none should); the runner fails on any difference.

## Pipeline cases (T30)

`traps/pipeline/` holds 27 cases that run the real pipeline, not just the decision table. Each case does three things:
- It rebuilds a small web from a committed spike trace. Each page is its span with the context saved around it, at its recorded date and first capture.
- It plants one of the plan's seven mutations.
- It runs Tavily search and extract, Wayback dating, verbatim spans and the walk with no network, then the decision table.

The typed answers come from a stub that calls the planted page (the source's earliest page) a study and says "same claim" with 0.97 confidence everywhere. Only code can stop a planted origin. A test checks that without its mutation each source does end ORIGIN_FOUND on the planted page, so every case below is something code has to catch. `pz traps` prints:

`pipeline: wrong origins 0 of 27 (95% upper bound 10.5%), the typed stub calls the planted page a study, real walk and dating with no network, planted by us`

| Mutation | What it plants | Expected |
|---|---|---|
| nudge-number | The planted page's sentence gives the claim's number plus one | the page is dropped; `TRAIL_GOES_COLD` |
| negate | The sentence follows "It is a myth that" | the span is rejected; `TRAIL_GOES_COLD` |
| unread-parent | A link beside the sentence to an earlier page that cannot be read | an unread parent blocks an origin; `TRAIL_GOES_COLD` |
| cap-hit | A credit cap of 1 | `PARTIAL` |
| tool-failure | Tavily search answers 503 | `TOOL_FAILED` |
| empty-results | Every search comes back empty | `NO_PAGES_FOUND` |
| late-metadata-date | Metadata date a year after the first capture | the date is capped to the capture and flagged |

Each mutation runs on four sources (spike claims 2, 3 and 5 and the dry run), the four whose planted page ends ORIGIN_FOUND without a mutation. That makes 28 cases, less one. The dry run's late-metadata-date case was left out, because there the planted page is never read: the per-round page cap reaches the source's other pages first, so the case would not test dating.

These cases rebuild pages from the spans the spike saved, not the full pages, so they test how the pipeline stops, not how it searches. Nothing is tuned on the spike claims. `traps/pipeline.lock` holds the sha256 of each case, and `pz traps --relock` updates it.

`traps.lock` holds the sha256 of every case file. If a case changes, `pz traps` fails until someone reviews it and runs `pz traps --relock`.
