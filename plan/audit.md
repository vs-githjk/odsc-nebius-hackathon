# Audit

## H4 ideas oversight

Master Auditor (oversight + red team), 2026-10-28 23:35 PDT. Subject: plan/ideas.md as of 23:30 PDT (planner board line 23:31).

**VERDICT: FIX (C0 H3 M4 L2).** The ideas are sound and feasible in principle, but the 91 vs 87 ranking that makes A "recommended" is not supported: on my scoring B leads (92 vs 84), and A only closes to 88 once it names one concrete user and task. A's core (claim spans, labels, insufficient evidence) is what intel.md section 5 told every planner to build, so it is table stakes. What actually sets A apart is the measurement (checker precision and recall plus a same-model ablation), and that works for B too. The month plan has no buffer. Next: the planner fixes items 1 to 3 below, then the conductor shows Vidyut A and B as close, with the real trade-off. Vidyut decides: the pick and the team name.

### Findings
| # | Sev | Finding | Evidence | Smallest fix | Owner |
|---|---|---|---|---|---|
| 1 | H | The ranking rests on unsupported scores. A's Usefulness 4 has no named task, just "analyst or consultant", and its 30-second demo shows value to AI builders (auditing the cookbook), not to an analyst. A's Agent design 5 sits uneasily with the rubric's "Complexity alone is not a benefit": 3 model families, rerank, embeddings, MCP and repair, with no stop rule written down. B's Works end to end 3 marks down "could not confirm", which is exactly the handled insufficient-evidence state the criterion 2 evidence line asks for | intel.md section 4 rows 2 to 4; ideas.md A score table and B "How it scores" | Re-score with a written convention (below). Show A and B as close, not with A ahead by 4 | planner |
| 2 | H | A's user is too broad, and its core is generic. intel.md section 5 point 1 tells the planner to build "claim-level verification UX" with spans and labels, so any team that reads the rubric with Claude lands there. mole already does verbatim quotes and contradictions. "Audit any AI answer" is crowded beyond Verol and TruthLayer: Parafact, CiteTrue, StepFun Diligence Check, AgentOracle claim verification and a "claim-check receipt" service all exist (WebSearch 23:33) | research.md section 3; ideas.md "What makes it not generic"; WebSearch results listed in the footer | Lead A with the measurement, not the spans. Pin one user and one task, e.g. "a consultant's vendor due-diligence brief", which ties to Tavily's own exact_match pitch and the Deloitte refund. That lifts Usefulness to 4 | planner |
| 3 | H | No buffer in capacity. 145 person-hours against 150 to 170 is 85 to 97% planned load, for 4 volunteers working async over GitHub with review lag. Teammates are not named yet, and W0 (Wed to Sun) carries repo, invariants, baseline harness, 30 labelled pairs, keys and the span spike. A (145 h, two surfaces) is rated greener than B (140 h), which is inconsistent | ideas.md "Scope fit" and the month table; decisions.md "Team of 4, about 2 hours a day" | Plan to about 110 h (65%). Pre-cut the MCP tool, the tie-breaker model, embedding dedupe, /feedback and Sandboxes into a "stretch" column. Labelled set 60, not 100. Move the first E2E gate to Nov 8 only if the team is formed by Oct 31, otherwise Nov 10 | planner |
| 4 | M | The cookbook side-by-side carries risk with the sponsor. The cookbook is by Nebius DevRel (AbdulMajed Raja), who could plausibly be a judge, and "turns the standard report red" reads as "the sponsor's reference hallucinates". A checker false positive on a sponsor artifact is the worst possible on-camera error. The planner's answer (same model, so the design does the work) is fair on method but silent on tone | research.md section 3; intel.md section 1 (likely judge pool, inferred) | Frame it as an ablation that builds on the cookbook: "the Nebius deep-research pattern, with and without a Receipts verification pass", with credit and a link. Run all 20 pre-registered questions and publish every result, no cherry-picking. Show the repaired report as the payoff, not the red marks. Only show it after checker precision is measured. Ship a thin `verify_claims()` function even if MCP is cut, so the "plugs into the cookbook" line is true | planner, L4 |
| 5 | M | A pain signal is misread. ideas.md says "An analyst ran Gemini deep research on a solar vendor". The comment actually says "I wanted to gather Reddit comments about a solar panel vendor" (no analyst), and the "hallucinated" verdict came from another LLM, not from a check | HN Algolia items/49741488, HTTP 200, 23:32 PDT | Reword it as a consumer signal, or drop it. Lead A's user section with Deloitte plus signals 13 and 18 | planner |
| 6 | M | B's fit with the challenge. The challenge is "a research agent that brings its sources" and criterion 2's evidence line says "Run a question". B takes a draft in and gives a memo out, so judges may see a fact-checker, not a research agent. B is also the planner's own baseline #3 ("News fact-checker"), and fact-checkers are a common hackathon category (Verifact, Tunai, MythBustersAI) | intel.md section 4; ideas.md "Baseline" #3; WebSearch 23:33 | If B: add a question mode ("Did <official> say <X>?") that runs the same trace, and lead the README with "research agent" wording | planner |
| 7 | M | Both ideas over-read exact_match. Tavily's own docs warn it "may return fewer results, or empty result fields when no exact matches are found", so an empty result means the quote was not found in the search index, not that it was invented | docs.tavily.com/changelog.md, HTTP 200, 23:32 | Use the label "no verbatim match found (searched: ...)", never "fabricated", unless the primary transcript was fetched and checked. B's wording already does this; make A's match | L2 |
| 8 | L | "Receipts" is ambiguous and weak to own. It does not collide with a known fact-check product (NOT FOUND, details below), but on GitHub the word means expense receipts (vas3k/TaxHacker 6,764 stars, ReceiptsAI, Receipt AI), Nebius has its own invoice-extraction cookbook, and "citation verification receipts" is already a generic term in this space (Towards AI article) | gh search repos receipts, 23:33; WebSearch 23:33 | See the team-name verdict | Vidyut |
| 9 | L | Model picks are fine but not live-tested. The planner already labels this UNRESOLVED, so it is not a fault. Note that Qwen3.8-27B is in the image2text catalog path | deprecation page, line 32 | Run smoke call 2 (`/v1/models`) once Vidyut OKs keys | L1 |

