# Patient Zero

A viral statistic reaches a reporter with no source attached: "Americans check their phones 96 times a day." Patient Zero takes that claim and walks it backwards through time to the earliest web page it can find that states it. It shows the exact sentence on every page, how the wording changed hop by hop, and how many separate roots the copies trace back to. When the trail ends without an origin, it says so, and says why.

Team **Says Who**, ODSC x Nebius Hackathon 2026. Built on **Nebius Token Factory** (typed questions, strict JSON schemas, first-token logprobs) and **Tavily** (search and extract), with the Wayback Machine for dates.

![The trace view on a sample trace, 1440 px, light](docs/screenshots/ui-pass/rich-1440-light.png)

*The trace view, shown on an invented sample claim. The app also opens every committed E2 dev trace the same way, labelled REPLAY with its recorded date ([#220](https://github.com/vs-githjk/odsc-nebius-hackathon/pull/220)).*
<!-- numbers ok: 1440 (screenshot width in the file name) -->

## Where it stands

Honest status as of Nov 19, 2026:

- **Runs live end to end:** `pz trace "<claim>"` searches with Tavily, reads and dates the pages, asks Token Factory the typed questions, decides the ending in code and prints a card (`engine/pipeline.ts`, [#191](https://github.com/vs-githjk/odsc-nebius-hackathon/pull/191)). With no keys, every command here replays committed traces instead.
- **Live dev runs (E2, Nov 17 to 19):** recorded in [eval/dev-traces/](eval/dev-traces/) and scored in [eval/dev-score.md](eval/dev-score.md). The first run, rescored after answer-key corrections, gave 0 false origins (+1 unverified), target cited 4/10 and earliest page Pass / Partial / Fail 1 / 0 / 8. The second, the first with the walk fixes from [#192](https://github.com/vs-githjk/odsc-nebius-hackathon/issues/192), dropped to 1 false origin, target cited 2/10 and earliest 0 / 0 / 10. Four fixes for what it showed went in that evening, and the third run gave 1 false origin, target cited 3/10, earliest 1 / 0 / 9 and correct cold stops 7/9. Its false origin was dev-04 (eight glasses of water): a 2002 paper that quotes the advice in order to question it. After [#225](https://github.com/vs-githjk/odsc-nebius-hackathon/pull/225), which stops a page from being the origin when its span presents the claim as already said (a cue list in rules.json), dev-03 and dev-04 were re-recorded on Nov 18 and the other claims kept (run 3 plus 2 re-records), giving 0 false origins and 8 of 9 cold stops. The final run, on Nov 19 after the archive-date fix ([#238](https://github.com/vs-githjk/odsc-nebius-hackathon/pull/238)), gives **0 false origins**, target cited 4/10, earliest page right on 2 (dev-09, and dev-10 on the WEF report) and correct cold stops 6/9, on E2, the set we tune on ([#225](https://github.com/vs-githjk/odsc-nebius-hackathon/pull/225) was written for dev-04's miss); E3 and the held-out set have not run yet. Two cold claims (dev-07, dev-08) now end with no pages found instead of cold. When Patient Zero can't back an origin, it says the trail goes cold instead of naming one. The weak part is finding and dating the origin itself: no recorded trace ends on its origin yet, not even the claims that have one on the web. On 6 of 10 the walk never reaches the origin page; where it does, dating can still rank a later page first (a first archive capture dates a page's URL, not the sentence on it; see [docs/limits.md](docs/limits.md)).
- **Not yet measured:** the held-out run. The first-week spike, which lost, is under [Evaluation](#evaluation).

## Try it in two minutes, no API keys

```sh
git clone https://github.com/vs-githjk/odsc-nebius-hackathon.git && cd odsc-nebius-hackathon
npm ci
make judge                      # setup check, two recorded runs replayed as cards, pz verify, traps, one summary line
```

Then, if you want more:

```sh
make doctor                     # what is installed, which keys are set (never their values), what runs live or replays
make verify                     # typecheck, tests, re-check every committed trace, traps, copy lint, claims table
make replay                     # replay a trace and print it as a card
make replay ARGS=--json         # the same trace as raw JSON
npm run dev -w web              # the trace view, on the sample traces
```

`make replay` defaults to an invented sample trace and labels it SAMPLE on the first line. Point it at any recorded trace with `TRACE=path/to/trace.json`. Replay never calls a model or a search API.

## How it works

```mermaid
flowchart LR
  IN["Paste a claim<br/>or an AI answer"] --> INT["intake<br/>Token Factory chat"]
  INT --> FP["fingerprint<br/>Token Factory chat + code"]
  FP --> Q["plan queries<br/>Token Factory chat + code"]
  Q --> W["walk back in time<br/>Tavily search + extract"]
  W --> SP["spans<br/>code: verbatim sentences"]
  SP --> D["dating<br/>Wayback CDX + page evidence"]
  D --> CL["clusters and roots<br/>code"]
  CL --> RO["readouts per hop<br/>code + Token Factory typed questions"]
  RO --> SC["same claim?<br/>code + Token Factory typed question"]
  SC --> DEC["stop state<br/>code: decision table"]
  DEC --> CARD["card and trace view"]
```

| Stage | What it does | Model or API | Status |
|---|---|---|---|
| intake | Finds each statistic in a pasted answer; code checks every claim is in the text | `Qwen/Qwen3-30B-A3B-Instruct-2507`, strict schema | built, tested offline |
| fingerprint | Reads the claim's number by code; the model only copies parts of the claim (subject, unit, population, time, named source), and code drops anything not copied verbatim | same model | built, including claims with no plain number (quotes, ranges) |
| plan queries | Proposes searches; code keeps only queries tied to the claim and rejects search operators | same model | built |
| walk | Searches date windows further and further back, reads pages, keeps sentences that state the claim | Tavily `search`, `extract` | built, including ranked citation following and searches for named sources ([#110](https://github.com/vs-githjk/odsc-nebius-hackathon/pull/110)) |
| spans | Every edge between two pages rests on two verbatim sentences, one on each page | code | built, with link-verified edges ([#108](https://github.com/vs-githjk/odsc-nebius-hackathon/pull/108)) |
| dating | Dates each page from its own metadata or byline, capped by its first Wayback capture | Wayback CDX | built |
| clusters | Groups copies (versions, syndication, same byline, near duplicates) and counts roots | code, `Qwen/Qwen3-Embedding-8B` for reworded copies | built; the walk passes embeddings into clustering when it is given an embedder ([#170](https://github.com/vs-githjk/odsc-nebius-hackathon/pull/170)), and the live pipeline ([#191](https://github.com/vs-githjk/odsc-nebius-hackathon/pull/191)) supplies one |
| readouts | Per hop: number, unit, hedge and comparison changes measured by code; scope, attribution and context asked as typed yes/no questions | same model, logprobs | built |
| same claim | A page counts as stating the claim only if code finds the claim's number (or phrase) in the sentence **and** a typed question answers yes with known confidence | same model, logprobs | built |
| stop state | Code picks one of six endings from the trace; the model never does | none | built |

### How many roots, not just how many pages

Every trace counts the pages it found, how many independent roots they trace back to, and how many are copies: "Found on 23 pages: 3 independent roots, 1 origin. 20 are copies." An independent root is a group of copies with no verified link to an earlier page; every other page is a copy. Code counts it from the trace's own links, and `pz verify` recounts it ([#167](https://github.com/vs-githjk/odsc-nebius-hackathon/pull/167)). An unlinked group counts as its own root, so the count can run high when a copy does not cite its source.
<!-- numbers ok: 23, 3, 1, 20 (an example sentence, not a result) -->

### Code decides how a trace ends

The model answers narrow typed questions. Code reads the trace and picks the ending, first matching row wins ([packages/pz/src/rules/decide.ts](packages/pz/src/rules/decide.ts), thresholds in [packages/pz/rules/rules.json](packages/pz/rules/rules.json)):

| Row | Ending | When |
|---|---|---|
| 1 | `TOOL_FAILED` | A search or fetch failed. This says nothing about the claim. |
| 2 | `PARTIAL` | A cap was hit: 150 Tavily credits, $0.50, 5 minutes, 8 hops or 5 pages per round. |
| 3 | `NO_PAGES_FOUND` | No page states the claim, apart from pages discussing it as a claim. |
| 4 | `CONFLICTING` | The earliest pages give different numbers for the same thing. |
| 5 | `ORIGIN_FOUND` | The earliest page is a primary source (study, dataset, report or the speaker's own words) with a confirmed date, cites nothing earlier, is not negated, and states the same claim; no page it cites is left unread, and two searches further back found nothing earlier. |
| 6 | `TRAIL_GOES_COLD` | Anything else. The card says which check failed. |

### Why each step can be checked

- **Two verbatim spans per edge.** `pz verify` re-opens each saved page, re-finds every sentence at its offsets and hashes, and recomputes the stop state ([packages/pz/src/verify/checks.ts](packages/pz/src/verify/checks.ts)). `make verify` runs it on every committed trace.
- **Typed questions, not free text.** Every model call uses a strict JSON schema. Confidence comes from the first-token logprobs of the answer, and "unsure" never makes an origin. The cutoff below which a "yes" stops counting is not set yet (`confidenceThreshold` is null in rules.json; limits L6), so today any "yes" with a known probability counts ([packages/pz/src/typed/](packages/pz/src/typed/ask.ts)).
- **Page text is data.** Claims and pages go to the model inside a `source_text` field, and every prompt says so. Tests plant instructions inside claims and sentences and check they stay data. A planted trap set checks the counters for false certainty ([traps/README.md](traps/README.md)).
- **The card cannot overclaim.** The card's one sentence is dropped if it uses a number, name, quote or date not in the spans, or says "origin" on a trace that did not end `ORIGIN_FOUND` ([packages/pz/src/card/index.ts](packages/pz/src/card/index.ts)).

## A trace, walked step by step

One real claim from paste to stop state: dev-10, "By 2050 there will be more plastic than fish in the ocean.", recorded live on Nov 19 ([eval/dev-traces/dev-10.json](eval/dev-traces/dev-10.json)). `make replay TRACE=eval/dev-traces/dev-10.json` prints its card with no keys, and the app replays the walk step by step.

1. **Fingerprint.** Code reads the claim's number from "By 2050" (a forecast year is kept as the number only after "by"); Token Factory copies the subject ("plastic"), the population ("in the ocean") and the time ("by 2050"), and code keeps only words found in the claim.
2. **Walk, window 1 (up to the day of the run).** Four searches: two built by code (`"2050" plastic`, `"more plastic than fish in the ocean" by 2050`) and two planned by the model and checked by code (one names the Ellen MacArthur Foundation). A fact-check search finds Snopes, which is read as a map: its citations are followed, and it is never a candidate origin.
3. **Reading and dating.** Each page with a sentence that carries the claim's atoms gets a typed `same_claim` question. The earliest pages land on January 20, 2016: a blog post (dated by its own metadata) and the World Economic Forum's report "The New Plastics Economy" (dated by its first archive capture, which holds the sentence: since #238 a capture that lacks the claim never dates a page). On the report the model said yes to `same_claim`, and its page type is report.
4. **Walk, windows 2 and 3.** Searches before 2016-01-19, then before 2010-06-14, look for anything older. Nothing older states the claim.
5. **Stop state.** Code, not the model, decides: the report is a primary source with a confirmed date and a confident yes, but two pages the trace cites could not be opened, so rule 6 holds and it ends **The trail goes cold** ("A page it cites could not be opened"). It found the report and still does not call it the origin while a cited page is unread.
6. **Card.** The earliest page shown is the report, quoting its own sentence: "In a business-as-usual scenario, the ocean is expected to contain 1 tonne of plastic for every 3 tonnes of fish by 2025, and by 2050, more plastics than fish (by weight)."

What it cost, from the trace's own usage rows (cache hits excluded):

| Service | Calls | Tavily credits | Cost | Summed latency |
|---|---|---|---|---|
| Tavily search | 15 | 15 | $0.12 | 26 s |
| Tavily extract | 4 | 3 | $0.024 | 11 s |
| Token Factory chat (`Qwen/Qwen3-30B-A3B-Instruct-2507`): fingerprint, queries, same_claim, page type, readouts, boundary | 20 | | $0.0010 | 24 s |
| Token Factory embeddings (`Qwen/Qwen3-Embedding-8B`) | 4 | | under $0.0001 | 17 s |
| Wayback (CDX and captures) and page fetches | 15 | | $0 | 22 s |

Total: $0.15 (18 Tavily credits, $0.0010 model), 103 s of wall time, as the card's Cost line says.
<!-- numbers ok: 15, 0.12, 26, 4, 3, 0.024, 11, 20, 0.0010, 24, 0.0001, 17, 22, 0.15, 18, 103, 1, 6, 30 (summed from eval/dev-traces/dev-10.json usage rows; reproduce with the command below) -->

The per-call table is generated from the trace file's own usage rows, so every figure can be checked against the file:

```sh
node --import tsx packages/pz/scripts/usage-table.ts path/to/trace.json
```

## When it fails

A search that breaks, or finds nothing, ends in a named state instead of a guess. Both cases run through the engine's own walk, dating, Tavily client and stop-state rules, on a written Tavily response, and replay with no API keys:

| Case | Command | How it ends |
|---|---|---|
| Tavily answers 503 on search | `make replay TRACE=fixtures/failure/traces/failure-tavily-503.json` | `TOOL_FAILED`, rule row 1: "Tavily search returned http_error 503", 0 pages kept. It retried once; both attempts are in the usage rows at 0 credits. It says nothing about the claim. |
| Every search comes back empty | `make replay TRACE=fixtures/failure/traces/failure-empty-search.json` | `NO_PAGES_FOUND`, rule row 3. Not a tool failure. |

These two are labelled synthetic: the claim is the invented Harbor Zoo one, and the responses were written for the test, not captured from a live call ([failure-tavily-503.json](fixtures/failure/traces/failure-tavily-503.json), [failure-empty-search.json](fixtures/failure/traces/failure-empty-search.json)). `node --import tsx fixtures/failure/record.ts` rebuilds them byte for byte.

<a id="eval"></a>

## Evaluation

| Set | Claims | Use | Result |
|---|---|---|---|
| E2 dev ([eval/dev-claims.json](eval/dev-claims.json)) | 20: 11 with a web origin, 9 that go cold | Rules, cutoffs and prompts are tuned here only | Latest row in [eval/dev-score.md](eval/dev-score.md), the final live run (Nov 19): false origins 0, target cited 4/10, earliest 2 Pass, 0 Partial, 8 Fail, cold stops 6/9, 18 of 19 scored (1 out of scope). Every earlier run is a row in the same file. |
| E3 check ([eval/dev-claims-e3.json](eval/dev-claims-e3.json)) | 40: 18 with a web origin, 22 that go cold | Check only, nothing tuned on it | not run live yet |
| Held-out | 10, private; its hash was committed on Nov 8, before most stages were built (the decision table, number rules and clients came first) ([eval/heldout.sha256](eval/heldout.sha256)) | Run once, on a frozen engine | pending |

`make dev-score` grades a set of traces the way the spike was graded ([eval/dev-score.ts](eval/dev-score.ts)).

### The spike, told straight

In week 0 a first walker with fixed rules and no model ran on six claims, graded against Perplexity, ChatGPT and Claude ([spike/grading.md](spike/grading.md)):

| Tool | Web target cited (4 claims) | Correct cold-trail stop (2 claims) | Stop graded Pass, all six |
|---|---|---|---|
| Perplexity | 4/4 | 2/2 | 6/6 |
| ChatGPT | 4/4 | 2/2 | 6/6 |
| Claude | 4/4 | 2/2 | 5/6 |
| Ours (spike) | 1/4 | 0/2 | 0/6 |

It was the fastest (12 to 47 s) and lost on every claim. The grading was not fully blind: six claims, graded once, by one agent-assisted grader. The post-mortem ([eval/spike-postmortem.md](eval/spike-postmortem.md)) found two main causes. False matches on a common number became the "earliest" page on four claims, and exact-number searches never reached two targets. The engine above was built against those causes: the same-claim check, weak-number clause rules, model-planned queries, and citation following ([#110](https://github.com/vs-githjk/odsc-nebius-hackathon/pull/110)). The dev score will say whether it worked.

## Token Factory and Tavily

| Service | Used for | Status |
|---|---|---|
| Token Factory `Qwen/Qwen3-30B-A3B-Instruct-2507` | intake, fingerprint, query planning, typed readouts, page type, same claim | live in every dev run since Nov 17; every call is a usage row on the trace |
| Token Factory `Qwen/Qwen3-Embedding-8B` | near-duplicate clustering (replaced `BAAI/bge-en-icl`, which returned 404) <!-- numbers ok: 404 (HTTP status) --> | live: wired into clustering and the other-number check in the pipeline |
| Tavily `search` | date-windowed exact-phrase searches | live in every dev run since Nov 17 |
| Tavily `extract` | reading the pages a search returns | live in every dev run since Nov 17 |
| Wayback CDX | first capture of each page, capping its date | live: every dev trace's usage rows include its Wayback lookups |

Every call writes a usage row: model, tokens, cached tokens, Tavily credits, dollars, latency, status and cache hit ([packages/pz/src/schema/usage.ts](packages/pz/src/schema/usage.ts)). The usage report across the dev runs is T58 ([#116](https://github.com/vs-githjk/odsc-nebius-hackathon/issues/116)), not written yet; every figure it will use is already a usage row in [eval/dev-traces/](eval/dev-traces/). Median speed and cost per trace, from those rows: [eval/perf.md](eval/perf.md).

## Limits

- Web pages only. Print-only and paywalled origins are out of scope; the trail goes cold there and says so.
- "Earliest source we found" is not "first use". Pages that were never indexed or archived cannot be found.
- Claims need a number, a range or a distinctive phrase to match on.
- One model answers every typed question. A second model family on same claim was built, measured on E2 and rejected: it lost 23 of 60 true matches and removed no false ones, so it stays off ([#178](https://github.com/vs-githjk/odsc-nebius-hackathon/pull/178), [eval/same-claim/second-model.ts](eval/same-claim/second-model.ts)).

<!-- numbers ok: 23, 60 (XO's live E2 measure of the second model on Nov 16, logged in plan/decisions.md) -->
- Every known failure, with an example you can run, the rule that should catch it, whether it is caught today and who owns it: [docs/limits.md](docs/limits.md), "Where Patient Zero is wrong".

## Setup for live runs

1. Node 24 ([package.json](package.json)), then `npm ci`.
2. Copy [.env.example](.env.example) to `.env` and fill it locally (`NEBIUS_API_KEY`, `TAVILY_API_KEY`). `.env` is git-ignored; never paste keys in issues, PRs or chat.
3. `make verify` and `make replay` need no keys.

## Repo map

| Path | What is there |
|---|---|
| [packages/pz/src/engine/](packages/pz/src/engine/run.ts) | the stages and `runTrace` |
| [packages/pz/src/rules/](packages/pz/src/rules/decide.ts) | number rules, claim matching, the decision table |
| [packages/pz/src/typed/](packages/pz/src/typed/ask.ts) | typed questions with logprob confidence |
| [packages/pz/src/clients/](packages/pz/src/clients/tavily.ts) | Token Factory, Tavily and Wayback clients with usage rows and caps |
| [packages/pz/src/verify/](packages/pz/src/verify/checks.ts) | `pz verify` and the false-certainty counters |
| [apps/web/](apps/web/src/App.tsx) | the trace view |
| [schema/trace.schema.json](schema/trace.schema.json) | the trace format, exported from the Zod schema |
| [fixtures/](fixtures/README.md) | invented sample traces, labelled SAMPLE |
| [traps/](traps/README.md) | the planted trap set |
| [eval/](eval/dev-sets.md) | dev sets, scoring, the spike post-mortem |

## For agents reading this repo

Start at [llms.txt](llms.txt). The working notes live in `plan/` while the build runs; `plan/README.md` says what every file there holds.

- Decisions live in `plan/decisions.md` (Vidyut's, with his words and dates).
- Rulings made during the build live in `plan/progress.md`.
- Coordination between agents and teammates lives in `plan/board.md`.
- The claims list in `plan/plan.md` ("Claims we will make") is what `make verify` prints, one row per claim.

Teammates and their agents: read [docs/AGENTS.md](docs/AGENTS.md) first.

## License

MIT. See [LICENSE](LICENSE).
