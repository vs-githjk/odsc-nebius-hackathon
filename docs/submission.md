# Submission draft (for Vidyut and XO to edit)

This is the text for the submission form, drafted from what is in the repo on Nov 16. Nothing gets submitted from this file. Vidyut and XO edit it, and it goes into the form only after the live results are in.

- Every number here either links to the file that backs it or is marked `[SLOT: ...]` until a run fills it. `make verify` checks this file with the copy lint and the number lint.
- The form fields come from the event app: team name, captain name, team description, project URL, deployment URL (optional), report URL (optional) and video link (optional). They are confirmed only when the submission email arrives.

## Team name

Says Who

## Captain name

[SLOT: Vidyut fills this in; the form asks for the captain's name, and it isn't written into the repo]

## Team description

### In two sentences

Patient Zero takes a viral statistic, a quote or a whole AI answer, and walks each claim backwards through time to the earliest web page it can find that states it, quoting the exact sentence on every page. It shows how the wording changed along the way and how many independent roots the copies trace back to. When the trail ends without an origin, it says so and says why: code decides that from the trace, never the model.

### Who it is for

A reporter or fact-checker with one number and a deadline. Today they paste the claim into a chatbot and get a confident source that often says something else when they click it. Patient Zero gives them the chain of pages, each with its verbatim sentence and date, and an honest ending they can check.

### How it works

