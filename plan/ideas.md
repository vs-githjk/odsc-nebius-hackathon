# Ideas (H4): ODSC x Nebius research-agent challenge

Master Planner, revision 2, 2026-10-28 23:37 PDT. This revision applies Master Auditor's FIX list (plan/audit.md, "H4 ideas oversight"): scores redone, each idea pinned to one user and task, the measurement put first, the cookbook comparison reframed as a credited ablation, plans cut to about 110 person-hours, and team names updated.

Scoring: the official rubric from the event app (`plan/intel.md` section 4: Sourced and verifiable 30, Works end to end 25, Usefulness 20, Agent design 15, Use of Token Factory and Tavily 10), plus the hidden weights (verification is about 55%, the README and video are the whole pitch, injection hygiene, cost and latency per answer, a named user). Convention: score what a judge sees if the plan ships at median quality, not best case. There is one challenge and no prizes announced yet; re-check when the prize email arrives. Nothing here conflicts with `plan/decisions.md`.

## Pick one (close call)

| | B. Says Who (recommended, narrowly) | A. Receipts |
|---|---|---|
| What it does for whom | A research agent for reporters and editors. Ask "Did <official> say <X>?" or "Is <stat> right?" and it finds the primary source, checks the words verbatim, and shows where the claim first appeared. Paste a draft and it runs the same check on every quote and number in it | A research agent for a consultant writing a vendor due-diligence brief. Ask "Is <vendor> SOC 2 certified, who are its named customers, any lawsuits?" and every sentence of the answer opens to the highlighted words that support it, or is marked "insufficient evidence" |
| What sets it apart | Measured: catch rate on a published set of drafts with planted errors, and checker precision and recall on 60 hand-labelled pairs | Measured: checker precision and recall on 60 hand-labelled pairs, and a credited, pre-registered ablation of the Nebius deep-research pattern with and without a verification pass |
| Weighted score | **92** | **88** |
| Trade-off | Sharpest user and the most memorable demo, and few research-agent entries will pick it. But quotes from audio or video are often not on the web, so some checks honestly end "could not confirm", and fact-checkers are a common hackathon category | Buyers with money (consultancies, procurement; the Deloitte refund is the cost) and a natural question-first flow. But its core is what any team that reads the rubric will build, so it stands out only on the published numbers |
| Planned load | about 110 of 150 to 170 person-hours | about 110 of 150 to 170 person-hours |

**Recommendation: B, Says Who, by a small margin.** After the fixes both share the same strength (a measured checker), so the deciding line is Usefulness: B's user, task and harm are concrete (Ars Technica fired a reporter over AI-invented quotes in Feb 2026), and the 30-second demo is about the user, not about other agents. B's question mode makes it a research agent first, as the challenge demands. Pick A if you would rather target a buyer with money and a broader product after the hackathon. The gap (92 vs 88) is within one judge's noise; neither is a wrong pick.

**Team name: Says Who.** Low collision (one 6-star repo), memorable, and a question, which fits a research agent. It also works for A.

---

## B. Says Who (recommended)

**One line:** a research agent for reporters and editors that answers "did they really say that?" and "is that number right?" with the primary source, a verbatim check and the earliest appearance, and runs the same check across a whole draft before it publishes.