### Re-score (my convention: score what a judge sees if the plan ships at median quality, not best case)
I saw the planner's numbers before scoring (they are in the same file), so this is not blind. Every point that differs is justified against the rubric's evidence line.

| Criterion (weight) | A planner | A auditor | B planner | B auditor | Why the auditor number |
|---|---|---|---|---|---|
| Sourced and verifiable (30) | 5 | 5 | 5 | 5 | both open citations onto highlighted spans with labels |
| Works end to end (25) | 4 | 4 | 3 | 4 | B: "could not confirm, here is what we searched" is the failure state the evidence line asks for; demo stays on text-sourced quotes |
| Usefulness (20) | 4 | 3 | 5 | 5 | A: no named task, and the hero shows value to builders, not analysts (4 once fix 2 lands) |
| Agent design (15) | 5 | 4 | 4 | 4 | A: complexity risk, and no stop rule specified (5 is reachable with a trace walkthrough) |
| Token Factory and Tavily (10) | 5 | 5 | 5 | 5 | both use the stack deeply |
| **Weighted /100** | 91 | **84** (88 after fix 2) | 87 | **92** | |

This is directional. The flip comes down to one point on each of two criteria per idea, which is within single-judge noise. The defensible conclusion: A and B are close, B has the sharper user, and A's lead is not supported.

