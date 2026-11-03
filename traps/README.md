# Trap set

Planted by us; not an accuracy number. Each case takes a synthetic fixture from `fixtures/traces/`, applies one small mutation, and states the stop state and false-certainty counters the code must give. `pz traps` runs them all and prints:

`wrong origins 0 of n (95% upper bound X%), false-certainty 0/0/0/0, planted by us, by construction`

The bound is 1 minus 0.05^(1/n), the 95% upper bound on the error rate after 0 failures in n cases. The false-certainty numbers count cases where a counter did not match what the case plants, so 0/0/0/0 means every planted problem was caught and nothing else fired.

| Case | What it plants | Why |
|---|---|---|
| 01 nudged-number | A page in the earliest cluster gives 15 instead of 14 | Different numbers at the start of the trail are CONFLICTING, never an origin |
| 02 negated-span | The origin page only calls the number a myth (marked meta) | A page that denies the number is not its origin |
| 03 unread-parent-stale-origin | An unread candidate parent, with ORIGIN_FOUND left in the stored decision | An unread parent blocks an origin; the stale stored origin fires the first counter |
| 04 cap-hit | The time cap was hit | A partial walk is PARTIAL |
| 05 tool-failure | Search failed | A failed call is TOOL_FAILED, never a decision about the claim |
| 06 empty-results | No pages came back | NO_PAGES_FOUND |
| 07 late-metadata-date | Metadata date later than the first capture, flag not set | The first capture still dates the page; the origin stands |
| 08 typed-readout-measured | A model-typed readout tagged measured | Fires the second counter: typed answers must say inferred |
| 09 card-number-not-in-spans | A card sentence with a number no span carries | Fires the third counter: the card may not say more than the spans |
| 10 undated-shown-dated | An unconfirmed date that still carries a date to display | Fires the fourth counter: undated nodes are shown undated |

After the mutation, the runner stores the decision the rules give, as a pipeline run would, unless the case sets `decision` itself (only case 03 does, to plant a stale origin).

Cases built from real spike data (kind `pipeline`) come later in T30.

`traps.lock` holds the sha256 of every case file. If a case changes, `pz traps` fails until someone reviews it and runs `pz traps --relock`.