**User and task.** A reporter or editor at an outlet with no research desk, on deadline, who must confirm quotes and figures, sometimes after AI helped pull them. Task: confirm every quote and figure in a story against its primary source before publishing.
- Ars Technica retracted a Feb 13, 2026 article whose AI-extracted quotes from a two-page blog post were invented, and later fired the reporter (TheWrap, https://thewrap.com/media-platforms/journalism/ars-technica-fires-ai-reporter-fabricated-quotes ; OECD AI incident 2026-03-03; REPORTED, several outlets agree).
- The NYT found invented or misattributed quotes in the book "The Future of Truth" (Fortune, 2026-05-24, https://fortune.com/2026/05/24/ai-hallucinations-scientific-research-authors-medical-journal-treatment/ ; research.md signal 7).
- CJR Tow Center: eight AI search tools gave incorrect answers to more than 60% of news-citation queries and fabricated links (2025-03-06, https://www.cjr.org/tow_center/we-compared-eight-ai-search-engines-theyre-all-bad-at-citing-news.php ; signal 6).

**Gates.** Whose mother: yes (above). Live demo: yes, every call is real and the judge opens the transcript on the highlighted words. Company plus consumer: company = publishers, comms and PR teams, book publishers (Press Gazette launched a newsroom tool "to stop AI fakes before publication", Sep 2026, Nieman Lab; REPORTED, contents not read); consumer = readers who now assume quotes need checking (signal 20). Moat: a shared claim archive per desk (a quote confirmed once is known to every editor) and workflow lock-in through a Docs side panel (stretch).

**Wow in the first 30 seconds.** Question mode: "Did <official> say '<quote>' in <speech>?" The agent finds the official text transcript, shows the closest actual sentence highlighted, and labels it "no verbatim match in the official transcript (transcript fetched and checked); closest actual words: ...", with the earliest place the altered version appeared online. Then the draft mode: paste a paragraph, five items become a checklist (one quote misattributed, one figure outdated with the agency's newer release, three confirmed), exported as a memo using a fact-checker's scale (confirmed, misattributed, outdated, could not confirm). Demo content uses public officials' published texts and our own planted drafts, never a private person.

**Labels (fix 6).** An empty Tavily `exact_match` result means "no verbatim match found in the search index (searched: ...)". The label "misquoted" is used only after the primary transcript itself was fetched and checked. Never "fabricated".

**How it scores.**
| Criterion | Score | Why |
|---|---|---|
| Sourced and verifiable (30) | 5 | primary source, verbatim span, dates, earliest appearance; facts vs inference marked |
| Works end to end (25) | 4 | real calls; "could not confirm, here is what we searched" is the handled insufficient-evidence state the rubric asks for; demo and benchmark stay on text-sourced quotes |
| Usefulness (20) | 5 | one named user, one task, measured catch rate and time saved per check |
| Agent design (15) | 4 | lean: two models, a written stop rule, a provenance trace; 5 is reachable with a clear trace walkthrough |
| Token Factory and Tavily (10) | 5 | see below |
| Weighted | **92** | (5x30 + 4x25 + 5x20 + 4x15 + 5x10) / 5 |

**Agent loop and stop rule.** Question or draft in; extract checkable claims (quotes, figures, attributions) into a json_schema ledger; for each: search the speaker's or agency's own domains first (`include_domains_mode="prefer"`), then the open web, at most 2 search rounds; fetch the primary text and check verbatim plus support with the checker model; one date-filtered search for earliest appearance; label and stop. Stop when every claim is labelled, after the second round, or at the per-answer credit and token cap (value set from W0 measurements). Source text is passed as data, never as instructions (a poisoned-page test is in the eval).

**Not generic because** default research agents answer open questions and list links; Says Who researches a specific claim back to its origin, tests the words verbatim against the primary text, dates its first appearance, and publishes how often it is right. It differs from baseline #3 (news fact-checker) by being question-first with a measured checker, not a draft scanner with a verdict.

**Strongest objection and answer.** "The challenge asks for a research agent; this is a fact-checker." Answer: the primary mode is a question in and a sourced answer out, run through the same trace the rubric asks judges to walk; the draft mode is that agent called once per claim, and the README leads with "research agent". Second objection: "most quotes come from audio." Answer: "could not confirm" with the search log is what a human fact-checker reports too, and we scope the claims to text sources and say so.

**Models and endpoints (IDs from Nebius pages; live availability and prices UNRESOLVED until smoke call 2 lists `/v1/models`).**
| Use | Model or endpoint | Why | Maturity |
|---|---|---|---|
| Planner and answer writer | `MiniMaxAI/MiniMax-M3` | 1M context for long transcripts; not on the Nov 9 removal list | emerging |
| Checker | `Qwen/Qwen3-30B-A3B-Instruct-2507` | cheap, different family from the writer, so its errors are less correlated; `logprobs` for confidence | emerging model, proven API |
| Claim ledger | `response_format` json_schema | claim, source URL, span, label, dates | proven |
| Primary-source search | Tavily `/search` with `include_domains_mode="prefer"`, `include_raw_content`, `include_published_date`, `topic="news"` | official domains first, full text for spans | proven (prefer mode emerging) |
| Verbatim test | Tavily `exact_match` | Tavily pitches it for "verbatim matches" in due diligence | emerging |
| Transcript spans | Tavily `/extract` with `query` | the passage nearest the claim on a known page | proven endpoint, `query` emerging |
| Earliest appearance | Tavily `start_date` and `end_date` filters | date the first appearance of a wording | proven |
| Stretch | `/crawl` on official sites, Docs side panel, tie-breaker model, `/feedback` with `used_citations`, MCP tool | only after the gate passes | emerging to experimental |

### Month shape for B (about 110 person-hours planned; the rest is buffer for review lag)
Lanes by skill (names once teammates are known): **L1 agent core** (question mode, claim extraction, search plan, stop rule, cost line), **L2 verification** (verbatim and support checker, earliest appearance, labels, poisoned-page guard), **L3 UI** (answer and checklist view, transcript panel with highlight, memo export), **L4 eval, demo and repo** (labelled set, planted-error set, README, CI, video).

| Week | L1 agent core | L2 verification | L3 UI | L4 eval, demo, repo | Gate |
|---|---|---|---|---|---|
| W0 Wed Oct 28 to Sun Nov 1 | keys, smoke calls, pin models from `/v1/models` | spike: verbatim check on 10 real quotes with text transcripts | skeleton | repo, invariants, 20 labelled pairs | Vidyut: pick, team name, teammates by Sat Oct 31, key go-aheads |
| W1 Mon Nov 2 to Sun Nov 8 | question mode end to end, ledger, traces | checker and labels, could-not-confirm path | answer view with spans | labelled set to 40, planted-error set v0 (10 drafts), CI | **First end-to-end demo Sun Nov 8 if the team is formed by Oct 31, else Tue Nov 10** |
| W2 Mon Nov 9 to Sun Nov 15 | Nov 9 model re-check; draft mode (claims per paragraph) | earliest appearance, poisoned-page test | checklist and memo export | labelled set to 60, planted set to 20 drafts, first precision, recall and catch-rate numbers | Storyboard approved by Vidyut Sun Nov 15 |
| W3 Mon Nov 16 to Thu Nov 19 | thin `verify_claims()` function | fixes from the judge dry run | polish | README with the numbers, diagram, trace walkthrough, `.env.example`; video Wed Nov 18; judge dry run Wed | Freeze Tue Nov 17 23:59; submit Thu Nov 19 by 12:00 PT |
| Stretch (only after W2 gate) | MCP tool, `/crawl` of official sites | tie-breaker model | Docs side panel | `/feedback` used_citations | |

---

## A. Receipts (runner-up)

**One line:** a research agent for a consultant writing a vendor due-diligence brief, whose checker accuracy is measured and published, so every sentence in the brief either opens to the words that support it or says "insufficient evidence".

**User and task.** A consultant or procurement analyst who must send a client a due-diligence brief on a vendor (certifications, named customers, funding, litigation, leadership) and is personally on the hook for every line.
- Deloitte Australia partially refunded an AU$440,000 government report after a researcher found a made-up quote attributed to a Federal Court judge and citations to research that does not exist (The Register, 2025-10-06, https://www.theregister.com/2025/10/06/deloitte_ai_report_australia/ ; REPORTED, many outlets agree).
- Analysts: "the deep research are not reliable at all ... the supporting concept just plain hallucinate" (HN, 2026-09-16, https://news.ycombinator.com/item?id=49721097 ; signal 18).
- "When I ask an LLM, I trace the sources ... More often than not the sources don't actually say anything about the topic" (HN, 2026-06-29, https://news.ycombinator.com/item?id=48715075 ; signal 13). Consumer side of vendor research: someone gathering Reddit comments on a solar panel vendor through Gemini deep research got a report another model called "hallucinated" (HN 49741488, signal 17; a consumer, not an analyst, and the verdict came from a model, not a check).

**Gates.** All pass: named pain (above); live demo with real calls; company (consultancies, procurement) plus consumer (anyone researching a vendor); moat is the published labelled set and checker accuracy, plus a `verify_claims()` function any agent can call. Honest note: answer-audit tools are crowded (Verol, TruthLayer, Parafact, CiteTrue and others; REPORTED from web searches), so the moat is the measurement, not the feature.

**Lead with the measurement (fix 1).** The README and video open with two numbers: checker precision and recall on 60 hand-labelled claim and source pairs, and the ablation result below. The spans and labels come second, as the proof a judge can click.

**The ablation (fix 3).** "The Nebius deep-research pattern (credited and linked: dev.nebius.com cookbook by Nebius DevRel), with and without a Receipts verification pass": same model, same Tavily, 20 due-diligence questions pre-registered in the repo before the run, every result published. Shown only after checker precision is measured. The payoff on screen is the repaired brief, with claims re-sourced or marked insufficient evidence, not a wall of red. Framed as building on the cookbook, since the verification pass is a thin `verify_claims()` function the cookbook agent can call.

**Wow in the first 30 seconds.** "Is <vendor> SOC 2 Type II certified, and which customers does it name publicly?" The brief appears; each sentence opens to the highlighted words on the vendor's trust page or a news report; one claim reads "insufficient evidence: the vendor's page says 'SOC 2 in progress' (fetched today)"; a cost and seconds line closes it. Then the ablation chart.

**Labels (fix 6).** Same rule as B: an empty `exact_match` result is "no verbatim match found in the search index", never "fabricated".

**Agent loop and stop rule (lean design).** Two models only (writer `MiniMaxAI/MiniMax-M3`, checker `Qwen/Qwen3-30B-A3B-Instruct-2507`). Plan, search (at most 2 rounds), draft into a json_schema claim ledger, check each claim against its span (Tavily `/extract` with `query`, `max_age_hours=0` re-fetch, `exact_match` for quoted words), repair each failed claim with one targeted search, then label and stop. Stop when every claim is labelled, after one repair round, or at the per-answer cap (set from W0 measurements).

**How it scores.**
| Criterion | Score | Why |
|---|---|---|
| Sourced and verifiable (30) | 5 | sentence-level spans, labels, dates, insufficient evidence said out loud |
| Works end to end (25) | 4 | real calls, unreachable and paywalled sources handled as states |
| Usefulness (20) | 4 | one named user and task; still a broader category than B's |
| Agent design (15) | 4 | lean loop with a written stop rule |
| Token Factory and Tavily (10) | 5 | `/extract` with `query`, `exact_match`, `max_age_hours`, `include_domains_mode`, json_schema, logprobs |
| Weighted | **88** | (5x30 + 4x25 + 4x20 + 4x15 + 5x10) / 5 |

**Strongest objection and answer.** "Every serious team builds verified citations." Answer: almost none will publish how often their checker is right, or run a pre-registered ablation against the sponsor's own reference pattern; that is the entry. If the week-0 baseline run shows few unsupported claims, the ablation still reports it honestly and the demo leans on the insufficient-evidence and repair cases.

### Month shape for A (about 110 person-hours planned)
| Week | L1 agent core | L2 verification | L3 UI | L4 eval, demo, repo | Gate |
|---|---|---|---|---|---|
| W0 Wed Oct 28 to Sun Nov 1 | keys, smoke calls, pin models | spike: span finder on 10 claim and URL pairs | skeleton | repo, invariants, baseline harness on 10 questions, 20 labelled pairs | Vidyut: pick, team name, teammates by Sat Oct 31 |
| W1 Mon Nov 2 to Sun Nov 8 | plan, search, draft into ledger, traces | checker, labels, insufficient-evidence path | brief view with spans | labelled set to 40, pre-register 20 questions, CI | **First end-to-end demo Sun Nov 8 if the team is formed by Oct 31, else Tue Nov 10** |
| W2 Mon Nov 9 to Sun Nov 15 | Nov 9 model re-check, cost line | repair round, contradictions, poisoned-page test | source panel with highlight | labelled set to 60, precision and recall, then the ablation run | Storyboard approved Sun Nov 15 |
| W3 Mon Nov 16 to Thu Nov 19 | thin `verify_claims()` | judge dry-run fixes | polish | README leading with the numbers, video Wed Nov 18, judge dry run | Freeze Tue Nov 17 23:59; submit Thu Nov 19 by 12:00 PT |
| Stretch (only after W2 gate) | MCP tool | tie-breaker model, embedding dedupe | audit-paste mode | `/feedback` used_citations, Sandboxes numeric recompute (beta, needs access) | |

What only Vidyut decides, for either idea: the pick, the team name, teammates and lanes, account and key go-aheads (Builder Program, Sandboxes access), the storyboard approval, any deploy, and the final submit.

---

## All scored ideas (revision 2)
| Idea | Gates | Sourced 30 | E2E 25 | Useful 20 | Design 15 | Sponsors 10 | Weighted |
|---|---|---|---|---|---|---|---|
| B. Says Who (question mode + draft mode) | pass | 5 | 4 | 5 | 4 | 5 | **92** |
| A. Receipts (vendor due-diligence brief) | pass | 5 | 4 | 4 | 4 | 5 | **88** |
| D. Model-picker that verifies by experiment | fails "whose mother" | 4 | 4 | 2 | 4 | 5 | 74 |
| C. Manuscript citation auditor | pass | 4 | 3 | 4 | 4 | 3 | 73 |
| E. Legal pre-filing cite-checker | pass | 4 | 3 | 4 | 3 | 2 | 68 |

Revision 1 had A at 91 and B at 87. The auditor's scores (A 84, B 92) were not blind; the changes above follow its written convention, and each changed point is explained in the score tables.

### Cut (one line each)
- C. Manuscript citation auditor: real pain (Lancet 12-fold rise, NeurIPS desk rejects), but full texts are paywalled or PDF-only so Tavily coverage is weak, and the space is crowded (Grounded AI with Nature, CiteAudit, PaperTeam).
- D. Model-picker that runs test calls on Token Factory: a novel check, but no quoted user pain, and it reads as flattering the sponsor.
- E. Legal cite-checker: the strongest pain (2,231 court cases), but case law is not reliably in web search, the space is crowded (StrictCite, VerusCite, OpenAI Astra for Law, Westlaw), and judges cannot judge legal correctness.
- Living answers that re-verify themselves over time: a feature, not a product; folded in as `max_age_hours=0` re-checks.
- Cookbook clone (decompose, search, long report with numbered links): the generic entry Nebius already publishes.

## Baseline (what a default Claude gives for this prompt; anti-generic filter)
1. Deep research agent that writes a cited report (the Nebius cookbook). 2. Perplexity clone for a domain. 3. News fact-checker. 4. Academic literature review agent. 5. Market and competitor research agent. 6. Medical Q&A with citations. 7. Legal research assistant. 8. Multi-agent swarm (planner, searcher, writer, critic). 9. Investor due diligence agent. 10. Reference checker that confirms cited papers exist.
- B is closest to 3; its twist is question-first claim tracing to the primary text, a verbatim test, the earliest appearance, and a published catch rate.
- A is closest to 1 and 9; its twist is a measured checker and a credited, pre-registered ablation of the sponsor's own pattern.

## Team names
Checked against the names to avoid in intel.md section 6 (no collisions). GitHub searches on 2026-10-28 found none for "verbatim fact check", "on the record fact check" or "fine print ai agent"; "Says Who" has one 6-star repo (per the auditor). No trademark or domain checks were run.
1. **Says Who** (top pick, fits B and works for A): a question, so it fits a research agent; it is exactly what a fact-checker asks.
2. **Receipts** (A only, and only with the descriptor locked into the README title, "Receipts: every sentence shows its source"): the word mostly means expense receipts on GitHub.
3. **Verbatim**: the word-for-word check in one word (fits B).
4. **On the Record**: newsroom idiom (fits B).
5. **Fine Print**: we read the part everyone skips (fits A).
Dropped after the audit: Show Your Work (a 270-star Claude Code plugin), Chapter and Verse (means Bible apps), Paper Trail (an existing log product).

---
CHECKED_AT: Wed Oct 28 23:37 PDT 2026
CHECKED: plan/decisions.md, submission.md, intel.md, research.md, registration.md, audit.md ("H4 ideas oversight"), playbook lessons; web searches on Deloitte Australia, answer-audit tools, newsroom fact-check tools, the Ars Technica retraction; mole README via gh api; GitHub name searches
NOT CHECKED: live model list and prices (no keys); whether official text transcripts exist for the demo quotes (W0 spike); whether the cookbook pattern produces unsupported claims (A's W0 baseline run); Verol, TruthLayer and Press Gazette tool behaviour; trademarks and domains
