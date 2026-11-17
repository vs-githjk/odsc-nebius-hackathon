# E3 labels: the calls to check

`labels.json` labels all 308 candidate sentences: 24 true, from 6 claims. They were drafted, then checked and approved by Anoop on Nov 16, before any E3 embedding ran. They use the E2 rules in `../README.md`: a sentence is true when, on its own, it states the claim's relation for the claim's subject with a different number. A complement or the same figure in another unit is false.

One rule is added for E3. When the claim pins a date ("in 2022", "on 15 November 2022"), a figure for another year is a different claim, so it is false. When the claim has no date, an earlier or later survey of the same thing counts, the same as FAO's 18 percent on E2.

## True (24)

| Claim | Sentences | Why |
|---|---|---|
| e3-07 social relationships, 50% | d35 | "a 91% increase in odds of survival", for multidimensional measures. **Borderline:** it is a sub-estimate, not the overall figure. |
| e3-14 Americans more concerned, 52% | d01, d02, d04 | The same Pew question in earlier years (38%, 37%, 38%). The claim has no year. |
| e3-22 Woody Allen, 80 percent of success | d01 to d06 | The quote's variants: 90, 75, 50 and 99 percent, of "success" or "life". **Borderline:** "life" instead of "success" is counted as the same quote. |
| e3-30 DNA with bananas, 50% | d01 | "We only share 1% of our DNA with bananas", a correction giving another number. |
| e3-32 muscles to frown and smile, 43 and 17 | d01 to d12 | Every variant count (37, 22, 13 and 33, 10 and 100, and so on). |
| e3-36 village of 100, 57 Asian | d01 | "Asians: 60". |

## Borderline calls labelled false

| Claim | Sentences | Why false |
|---|---|---|
| e3-02 1 in 3 lack safe drinking water | d08 | "1 in 10 lack basic services" is a different service level (basic, not safely managed). |
| e3-03 air pollution, 7 million | d01, d02, d03 | "One in eight deaths" is a share, not a count. 4.3 million (indoor) and 3.7 million (outdoor) are parts of the 7 million. |
| e3-06 e-waste, 62 million tonnes in 2022 | d06, d09 | 82 million tonnes is a 2030 projection, and the claim pins 2022. |
| e3-07 social relationships, 50% | d01, d06 | d01 is isolation and mortality (32%), the inverse framing. d06 gives the same 91% result as an odds ratio, not a survival figure. |
| e3-10 data centres, 945 TWh by 2030 | d01, d03 | 1.5% is a share, and 415 TWh is the 2024 baseline. |
| e3-11 Copilot, 55% faster | d22 | 1h11m against 2h41m is the same 55% result, in minutes. |
| e3-12 8 billion on 15 Nov 2022 | d04 | 8.5 billion is a 2030 projection, and the claim pins the date. |
| e3-14 Americans more concerned, 52% | d05, d06 | Age subgroups (61% of those 65 and older, 42% of those 18 to 29). |
| e3-15 road deaths, 1.19 million a year | d02, d03, d09, d12 | "Over 3,000 a day" is the same figure per day. |
| e3-16 infertility, 1 in 6 | d03 | 17.8% is for high-income countries only. |
| e3-17 loneliness, 871,000 deaths | d02, d04 | "100 deaths every hour" is the same figure per hour. d04 states 871 000 itself. |
| e3-22 Woody Allen | d07 | "90 per cent of success isn't showing up" is a joke that turns the quote around. |
| e3-30 DNA with bananas | d04 | It is about zebrafish, not bananas. |

## Limits

- One labeller. The trues come from 6 claims, and 12 of the 24 are the muscle counts, so recall rests mostly on one claim.
- No embedding was run before labelling. The labels are fixed before step 4.