- **Nebius Token Factory**, `Qwen/Qwen3-30B-A3B-Instruct-2507`, with strict JSON schemas and first-token logprobs. It finds each statistic in a pasted answer, copies the parts of a claim (subject, unit, population, time, named source) that code then checks verbatim, plans search queries that code filters, and answers narrow typed questions: the page type, whether a sentence states the same claim, and how wording changed between two pages. Each answer carries a confidence from its logprobs, and a low one will become "unsure" once #99 sets the cutoff.
- **Nebius Token Factory**, `Qwen/Qwen3-Embedding-8B`. It groups reworded copies and finds pages that state the claim with a different number ([#170](https://github.com/vs-githjk/odsc-nebius-hackathon/pull/170)). It runs live inside the pipeline, merged in [#191](https://github.com/vs-githjk/odsc-nebius-hackathon/pull/191).
- **Tavily `search`** runs date-windowed searches further and further back in time. **Tavily `extract`** reads each page a search returns.
- **The Wayback Machine** gives each page's first capture, which caps any date the page claims for itself.
- **Code** does everything else:
  - every edge between two pages rests on two verbatim sentences, one on each page;
  - one decision table picks one of six endings ([packages/pz/src/rules/decide.ts](../packages/pz/src/rules/decide.ts)): tool failed, stopped at a cap, no pages found, conflicting, origin found, or trail goes cold;
  - caps of 150 Tavily credits, $0.50, 8 hops and 5 pages per round apply to every trace ([packages/pz/rules/rules.json](../packages/pz/rules/rules.json)).

### How we know it works

- **`make verify`**, with no API keys, re-opens every committed trace, re-finds each sentence by its offsets and hashes, and recomputes the ending ([packages/pz/src/verify/checks.ts](../packages/pz/src/verify/checks.ts)). It runs in CI on every push.
- **Held-out set:** 10 claims, kept private, with their hash committed before most engine stages were built (the decision table, number rules and clients came first) ([eval/heldout.sha256](../eval/heldout.sha256)). Run once, on a frozen engine. Result: [SLOT: held-out origin hits X of 10, and every miss, from #125].
- **Dev sets:** E2 has 20 claims and is the only set anything is tuned on. E3 has 40 claims and is only checked ([eval/dev-sets.md](../eval/dev-sets.md)). Latest E2 row, the final live run on Nov 19 after the archive-date fix ([#238](https://github.com/vs-githjk/odsc-nebius-hackathon/pull/238)), as scored in [eval/dev-score.md](../eval/dev-score.md): false origins 0, target cited 4/10, earliest 2 Pass, 0 Partial, 8 Fail, cold stops 6/9, 18 of 19 claims scored (1 more scored apart as out of scope), 234 Tavily credits. The hero claim (dev-10) now ranks the World Economic Forum report of January 2016 earliest, quoting its own sentence. The run before (Nov 18, run 3 plus 2 re-records after [#225](https://github.com/vs-githjk/odsc-nebius-hackathon/pull/225)) gave false origins 0, target cited 3/10, earliest 1 / 0 / 9 and cold stops 8/9. Earlier runs on the same claims are rows in the same file.
- **E3 check:** not run live. E3 was kept as a check-only set, and the live budget went to the final E2 run, the gallery and the S7 answer check, so there is no E3 score to report.
- **Planted traps:**
  - 0 wrong origins on 10 planted traces ([traps/README.md](../traps/README.md));
  - 0 of 24 fake-origin pages written to fool the model ([traps/README.md](../traps/README.md), [#156](https://github.com/vs-githjk/odsc-nebius-hackathon/pull/156));
  - through the real walk and dating with no network: of 12 cases that test a trap that could end on a wrong origin, 3 end on one, and all 3 are a known gap. A negation in new wording passes code, so only the typed same-claim answer can stop it. The other 9 give 0 (95% upper bound 28.3%). 4 more cases test nothing for now, because their source ends cold before any trap is planted ([#173](https://github.com/vs-githjk/odsc-nebius-hackathon/pull/173)).
  - These are planted by us. They are not an accuracy number.
- **Gallery:** 8 famous viral statistics, with their true origins researched by hand and committed before any trace ran ([eval/gallery/answers.md](../eval/gallery/answers.md)). Result, graded against those answers ([docs/gallery.md](gallery.md)): 2 HIT, 1 PARTIAL, 4 MISS and 1 not graded (a tool failure at intake) out of 8. On the 4 claims with a findable origin: 0 HIT, 1 PARTIAL, 3 MISS, and one miss (G4) is a false origin, a list page whose metadata date predates the paper it lists.
- **Rematch** against ChatGPT, Claude and Perplexity on 10 drawn E3 claims, graded blind ([#171](https://github.com/vs-githjk/odsc-nebius-hackathon/pull/171)). Result: [SLOT: per-tool totals from #160, losses included].

### The first-week spike, told straight

A first walker with fixed rules and no model lost to all three consumer tools on six claims: Perplexity cited the web target on 4 of 4 claims, and we did on 1 of 4 ([spike/grading.md](../spike/grading.md)). The engine above was built against the causes found in [eval/spike-postmortem.md](../eval/spike-postmortem.md): false matches on common numbers, and searches that never reached the target.

### What it cannot do

- It reads web pages only. Print-only, paywalled and never-archived origins are out of reach, and the trail goes cold there.
- "Earliest source we found" is not "first use".
- Every known failure is listed with an example you can run, the rule that should catch it and whether it is caught today, in [docs/limits.md](limits.md). Among them: a fake early date in a page's own metadata is trusted, and the number used as a count passes the number rules.

### Cost and speed

Median 44 s and $0.08 a trace on the 20 E2 recordings (Tavily $0.08 at 10 credits, Token Factory $0.0005), against targets of 30 s and $0.02: both not met ([eval/perf.md](../eval/perf.md)).

## Project URL

https://github.com/vs-githjk/odsc-nebius-hackathon (public, MIT licence: [LICENSE](../LICENSE))

## Deployment URL (optional)

https://vs-githjk.github.io/odsc-nebius-hackathon/ (replay only: it opens the recorded traces with no keys, so it can't trace a new claim).

Live app: https://patient-0.vercel.app (traces new claims live under a shared $1.50 cap and per-IP limits; recorded traces open free).
<!-- numbers ok: 1.50 (the live app's shared spend cap, set in its deploy settings, #257) -->

## Report URL (optional)

The README's eval section, once the slots above are filled: [README.md](../README.md#evaluation).

## Video link

[SLOT: the demo video, about 2:15, script in docs/demo-script.md (#158)]
<!-- numbers ok: 2, 15 (the planned video length, 2:15, from the demo script in #158) -->
