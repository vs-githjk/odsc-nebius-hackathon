# Held-out readout (Nov 19 run)

The one-shot held-out run (T67, #125), run by Rohan on his machine and reported on #250. This file holds the result only:
no claim text, target or grading label is committed. The ten claims stay private; their hash was committed on Nov 8
([heldout.sha256](heldout.sha256)).

- **Engine:** main at `8a33448453a47f67773b3754f797ce40355ba560`, after the #310 origin rule. One invocation, no retry.
- **Hash check:** the claim file matched the registered hash.
- **Scoring:** the repo's T33 rules, the same as `make dev-score`.

## Result

| Measure | Result |
|---|---|
| Traces recorded and verified | 8 of 10 (2 failed: one at the fingerprint stage with a bad model response, one at the verification stage); 0 unverified |
| False origins | 0 (+0 unverified ORIGIN_FOUND) |
| Target cited (origin hits) | 0/6 origin claims |
| Earliest page Pass / Partial / Fail | 0 / 0 / 5, among scored origin traces |
| Correct cold stop | 2/4 cold claims |
| Cost | 94 Tavily credits; $0.860647 in the held-out ledger; every reservation settled, none pending |

## What it shows, and what it does not

- **It shows** that on ten claims the engine never saw, it named no false origin: where it could not back an origin, it
  said so.
- **It does not show** that it finds origins: it cited none of the 6 targets, and no scored origin trace ranked the right
  page earliest. Two of the ten traces failed outright. Finding and dating the origin itself remains the weak part, as on
  the dev sets.