### Spot-checked facts
| Claim in ideas.md | State | Evidence |
|---|---|---|
| Pain signals 17 and 13 (HN) | Quotes VERIFIED; signal 17's framing MISREAD (finding 5) | hn.algolia.com/api/v1/items/49741488 and /48715075, HTTP 200, 23:32 PDT |
| Tavily exact_match "Best suited for due diligence ... verbatim matches", Feb 2026 | VERIFIED | docs.tavily.com/changelog.md under "February 2026", HTTP 200, 23:32 |
| Checker and tie-breaker IDs (Qwen3-30B-A3B-Instruct-2507, DeepSeek-V4-Pro-0813, GLM-5.2) named as Nov 9 replacements; MiniMax-M3 not on the removal list | VERIFIED on the deprecation page (MiniMax: 0 matches). Live serving and prices UNRESOLVED (no key; settled by smoke call 2) | docs.tokenfactory.nebius.com/model-deprecations-november-2026.md, HTTP 200, 23:32 |

### Strongest objection per idea
- **A.** "Every serious team builds verified citations." The planner's answer, measure it, is the right one and does hold, but only if the README leads with real precision and recall numbers and the A/B. Its second answer, that audit mode plus MCP make it distinctive, does not hold: answer-audit tools are crowded (finding 2), and MCP is the first thing cut.
- **B.** "Newsrooms don't pay; quotes come from audio." Within the rubric that answer holds, since revenue is not scored and "could not confirm" is honest. The planner missed a stronger objection: the challenge asks for a research agent and B is a fact-checker (finding 6). It is fixable with a question mode.

### Team-name verdict
- "Receipts": no collision with a well-known AI fact-check product, repo or hackathon project (NOT FOUND; searched: gh `receipts`, `receipts fact check`, `receipts AI citations`; WebSearch `"Receipts" AI fact-check citations tool app`). It is ambiguous, though (expense-receipt AI, Nebius's invoice cookbook) and generic in this space. Usable only with a descriptor: "Receipts: every sentence shows its source".
- "Says Who": the only GitHub hit is krzyzanowskim/says-who (6 stars, a Chrome extension that tags X posts by people with AI interests). It is low collision and memorable, and it is a question, which fits a "research agent" framing.
- **Safest strong pick: Says Who** if B; if A, "Receipts" with the descriptor locked into the README title. "Show Your Work" collides with a 270-star Claude Code plugin; "Chapter and Verse" means Bible apps.

### Conflicts with plan/decisions.md
None in ideas.md. Separate from the ideas: the folder is still "ODSC x Nebius Hackathon" although decisions.md LOCKs a rename to "ODSC x Nebius Hackathon" after research (ls /Users/vidyutsriram, 23:34); research is done, so the rename is due (conductor, and every brief path changes with it). The plan surfaces 2 ideas, suggests a name, keeps git local and fits the team of 4 at about 2h a day. Three items need Vidyut's go under the standing rules: W3 "deploy link" (a deploy), Sandboxes "request access" (an account action), and the Builder Program sign-ups (accounts and credits). The plan already lists "account and key go-aheads" as his call.

GOAL: odsc-h4-oversight met · due 2026-10-29 00:30 PDT · finished 23:35 PDT
COST: 2 web searches + 5 fetches + 4 gh searches / auditor budget · 6 files read · 6 commands · 0 sub-agents

CHECKED_AT: Wed Oct 28 23:35 PDT 2026
SUBJECT: plan/ideas.md (23:30 PDT); plan folder is not a git repo (no SHA)
CHECKED: plan/decisions.md, ideas.md, intel.md, research.md, submission.md, board.md; HN Algolia items 49741488 and 48715075; Nebius Nov 2026 deprecation page; docs.tavily.com changelog and search reference; gh repo searches (receipts x3, says who, show your work, chapter and verse); WebSearch x2 (Receipts, Says Who)
NOT CHECKED: Verol and TruthLayer behaviour; trademarks and domains; Token Factory live model list and prices (no key); whether the cookbook output actually contains unsupported claims (the planner's week-0 gate); Devpost (never crawled)
UNRESOLVED: live model availability (settled by smoke call 2); whether the cookbook contrast is large enough (settled by the W0 baseline run on 10 questions); whether a cookbook author judges (settled by the judges email)
