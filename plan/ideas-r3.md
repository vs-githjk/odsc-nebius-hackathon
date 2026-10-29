# Ideas r3 (H4, ambitious): ODSC x Nebius research-agent challenge

Master Planner, 2026-10-28 23:58 PDT. Supersedes plan/ideas.md (r2, REJECTED as boring in plan/decisions.md; kept as history). Team name stays **Says Who** (LOCKED); product names below can differ.
Rubric used: the event's own (Sourced 30, Works end to end 25, Usefulness 20, Agent design 15, Token Factory and Tavily 10; plan/intel.md section 4), scored at "median-quality ship" (the auditor's convention), plus the inferred hidden weight: verification is about 55% of the score.

## Pick one
| | **A. Patient Zero** (recommended: best balance) | **B. Objection!** (boldest swing) |
|---|---|---|
| One line | Paste a viral stat or quote. It hunts the claim backwards through every article that repeated it, draws the family tree over time, and circles the exact hop where the words changed. | Ask a contested question. A prosecution agent and a defense agent each build a sourced case, cross-examine each other's exhibits, and a judge rules only on evidence that survives, then says what would flip the verdict. |
| What a judge remembers a week later | "The one that traced the goldfish attention-span stat to a website that cited nothing." | "The courtroom where exhibits got stamped INADMISSIBLE and the verdict flipped live." |
| Weighted score | **95** | **88** |
| Biggest risk | The web may not link back far enough to make a deep tree | Theatre without substance ("Complexity alone is not a benefit") |
| Week-0 spike retires it by | Tracing 5 claims with fact-checker-published origins by hand-scripted calls | Showing cross-examination catches planted mis-citations better than a neutral checker, same models |

Recommendation: **A, Patient Zero.** Verification is not a feature bolted onto it; the trace is the verification, every edge is two quoted spans, and the honest "trail goes cold" ending is the insufficient-evidence case the rubric asks to see. It also has ground truth (origins already published by human fact-checkers), so we can print a real hit rate in the README. B is the louder swing, but a courtroom-debate framework for claim verification already exists in research (PROClaim, arXiv 2603.28488, March 2026, REPORTED from abstract), and B pays the complexity penalty unless its spike shows a measured gain.

---

## Baseline: what a default Claude gives for "ambitious research agent with sources" (anti-generic filter)
1. Multi-agent debate on a question. 2. Live debate or podcast fact-check overlay. 3. Knowledge-graph answer with a consensus meter. 4. Browser extension that fact-checks any page. 5. Self-updating "living report". 6. Deep research with a critic agent. 7. Citation hallucination detector for AI answers. 8. Fact-check bot for social posts. 9. Voice research assistant. 10. Perplexity for a vertical.
The seed directions in the brief overlap 1 to 5, so every candidate below must name the twist that a team pasting the same prompt would not get.

## All r3 ideas: gates, ambition test, score
Ambition test, three questions: would 10 other teams build this? would Vidyut call it boring? is the wow the verification itself?

