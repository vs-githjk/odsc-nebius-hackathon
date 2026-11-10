# Same-claim check, measured on the E2 dev claims (T36, #86)

This folder decides the code half of the same-claim check in `packages/pz/src/match/same-claim.ts`. It uses the 20 E2 dev claims only. No spike claim, spike trace, E3 claim or held-out claim was opened.

## Steps

1. Pages: the git-ignored `.cache/weak-atoms/` from `eval/weak-atoms/fetch.py`, the same fetch as the weak-number work (#59).
2. `atoms.json` adds the three claims whose number is written in words: dev-02 (eight spiders), dev-04 (eight glasses) and dev-15 (five cars). The other claims come from `eval/weak-atoms/atoms.json`.
3. `node --import tsx eval/same-claim/candidates.ts` lists every sentence that carries the claim's number in words and is not already in `eval/weak-atoms/labels.json` (`candidates.json`).
4. `labels.json` is that list, labelled by hand on the same rule as `eval/weak-atoms`: `statesClaim` is true when the sentence on its own ties the number to the claim's subject, including a debunk that repeats it. Labels were set before any rule was run on them.
5. `node --import tsx eval/same-claim/measure.ts [--false] [--diff A B]` scores each rule on all 131 labelled sentences (120 from `eval/weak-atoms`, 11 here).

## Result

| Rule | True hits | False hits | Missed |
|---|---|---|---|
| Shipped before T36 (digits only) | 77 | 9 | 23 |
| **+ number words (shipped)** | **86** | **9** | **14** |
| + variant phrase required | 75 | 9 | 25 |
| + both | 84 | 9 | 16 |

Out of 100 true and 31 false sentences.

- **Number words: kept.** `atomHit` now reads "eight spiders" and "ten thousand steps". A number in words always counts as weak, so its subject must be in the same clause. That adds 9 true hits and no false ones.
- **Variant phrase required (candidate rule 1 in the spike post-mortem): not shipped.** It removed no false hit and lost 2 true ones, "eight 8-ounce glasses of water" among them. The function stays in `measure.ts` so it can be measured again.
- **The 9 false hits left** are 8 dev-10 sentences that use 2050 as a date with "plastic" in the clause, and the TikTok "100 million users" sentence on dev-17. Each has the right number and subject word but a different claim. Catching them is the job of the typed `same_claim` question, which is the second half of the check.

## The typed half

- **The question:** `same_claim` (`SAME_CLAIM` in `packages/pz/src/schema/questions.ts`) asks: does SENTENCE state the same claim as CLAIM, with the same subject, number and unit? The options are yes and no. "Unsure" comes only from the confidence threshold (`confidenceThreshold` in `rules.json`, set by T48).
- **The gate:** a page needs a code hit and a typed yes whose confidence is known. A no, an unsure, or a yes with no logprobs never makes a candidate. With no model, nothing does.
- **Not measured yet.** This machine has no Token Factory key, so $0 has been spent. Asking it about the 95 sentences that pass the code check is 95 short calls, well under a cent at the pinned model's price. That run goes on #2 when it is made.

## Limits

- 11 new sentences from two claims. dev-15's seen-at page is blocked (403), and no sentence on its fetched origin page writes the number in words. No false word-number sentence turned up, so the false-hit side of number words is untested on real pages, and the unit tests cover it instead.
- Labels are one person's judgement.
- `make dev-score` cannot show the effect yet. There are no dev traces until the engine walker runs (T39), so the E2 and E3 headlines both read "no trace".
