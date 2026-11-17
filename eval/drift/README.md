# Same claim, another number: E2 labels for the embedding cutoff (T97, #164)

This folder sets `otherNumberSimilarity` in `packages/pz/rules/rules.json`, and checks `clusterSimilarityThreshold` for reworded copies. It uses the 20 E2 dev claims only. No spike, E3 or held-out page was opened.

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

## Result

Not run yet. This machine makes no live calls. `otherNumberSimilarity` stays a placeholder (0.8) until the run, and a human sets it from the E2 numbers. E3 has no labelled pages for this, so it gets checked once they exist and is never tuned on.

## Limits

- Labels are one person's judgement.
- 14 true sentences come from only 4 claims: dev-05, dev-11, dev-13 and dev-20. Recall rests on few examples.
- Code's gate needs the claim's subject word in the sentence, so a drifted copy that renames the subject ("birds" for "penguins") is never embedded.