| # | Idea | Twist vs closest baseline | Whose mother (signal) | Live demo | Company + consumer | 10 teams? | Boring? | Wow = verification? | Sourced 30 | E2E 25 | Useful 20 | Design 15 | Sponsors 10 | **Total** |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| A | **Patient Zero**: claim genealogy | vs 7: not "is this cited right" but "where was this born and where did it change"; time-walking search, per-hop mutation labels, independent-source count | pass: #9, #11, #7, #6 | pass: trace a claim live, open both spans of the red hop | pass: newsrooms, comms teams, research integrity; anyone about to share a stat | no (closest public code: CogComp/claim_provenance, 2022 research, 1 star; S-kkipie/citogenesis, 0 stars) | no: a tree growing back through time to a dead end is a story | yes: every edge is a verified quote pair | 5 | 4 | 5 | 5 | 5 | **95** |
| B | **Objection!**: adversarial research court | vs 1: admissibility rules are the verification; cross-examination makes each side hunt the other's mis-citations; "what would flip it" triggers live discovery | partial: #13, #18 (one-sided, unreliable deep research); no quote asking for "both sides" | pass | pass: investment bull/bear, policy, consulting; consumers on contested health or money questions | some (debate is baseline #1; PROClaim, DebateCV, CARP exist as papers) | no, if cross-exam is real | yes: stamps on exhibits are verification results | 5 | 4 | 4 | 4 | 5 | **88** |
| C | Second Screen: live stream fact-check pins | vs 2: none strong enough | pass: #20 | weak: quotes come from audio, latency vs web search | pass | yes (ClaimBuster, Factiverse and debate-night hackathon builds, REPORTED) | somewhat | partly | 4 | 3 | 4 | 3 | 4 | 72 |
| D | Living Answer: evidence map that re-verifies itself | vs 3 and 5: citation-rot and new-contradiction alerts | pass: #12, #14 | fail in 30 s: the wow happens over weeks | pass | yes | yes | partly | 5 | 3 | 3 | 4 | 5 | 79 |
| E | Consensus Time-lapse: "what did we know, when?" | animates how evidence on a question shifted year by year using Tavily date filters | partial: no direct quote | pass | weak buyer | no | no | partly: consensus labels are judgement, not checks | 4 | 3 | 3 | 4 | 5 | 73 |
| F | Lens: overlay verdicts on any AI chatbot answer | vs 4 and 7: works on ChatGPT, Perplexity, AI Overviews | pass: #12 to #16 | pass | pass | yes (audit finding 2: Parafact, CiteTrue, StepFun and others) | yes | yes | 5 | 4 | 4 | 3 | 4 | 83 |
| G | Snapshot Notary: hashed, replayable evidence | tamper-evident receipts with drift detection | pass: #6 (fabricated links) | weak: a hash is not a wow | company only | no | yes | yes, but invisible | 4 | 4 | 3 | 4 | 3 | 74 |
| H | Disagreement Planner: research only where 5 open models disagree | model disagreement drives the search plan | fail: no user pain quoted | pass | weak | no | invisible mechanism | partly | 4 | 4 | 2 | 5 | 5 | 77 |

Weighted total = sum of (score / 5 x weight). Several cut ideas live on as layers of A or B (see the cut list).

---

## A. Patient Zero (recommended)
**One line.** Paste a viral stat or quote; Patient Zero walks it back through every article that repeated it to where it was born, shows the family tree on a time axis, and circles the hop where the words changed.

### The wow demo (first 30 seconds, what is on screen)
1. A single input: *"Humans now have a shorter attention span than a goldfish: 8 seconds."* Click **Trace**.
2. A node lights up at the right edge (a 2026 article). Edges start growing leftward along a time axis, 2026 back to 2012. Dozens of reprints snap together into clusters ("37 copies of one Time story").
3. The trail narrows: Time, 2015, then the Microsoft Canada consumer-insights report, 2015, then a Statistic Brain page (dated via Wayback), which cites only "Associated Press".
4. The last node goes grey: **TRAIL GOES COLD. No primary study found. Searched: 14 time-windowed queries, 3 archives.** The header reads **142 articles. 1 independent source. 0 studies.**
5. One hop is ringed red. Click it: the parent and child quotes side by side with a word diff. "average attention span ... 8 seconds" became "shorter than a goldfish"; later "Gen Z" appears from nowhere. Labels: *comparison added*, *population widened*.
(The goldfish chain is REPORTED from secondary write-ups found today: medium.com/psynamic, warc.com, time.com; the week-0 spike confirms what our trace actually finds. If it differs, the demo shows what the trace finds, not this script.)

