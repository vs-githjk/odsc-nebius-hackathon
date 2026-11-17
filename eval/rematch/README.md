# Rematch: Patient Zero against ChatGPT, Claude and Perplexity (T93, #160)

In the spike, the consumer research tools beat us. Perplexity cited the web target on all 4 claims that had one, and we cited it on 1 ([spike/grading.md](../../spike/grading.md)). This rematch measures the same thing again on 10 new claims, with the same prompt, the same rubric and the same grader. Whatever the result is, it goes in the README, losses included.

## 1. The claims (done)

- `draw.json` lists 10 E3 claims, drawn by code. Every E3 claim is ranked by sha256 of the fixed seed and its id, and the first 10 are kept.
- The seed is `SEED` in `rematch.ts`. Anyone can re-run `node --import tsx eval/rematch/rematch.ts draw` and get the same list.
- **Pending:** that E3 shares no claim with the held-out set. Rohan checked the 8 gallery claims on #168, not E3. XO asked him on #105 to check the 40 E3 claims against the held-out list. Until he answers "no overlap", no rematch result is final. Nothing is tuned on E3.

| Claim | Expected | Text |
|---|---|---|
| e3-02 | origin | 1 in 3 people globally do not have access to safe drinking water. |
| e3-03 | origin | Air pollution kills 7 million people every year. |
| e3-07 | origin | People with strong social relationships have a 50% greater likelihood of survival. |
| e3-10 | origin | Electricity demand from data centres will more than double by 2030 to around 945 TWh. |
| e3-16 | origin | 1 in 6 people worldwide are affected by infertility. |
| e3-17 | origin | Loneliness is linked to 871,000 deaths a year. |
| e3-32 | cold | It takes 43 muscles to frown and only 17 to smile. |
| e3-34 | cold | Suicides have increased by 200% since lockdown began. |
| e3-36 | cold | If the world were a village of 100 people, 57 would be Asian. |
| e3-40 | cold | Fred Hoyle said the optimum population of the world should be about one hundred thousand. |

The targets are E3's registered `tracedOrigin` or `tracedBy` pages in `eval/dev-claims-e3.json`, set on Nov 9, before this draw.

## 2. Rival answers, collected by hand (to do: a teammate with the subscriptions)

These are the same fairness rules as the spike (#5):
- Start a fresh chat for every claim in every tool, with no project, no custom instructions, and memory off.
- Use these modes: ChatGPT Deep research, Claude with web search (or Research) on, and Perplexity Research (or the default if you don't have it). Pay for nothing.
- Paste this exact prompt, changing only the text after `Claim:`:

  ```
  Where did this claim originally come from? Trace it back to the earliest source you can find. List every page in the chain from newest to oldest with its URL and publish date, say where the wording changed, and tell me how many independent sources actually stand behind it. Claim: <claim>
  ```
- If the tool asks a clarifying question, reply only `No preference, go ahead.` and note that you did. Ask no follow-up questions.
- Don't look up the claims' origins before or during the runs, and don't open `eval/dev-claims-e3.json`.

Save each run as `eval/rematch/raw/<tool>/<claim>.md` (`raw/` is git-ignored until grading ends, so the grader can't match a form back to its transcript), where `<tool>` is `chatgpt`, `claude` or `perplexity`, using the spike's template: tool and mode, date and time started (PT), minutes until the full answer, any clarifying question, share link, every cited URL in order, then the full answer pasted verbatim.

## 3. Our answers (to do: XO, live on Vidyut's machine)

Each claim's live trace goes in as `eval/rematch/raw/patient-zero/<claim>.json` (git-ignored with the rest of `raw/`). A trace is used as it ran, with no reruns to pick a better one.

## 4. Blinding (to do: XO)

1. For every answer, ours included, write `raw/<tool>/<claim>.form.md` by hand in the spike's form shape: earliest URL, its date, stop statement, then the chain newest to oldest with quotes, copied only from that answer.
   - For ours, `node --import tsx eval/rematch/rematch.ts draft` first writes a fact sheet from each trace (`formFromTrace`). It fills in the URLs, dates and quotes, and leaves the stop statement as a placeholder with a note on what the trace ended on. Rewrite the stop statement in your own words, the same way as for the rivals, so no form has code-made sentences. `blind` refuses while a placeholder is left.
   - Our form never says "origin" unless the trace ended ORIGIN_FOUND.
2. Run `node --import tsx eval/rematch/rematch.ts blind <keyPath>`.
   - For each claim, the four forms get the letters A to D in a fresh random order and go to `forms/<claim>-<letter>.md`.
   - Every URL loses its query string and fragment (`utm_source` and the like come from one tool only).
   - Share links, citation markers, mode badges and rule rows are dropped, and tool names become "the tool". Nothing is replaced with a marker, since a marker only rival forms carried would give them away.
   - The key goes to `<keyPath>`, which must be outside the repo or under `.cache/`. The script refuses anywhere else.
3. Rohan gets the forms, never the key.

## 5. Grading (to do: Rohan, blind)

Rohan uses the spike rubric and writes one row per form to `eval/rematch/grades.json`:

```json
{ "claim": "e3-02", "form": "A", "earliest": "Pass", "stop": "Pass", "citation": "Pass", "note": "..." }
```

- **earliest:** `Pass` means it names the registered target. `Partial` means it names only a component of it. `Fail` means it's wrong. `Boundary` means a justified cold-trail explanation.
- **stop:** `Pass`, `Partial` or `Fail`, judged on whether it explains the real evidence boundary without inflating support.
- **citation:** `Pass` means the earliest URL opens and carries the quoted words. `Fail` means it doesn't. `N/A` means no URL was named.

## 6. Unblinding (to do: after grading)

`node --import tsx eval/rematch/rematch.ts unblind <keyPath>` writes `eval/rematch.md`. It has per-tool totals and a row for every claim and tool.

| Kind of claim | Counts as right |
|---|---|
| origin | earliest `Pass` |
| cold | earliest `Boundary` and stop `Pass` |

The key is committed next to the results only after the grades are in. The README eval section (#134) links to `eval/rematch.md` and states the totals as they are.

## Cost

Rivals: none, since they run on our own subscriptions. Ours: 10 live traces inside the ledger. This script makes no model or search call.
