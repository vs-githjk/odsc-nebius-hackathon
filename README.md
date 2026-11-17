# Patient Zero

A viral statistic reaches a reporter with no source attached: "Americans check their phones 96 times a day." Patient Zero takes that claim and walks it backwards through time to the earliest web page it can find that states it. It shows the exact sentence on every page, how the wording changed hop by hop, and how many separate roots the copies trace back to. When the trail ends without an origin, it says so, and says why.

Team **Says Who**, ODSC x Nebius Hackathon 2026. Built on **Nebius Token Factory** (typed questions, strict JSON schemas, first-token logprobs) and **Tavily** (search and extract), with the Wayback Machine for dates.

![The trace view on a sample trace, 1440 px, light](docs/screenshots/ui-pass/rich-1440-light.png)

*The trace view, shown on an invented sample claim. A real trace replaces it once the first live run is reviewed.*
<!-- numbers ok: 1440 (screenshot width in the file name) -->

## Where it stands

Honest status as of this README:

- **Built and tested with no network:** the engine stages below, the Token Factory and Tavily clients, the six-way stop-state table, the `pz verify` re-check, a planted trap set, keyless replay with a readable card, failure paths that replay keylessly, whole-answer mode, the origin card's checked sentence, and the trace view.
- **Wiring in progress:** `engine/pipeline.ts` ([#130](https://github.com/vs-githjk/odsc-nebius-hackathon/issues/130)) joins the stages to the live clients, so `pz trace "<claim>"` runs end to end. Until it lands, `pz trace` replays recorded traces only.
- **Not yet measured:** the first live dev run and then the held-out run are pending. The only end-to-end result so far is the first-week spike, which lost (see [Evaluation](#evaluation)). Some single parts are measured on E2 already, such as the second-model check under Limits.

## Try it in two minutes, no API keys

```sh
git clone https://github.com/vs-githjk/odsc-nebius-hackathon.git && cd odsc-nebius-hackathon
npm ci
make judge                      # setup check, every committed trace as a card, pz verify, traps, one summary line
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
| clusters | Groups copies (versions, syndication, same byline, near duplicates) and counts roots | code, `Qwen/Qwen3-Embedding-8B` for reworded copies | built; the walk passes embeddings into clustering when it is given an embedder ([#170](https://github.com/vs-githjk/odsc-nebius-hackathon/pull/170)), and the live pipeline (#130) supplies one |
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
- **Typed questions, not free text.** Every model call uses a strict JSON schema. Confidence comes from the first-token logprobs of the answer, so a low-confidence "yes" becomes "unsure" ([packages/pz/src/typed/](packages/pz/src/typed/ask.ts)).
- **Page text is data.** Claims and pages go to the model inside a `source_text` field, and every prompt says so. Tests plant instructions inside claims and sentences and check they stay data. A planted trap set checks the counters for false certainty ([traps/README.md](traps/README.md)).
- **The card cannot overclaim.** The card's one sentence is dropped if it uses a number, name, quote or date not in the spans, or says "origin" on a trace that did not end `ORIGIN_FOUND` ([packages/pz/src/card/index.ts](packages/pz/src/card/index.ts)).

## A trace, walked step by step

*Lands with the first reviewed live trace from the first dev run (T72).* It will show one real claim from paste to stop state: each search and its date window, each page kept or dropped and why, each hop's readouts, and every Token Factory and Tavily call with its tokens, credits, cost and latency.

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
| E2 dev ([eval/dev-claims.json](eval/dev-claims.json)) | 20: 11 with a web origin, 9 that go cold | Rules, cutoffs and prompts are tuned here only | pending (first live run) |
| E3 check ([eval/dev-claims-e3.json](eval/dev-claims-e3.json)) | 40: 18 with a web origin, 22 that go cold | Check only, nothing tuned on it | pending (first live run) |
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
| Token Factory `Qwen/Qwen3-30B-A3B-Instruct-2507` | intake, fingerprint, query planning, typed readouts, page type, same claim | client built and tested offline; live calls from the first dev run |
| Token Factory `Qwen/Qwen3-Embedding-8B` | near-duplicate clustering (replaced `BAAI/bge-en-icl`, which returned 404) <!-- numbers ok: 404 (HTTP status) --> | built: wired into clustering and the other-number check; live calls start with the pipeline (#130) |
| Tavily `search` | date-windowed exact-phrase searches | built; used by the spike walker |
| Tavily `extract` | reading the pages a search returns | built |
| Wayback CDX | first capture of each page, capping its date | built |

Every call writes a usage row: model, tokens, cached tokens, Tavily credits, dollars, latency, status and cache hit ([packages/pz/src/schema/usage.ts](packages/pz/src/schema/usage.ts)). The usage report across the dev run is T58 ([#116](https://github.com/vs-githjk/odsc-nebius-hackathon/issues/116)), and lands with that run.

## Limits

- Web pages only. Print-only and paywalled origins are out of scope; the trail goes cold there and says so.
- "Earliest source we found" is not "first use". Pages that were never indexed or archived cannot be found.
- Claims need a number, a range or a distinctive phrase to match on.
- One model answers every typed question. A second model family on same claim was built, measured on E2 and rejected: it lost 23 of 60 true matches and removed no false ones, so it stays off ([#178](https://github.com/vs-githjk/odsc-nebius-hackathon/pull/178), [eval/same-claim/second-model.ts](eval/same-claim/second-model.ts)).

<!-- numbers ok: 23, 60 (XO's live E2 measure of the second model on Nov 16, logged in plan/decisions.md) -->
- Every known failure, with an example you can run, the rule that should catch it, whether it is caught today and who owns it: [docs/limits.md](docs/limits.md), "Where Patient Zero is wrong". Rows that name a test are pinned: the test fails the day the gap closes, so the row can't outlive it.

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

**Where Patient Zero is wrong:** [docs/limits.md](docs/limits.md) lists every failure we know of, each with an example you can run, the rule that should catch it, whether it is caught today and who owns the fix. Rows that name a test are pinned by it, so the page can't say one of those gaps is closed while it is still open. The rest (print origins, search coverage, the roots count) are explained, not tested.

## For agents reading this repo

Start at [llms.txt](llms.txt). The working notes live in `plan/` while the build runs; `plan/README.md` says what every file there holds.

- Decisions live in `plan/decisions.md` (Vidyut's, with his words and dates).
- Rulings made during the build live in `plan/progress.md`.
- Coordination between agents and teammates lives in `plan/board.md`.
- The claims list in `plan/plan.md` ("Claims we will make") is what `make verify` prints, one row per claim.

Teammates and their agents: read [docs/AGENTS.md](docs/AGENTS.md) first.

## License

MIT. See [LICENSE](LICENSE).
