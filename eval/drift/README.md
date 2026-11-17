# Same claim, another number: E2 labels for the embedding cutoff (T97, #164)

This folder sets `otherNumberSimilarity` in `packages/pz/rules/rules.json`, and checks `clusterSimilarityThreshold` for reworded copies. The cutoff was set on the 20 E2 dev claims only, and no spike, E3 or held-out page was opened for that. E3 pages were fetched afterwards, only to check the value already set (below).

## Steps

1. Pages: the git-ignored `.cache/weak-atoms/` from `eval/weak-atoms/fetch.py`, the same fetch as #59 and T36.
2. `node --import tsx eval/drift/candidates.ts` lists every sentence on a claim's pages that names the claim's subject and carries a number, none with the claim's value (years aside, except on dev-10, whose number is a year). That gives 107 sentences from 13 claims (`candidates.json`).
3. `labels.json` is that list, labelled by hand before any embedding was run. `sameClaimOtherNumber` is true when the sentence on its own states the claim's relation for the claim's subject with a different number. Some notes on how cases were labelled:
   - "100 companies are source of over 70% of emissions" counts as true for dev-11.
   - FAO's "18 percent" counts as true for dev-13. It's an earlier, separate estimate, which is why the card says "instead of" and never "became".
   - "28 of 46 candy products" counts as true for dev-20.
   - A complement ("91% of plastic isn't recycled" for 9%, "about 5% of pilots succeed" for 95% failing) means the same thing and is labelled false.

   The result is 14 true out of 107.
4. `node --env-file=.env --import tsx eval/drift/measure.ts` is **live**. It embeds about 260 short texts with Qwen3-Embedding-8B, well under $0.01, and runs where live calls are allowed: Vidyut's machine, through XO. It prints precision and recall for code's gate plus each cutoff, and the cutoff with the best F1 on E2. It also prints how many same-claim pairs of the 131 labelled sentences from #59 and T36 merge at `clusterSimilarityThreshold`, and how many different-claim pairs would wrongly merge.

## Result on E2 (XO's live run, Nov 16, 9 embedding requests)

**(a) Same claim, another number,** on 107 sentences (14 true), with code's gate plus the cutoff:

| Cutoff | Precision | Recall | |
|---|---|---|---|
| 0.70 | 0.57 | 0.93 | |
| **0.75** | **0.82** | **0.64** | best F1, now in rules.json |
| 0.80 | 0.71 | 0.36 | the old placeholder |

`otherNumberSimilarity` is now 0.75.

**(b) Reworded copies** at `clusterSimilarityThreshold` 0.9: 23 of 635 same-claim pairs merge, and 0 of 4315 different-claim pairs wrongly merge. The cutoff is safe but merges few reworded copies. It is left alone here: lowering it is a separate change, measured the same way.

## The E3 check

E3 is never tuned on. The check runs once, at the value already set on E2:

1. Done by XO on Nov 16 at $0 (plain curl, no keys): `python3 -I eval/weak-atoms/fetch.py --set=e3` fetched 80 pages (79 HTML, 1 PDF skipped) into the git-ignored `.cache/weak-atoms-e3/`.
2. Done by XO: `node --import tsx eval/drift/candidates.ts --set=e3` listed 308 candidate sentences across 21 claims into `e3/candidates.json`, using the claim atoms in `e3/atoms.json`. Those were written by hand from the claim texts: 22 of the 40 claims, leaving out quotes with no statistic and claims whose number is a word ("one million", "every seven seconds").
3. To do: Anoop labels `e3/candidates.json` by hand into `e3/labels.json`, with the same rules as E2, before any E3 embedding is run.
4. To do, XO, live: `node --env-file=.env --import tsx eval/drift/measure.ts --set=e3` prints precision and recall at 0.75 only. It looks at no other cutoff and picks nothing. **Expected spend:** the claim texts plus the 308 sentences, about 330 short texts in batches of 32, so about 11 embedding requests. That is well under the $0.002 ceiling; the E2 run's 9 requests cost $0.00008.

The E3 numbers go here, whatever they are.

## Limits

- Labels are one person's judgement.
- 14 true sentences come from only 4 claims: dev-05, dev-11, dev-13 and dev-20. Recall rests on few examples.
- Code's gate needs the claim's subject word in the sentence, so a drifted copy that renames the subject ("birds" for "penguins") is never embedded.