### The novel mechanism
A research agent whose plan is a **backward graph search through time**:
- **Claim fingerprint.** A model turns the claim into atoms (quantity, unit, subject, population, time, hedge, attributed source) plus surface variants (paraphrases, the number written out, translations).
- **Time-walking search.** Tavily `/search` with `exact_match` on the most distinctive phrase and each variant, `include_published_date`, then `end_date` set just before the earliest node found so far, repeated until nothing earlier appears. Each pass is a step back in time.
- **Explicit edges.** Tavily `/extract` with `query` = the claim returns the span; outbound hyperlinks next to the span are followed as "cites" edges. When a link is dead or missing, `/map` plus `/crawl` with `instructions` look for the cited report on the named site.
- **Inferred edges are labelled as such.** Same wording, earlier date, no link: drawn dashed and marked "inferred by date and wording", never stated as fact (the rubric's "distinguish facts from inference").
- **Code check before model check.** Both spans of every edge must be found verbatim in the fetched text (string match, not a model opinion). Only then does a small model label the hop: faithful, number changed, unit changed, hedge dropped, scope widened, comparison added, attribution shifted, context stripped.
- **Independence count.** Embeddings cluster syndicated copies and wire reprints into one node, so "142 articles" honestly becomes "1 independent source". No research agent we found reports this; most count links.
- **Stop rules (written, visible in the trace).** ORIGIN FOUND (a primary document contains the claim and nothing earlier exists), TRAIL GOES COLD (a node cites nothing and N earlier-window searches return nothing), or PARTIAL (budget hit). Each ends with "what we searched".
- **Origin versus viral.** The final card compares the viral version with the origin's own words: "The viral claim says X. The earliest source says Y."
- **Receipts.** Every span is stored with the fetch time and a SHA-256 of the extracted text, plus the Wayback snapshot link (read-only CDX lookup), so any reader can replay the evidence even if a page changes.
- **Prompt-injection hygiene.** Page text only ever enters prompts as quoted data fields; the eval set includes one poisoned page that is quoted but not obeyed.

### Who it is for and why they care
- **Primary user: a fact-checker or reporter** deciding whether a statistic can run, and what the correct, citable version is. Today this is hours of manual link-chasing (the Quote Investigator style).
- **Pain signal 1** (research.md #9, jruohonen, HN, 2026-08-16): "Sometimes a real paper is attached to a claim it does not support ... it is not sufficient to check whether the meta-data (bibliography) is correct." Patient Zero checks the claim at every hop, not the bibliography.
- **Pain signal 2** (research.md #7, NYT via Fortune, 2026-05-19/24): invented or misattributed quotes in a published book on truth. Misattribution is a mutation type the hop labels catch. Supporting: #11 (ulrashida, "drawing support from citations that don't actually say those things") and #6 (CJR: AI search wrong on more than 60% of news-citation queries).
- **Company:** newsrooms and fact-check desks; comms and brand teams watching a stat about them mutate; publishers' research-integrity teams; think tanks. **Consumer:** anyone about to share a stat, and anyone whose chatbot repeated one (mutated claims are what models absorb).
- **Moat:** every trace adds to a shared citation graph of the viral web. Domains that keep turning up as cold-trail origins (a "Statistic Brain" pattern) become a learned source-reputation signal, and the labelled hops become a fine-tuning set for a cheaper mutation model. Neither exists in a plain search-plus-LLM agent.

### Rubric scores (median-quality ship)
| Criterion | Score | Why |
|---|---|---|
| Sourced and verifiable (30) | 5 | Every edge is two quoted spans with links and dates; the mutation is shown against the source; explicit vs inferred edges separate fact from inference; cold trail names the gap. Opening a citation lands on the highlighted words, which is the evidence line verbatim |
| Works end to end (25) | 4 | Real Tavily and Token Factory calls; COLD TRAIL and PARTIAL are built-in failure states; empty and failed extracts are shown, not hidden. Not 5 because traces take minutes and link-following is the fragile part (spike) |
| Usefulness (20) | 5 | Named user, named decision ("can this stat run, and what is the true version?"), and a measured saving: minutes of trace vs the hours a fact-checker spends; not snippets repeated |
| Agent design (15) | 5 | Query planning, refinement and stopping are the visible core (time-walk, stop rules); "how evidence is selected, deduplicated, and checked" maps one to one onto rerank, embedding clusters and the verbatim check; cost and latency per trace printed |
| Token Factory and Tavily (10) | 5 | Six Tavily capabilities and five Token Factory capabilities with distinct roles (below); source links survive into the tree by construction |
| **Weighted** | **95** | |

### Token Factory and Tavily: who plays which role
Model IDs are from Nebius pages and the Nov 9 replacement list; live availability and prices are UNRESOLVED until smoke call 2 (`GET /v1/models`). None is on the Nov 9 removal list.
| Role | Service | Why this one |
|---|---|---|
| Claim fingerprint, origin-vs-viral verdict, stop decisions | Token Factory `MiniMaxAI/MiniMax-M3` (1M context) or `reflection/beam` ($0.25 in / $1.00 out per M, REPORTED) | long context for whole-tree reasoning; Beam if cost per trace matters |
| Hop mutation labels (many calls per trace) | Token Factory `Qwen/Qwen3-30B-A3B-Instruct-2507`, `json_schema` output, `logprobs` as a confidence signal | small and cheap; runs on every edge |
| Tie-breaker on disputed hops | Token Factory `deepseek-ai/DeepSeek-V4-Pro-0813` or `zai-org/GLM-5.2` | a second model family, so one model's bias is not the verdict |
| Reprint clustering | Token Factory `/v1/embeddings` (`BAAI/bge-en-icl`) | independence count |
| Which candidates to expand within budget | Token Factory `/v1/rerank` | the search frontier is ranked, not first-N |
| Eval harness over 30 claims | Token Factory batch inference (`/v1/operations`) | cheaper, higher limits |
| Stretch: cheaper mutation model | Token Factory fine-tuning (LoRA SFT) on our labelled hops | earns its place only if it cuts cost per trace at equal accuracy |
| Finding repetitions and walking back in time | Tavily `/search`: `exact_match`, `end_date`, `include_published_date`, `include_raw_content`, `topic` news and general | `exact_match` is Tavily's own "verbatim matches" feature (changelog, Feb 2026) |
| The span and the outbound citation | Tavily `/extract` with `query`, `format` markdown | span plus links near it |
| Cited report not linked or link dead | Tavily `/map` and `/crawl` with `instructions` | find "the attention report" on microsoft.com |
| Re-check a living trace | Tavily `max_age_hours=0` | fresh fetch for the watch layer |
| Report what we quoted | Tavily `/feedback` with `used_citations` | the API asks for exactly this |
Nebius AI Cloud GPUs: not earned for this idea; we say so in the README rather than rent a GPU for show.

### Staged scope (about 105 of 150 to 170 person-hours planned; the rest is buffer for review lag and a late 4th teammate)
| Stage | Dates | What ships | Person-hours |
|---|---|---|---|
| Week 0 | Oct 29 to Nov 1 | the spike below; repo, invariants file, keys; 30-claim ground-truth set with origins published by human fact-checkers (Quote Investigator, Snopes, BBC More or Less, Full Fact, Wikipedia's list of citogenesis incidents; sources REPORTED until each is opened) | 15 |
| **Core, E2E by Nov 8** | Nov 2 to Nov 8 | API that traces one claim to a JSON graph: fingerprint, time-walk search, extract spans, link follow, verbatim check, one-model hop labels, stop rules, cost and latency per trace, a static tree render. Must run before the Nov 9 model removals with pinned models | 40 |
| Layer 1: the experience | Nov 9 to Nov 13 | animated time-axis tree, red-hop diff panel, reprint clusters and independence count, receipts (hash plus Wayback link), eval run on all 30 claims with hit rate in the README | 30 |
| Layer 2: depth | Nov 14 to Nov 17 | tie-breaker model on disputed hops, Wayback drift check ("this page was edited after it was cited"), poisoned-page test, "paste an AI answer, trace every stat in it" mode | 20 |
| Stretch (only if Layer 2 is done) | any time | LoRA mutation model, infographic stats via `nvidia/Nemotron-3.5-Super-VL`, "Trace this" bookmarklet, public atlas of traced claims | 0 planned |
| Freeze, video, submit | Nov 18 to Nov 19 | feature freeze Nov 18; video and README; submit Nov 19 (internal D 23:59 PT) | buffer |
**Cut line:** core plus Layer 1 is a complete, winning entry. Layer 2 items drop one at a time from the bottom; nothing in Layer 2 is in the video unless built.

### Biggest risk and the week-0 spike
Risk: the trail is shallow. If Tavily's index, dates and extracted links cannot reach pre-2016 pages, the tree is two nodes and A collapses into a quote check (the r2 idea we rejected).
Spike (Oct 29 to Nov 1, one person, about 6 hours, hand-scripted calls, no app): 5 claims with published origins (goldfish 8 seconds; "a 100-word AI email uses a bottle of water"; the Einstein "insanity" quote; Mehrabian 7-38-55; one Wikipedia citogenesis incident). Measure per claim: earliest date reached, whether `/extract` markdown keeps hyperlinks (UNRESOLVED: the docs list no links field), whether `include_published_date` returns dates on old pages, Tavily credits and Token Factory dollars per trace.
**Pass:** the trace reaches the fact-checker's origin, or the documented dead end, on 3 of 5, within about 150 Tavily credits and $0.50 per trace. **Fail plan:** narrow the product to AI-era claims (2023 onward, better indexed, and the stats people argue about now), add Wayback CDX as the date and link fallback; if that also fails, go to B.
Credit note: 30 claims at about 100 credits is about 3,000 credits for one eval run; four free Tavily tiers (4,000 a month) plus Builder Program credit cover two runs. Event credits are still UNRESOLVED.

### Strongest objection and the answer
- *"Most articles don't link their sources, so the tree will be guesses."* Explicit edges (link plus verbatim span on both ends) and inferred edges (date plus wording) are drawn differently and labelled; the time-walk finds the earliest occurrence without links; and "nobody can show where this came from" is a real, publishable finding. The README prints the hit rate on 30 claims with known origins, misses included.
- *"Fact-checkers already traced the goldfish."* Known cases are the ground truth, not the product. The video also traces a claim that went viral this month, and the value is minutes instead of hours.

### Is this boring? (honest self-check)
Not on the evidence: the output is a picture nobody has seen a research agent draw, the search runs backwards through time, and it ends in a story with a villain hop. It becomes boring in exactly one case: shallow trees. That is why the spike measures depth first and has a kill rule. A second honest caveat: "provenance tracing" is a known idea in research (CogComp, 2022) and vendor talk; what is new is a working, measured agent with mutation labels and an independence count on the open web.

---

## B. Objection! (boldest swing)
**One line.** Ask a contested question; two agents on different open model families build opposing sourced cases, cross-examine each other's exhibits, a clerk admits only evidence that passes verification, and a judge rules and names what would flip the verdict.

### The wow demo (first 30 seconds)
1. Question: *"Did return-to-office mandates raise productivity?"* The screen splits: PROSECUTION (yes) on the left, DEFENSE (no) on the right, judge's verdict meter in the centre at 50/50.
2. Exhibit cards stream in, each with a source, a date and a quote. The clerk stamps them: green **ADMITTED** (quote found verbatim, dated), red **EXCLUDED: quote not on page**, amber **MERGED: same press release as Exhibit P2**.
3. Cross-examination: the defense flags Exhibit P4. The card expands to show the sentence after the quote: "...among call-centre staff only." Stamp: **CONTEXT STRIPPED**. The meter swings.
4. The judge rules on admitted exhibits only, then: **"This verdict flips if a controlled study after 2024 shows X."** Click **Order discovery**: both sides search for it live; the verdict updates or holds, with the reason.

### The novel mechanism
- **Verification as an incentive, not a pass.** A neutral checker has no reason to dig; each bench is rewarded for breaking the other side's exhibits (quote present? context stripped? stale? same origin?). Cross-examination is adversarial verification.
- **Admissibility rules are code first:** verbatim span on the fetched page, a date, a source type, and a duplicate-origin rule (embeddings plus a light genealogy hop: six articles quoting one press release count as one exhibit).
- **Flip conditions drive the next search.** The judge outputs the decisive missing evidence as a search spec; "discovery" is a targeted Tavily run. That is the rubric's "when the agent refines its search or stops", made visible.
- **"Case dismissed: insufficient evidence"** is a first-class verdict.
- Grounding, not novelty claim: PROClaim (courtroom roles, admissibility scoring, +10 points over plain multi-agent debate on Check-COVID, REPORTED from abstract) and CARP (heterogeneous support and refute teams) exist as papers. Our additions are cross-examination for context stripping, flip-condition discovery, the independence rule, and a product a person can watch.

### Who it is for and why they care
- **Primary user: an analyst writing a bull and bear case** (investment, policy or consulting), where "red team the thesis" is already the habit. **Consumer:** anyone deciding a contested health, money or parenting question who is tired of one-sided AI answers.
- **Pain signal 1** (research.md #18, bengkoang, HN, 2026-09-16): "the deep research are not reliable at all ... the supporting concept just plain hallucinate."
- **Pain signal 2** (research.md #13, dirkt, HN, 2026-06-29): "More often than not the sources don't actually say anything about the topic." Plus the rubric's own line: "Identify conflicting evidence or gaps". Honest gap: no signal in research.md asks for "both sides" in those words.
- **Moat:** the transcripts of rulings and exclusions are a labelled dataset of why evidence fails, and heterogeneous benches are a natural fit for an open-model catalogue that one closed vendor cannot offer.

### Rubric scores (median-quality ship)
| Criterion | Score | Why |
|---|---|---|
| Sourced and verifiable (30) | 5 | Only admitted exhibits reach the ruling; every exhibit opens on its quote; conflicting evidence is the whole format |
| Works end to end (25) | 4 | Dismissal is a built-in failure state; more agents mean more failure surface and longer runs |
| Usefulness (20) | 4 | Real decision, but the user is broader than A's and the pain evidence is indirect |
| Agent design (15) | 4 | Rich trace, but "Complexity alone is not a benefit" bites unless the ablation shows a gain |
| Token Factory and Tavily (10) | 5 | Three or four model families in distinct roles; search, extract, discovery runs |
| **Weighted** | **88** | up to 95 if the spike shows a measured gain that lifts Agent design and Usefulness to 5 |

### Token Factory and Tavily: who plays which role (IDs UNRESOLVED until smoke call 2)
| Role | Service |
|---|---|
| Prosecution bench | `deepseek-ai/DeepSeek-V4-Pro-0813` |
| Defense bench | `zai-org/GLM-5.2` (different family from prosecution) |
| Judge and flip conditions | `MiniMaxAI/MiniMax-M3` (long context holds the whole record) |
| Clerk labels (context stripped, stale, source type) | `Qwen/Qwen3-30B-A3B-Instruct-2507`, `json_schema` |
| Duplicate-origin rule | `/v1/embeddings`; `/v1/rerank` to pick each side's strongest exhibits |
| Eval over a labelled claim set | batch inference |
| Each side's research | Tavily `/search` (advanced, `include_published_date`, `include_domains_mode` prefer per side), `/extract` with `query` for spans and the sentences around them |
| Discovery | Tavily `/search` with the judge's spec (`start_date`, `exact_match`); optional `/research` mini for a background brief |

### Staged scope (about 110 person-hours planned)
| Stage | Dates | What ships | Person-hours |
|---|---|---|---|
| Week 0 | Oct 29 to Nov 1 | spike below; 40 contested claims with known verdicts (a public real-world claim-verification set such as AVeriTeC, REPORTED, licence to check) | 15 |
| **Core, E2E by Nov 8** | Nov 2 to Nov 8 | two benches, clerk with code-first admissibility, judge ruling as JSON, dismissal state, text UI, cost and latency per case | 45 |
| Layer 1 | Nov 9 to Nov 13 | courtroom UI with stamps and the meter, cross-examination, flip conditions and discovery | 30 |
| Layer 2 | Nov 14 to Nov 17 | ablation in the README (court vs single agent vs neutral checker, same models), duplicate-origin rule, poisoned exhibit test | 20 |
| Stretch | | genealogy hop for hearsay (borrowed from A), shareable case file | 0 planned |
**Cut line:** core plus cross-examination is the minimum that is not theatre; the courtroom skin is cut before the ablation, never the reverse.

### Biggest risk and the week-0 spike
Risk: it is a debate skin on an ordinary agent, and judges mark it down as complexity.
Spike (about 8 hours): 20 claims with planted mis-citations (a quote cut before a limiting sentence, a stale stat, a fake quote). Run cross-examination and a neutral checker with the same models. **Pass:** cross-examination catches clearly more planted errors (at least 5 more of 20) at under about $0.30 and 3 minutes per case. **Fail:** B is theatre; drop it and go with A.

### Is this boring? (honest self-check)
Not to watch: the stamps and the swinging verdict are memorable. The honest risk is the reverse of boring: judges may find it showy. And "AI debate" is the first idea a default Claude gives (baseline #1), so B only stands apart if cross-examination and discovery visibly do work a single agent does not, with numbers.

---

## Cut ideas (one line each)
- C. Second Screen (live stream fact-check pins): crowded (ClaimBuster, Factiverse, debate-night hackathon builds, REPORTED), quotes come from audio so verbatim checks are weak, and the rubric demo is "run a question"; a transcript line could later feed A's "trace this".
- D. Living Answer (self-re-verifying evidence map): the wow happens over weeks, not 30 seconds; it becomes A's watch layer (`max_age_hours=0` re-trace, alert on a new mutation).
- E. Consensus Time-lapse: consensus labels at each date are judgement calls with no ground truth; its time axis lives on as A's tree layout.
- F. Lens over any AI chatbot answer: answer-audit tools are crowded (plan/audit.md finding 2); it survives as A's "paste an AI answer, trace every stat" mode.
- G. Snapshot Notary: right idea, invisible wow; it is the receipts layer in A and B.
- H. Disagreement Planner: clever but no quoted user pain and nothing to see; heterogeneous model families live on in B's benches and A's tie-breaker.
- r2 Receipts and Says Who (persona-swapped citation checkers): rejected in decisions.md; not re-proposed.

## What Vidyut decides
1. Pick A or B (or "A, with B's cross-examination as a stretch"). 2. Product name (A: "Patient Zero"; alternatives "Telephone", "Origin Story"; no name-collision search was run for these). 3. Go for the week-0 smoke calls and spike (research.md section 5 calls first; keys are his).

## Sources checked for r3 (2026-10-28, 23:53 to 23:57 PDT)
- WebSearch "AI tool trace viral statistic back to original source citation chain mutation provenance 2026": Microsoft VeriTrail (traces errors inside multi-step generation, not across the web), InceptID, Trace-It; no product that traces a stat's mutations across the web found.
- WebSearch "adversarial debate research agent prosecutor defense judge evidence verification": PROClaim arXiv 2603.28488 (abstract via search summary, REPORTED), DebateCV, CARP, D3, DEFAME.
- `gh search repos` "claim provenance", "citogenesis", "citation chain trace", "stat origin tracer", "claim genealogy": top hits CogComp/claim_provenance (1 star, 2022), S-kkipie/citogenesis (0 stars, 2026-08), Zzz-qwq/citogenesis (a narrative game); the last three queries returned nothing.
- WebFetch docs.tavily.com Extract reference: params `urls`, `query`, `chunks_per_source`, `extract_depth`, `include_images`, `include_favicon`, `format`, `timeout`, `include_usage`; response has no links field (VERIFIED), so hyperlink survival in markdown is UNRESOLVED and is in the spike.
- WebSearch on the goldfish 8-second origin: Microsoft Canada 2015 report citing Statistic Brain, which cited "Associated Press" (REPORTED, secondary sources only).
NOT CHECKED: name collisions for "Patient Zero", "Objection!"; AVeriTeC licence; PROClaim code; Wayback CDX rate limits; Token Factory fine-tuning model list; live model availability and prices.
