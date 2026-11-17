# Same claim, another number: E2 labels for the embedding cutoff (T97, #164)

This folder sets `otherNumberSimilarity` in `packages/pz/rules/rules.json`, and checks `clusterSimilarityThreshold` for reworded copies. The cutoff was set on the 20 E2 dev claims only, and no spike, E3 or held-out page was opened for that. E3 pages were fetched afterwards, only to check the value already set (below).

## Steps

1. Pages: the git-ignored `.cache/weak-atoms/` from `eval/weak-atoms/fetch.py`, the same fetch as #59 and T36.
2. `node --import tsx eval/drift/candidates.ts` lists every sentence on a claim's pages that names the claim's subject and carries a number, none with the claim's value (years aside, except on dev-10, whose number is a year). That gives 107 sentences from 13 claims (`candidates.json`).
3. `labels.json` is that list, labelled by hand before any embedding was run. `sameClaimOtherNumber` is true when the sentence on its own states the claim's relation for the claim's subject with a different number. Some notes on how cases were labelled:
   - "100 companies are source of over 70% of emissions" counts as true for dev-11.
   - FAO's "18 percent" counts as true for dev-13. It's an earlier, separate estimate, which is why the card calls it a possible variant and never says "became".
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
3. Done: `e3/labels.json` labels all 308 sentences, 24 true from 6 claims, checked by Anoop before any E3 embedding. It uses the same rules as E2, plus one for claims that pin a date. The true and borderline calls are in `e3/REVIEW.md`.
4. Done by XO on Nov 17, live on Vidyut's machine, at head 5b0bf1c: `node --env-file=.env --import tsx eval/drift/measure.ts --set=e3`, 11 embedding requests, well under the $0.002 ceiling. It looked at no other cutoff and picked nothing.

**The E3 result, at 0.75 as set on E2 and not tuned here:**

| Set | Sentences | True | True hits | False hits | Missed | Precision | Recall |
|---|---|---|---|---|---|---|---|
| E2 (tuned) | 107 | 14 | 9 | 2 | 5 | 0.82 | 0.64 |
| **E3 (check)** | **308** | **24** | **14** | **24** | **10** | **0.37** | **0.58** |

Recall holds up, but precision falls from 0.82 to 0.37: on claims it was not tuned on, a listed sentence is wrong more often than right. A listed page is never a node, so a false hit cannot change how a trace ends. It only adds a line to the card. Vidyut decided on Nov 17 that the line says "possible variant" and never "became" (`packages/pz/src/card/terminal.ts`), and the limits page cites this precision. The value stays 0.75: nothing is re-tuned on E3.

Code's gate stops almost nothing on E3. Every candidate already names the subject, and all 284 false sentences pass it, so the cutoff alone decides.

## Limits

- Labels are one person's judgement.
- 14 true sentences come from only 4 claims: dev-05, dev-11, dev-13 and dev-20. Recall rests on few examples.
- Code's gate needs the claim's subject word in the sentence, so a drifted copy that renames the subject ("birds" for "penguins") is never embedded.
