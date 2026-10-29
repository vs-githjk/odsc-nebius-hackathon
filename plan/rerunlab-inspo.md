# RerunLab inspiration for Patient Zero
master-planner (senior-review mindset) · 2026-10-29 02:03 PDT · goal odsc-pz-rerunlab-inspo · read-only, nothing run from RerunLab
Asked by Vidyut: "im also building a fact checker app check my github for rerunlab see if we can take inspo from there or we can make idea stronger".

**Verdict: borrow, do not combine.** RerunLab's best assets for this hackathon are its trust rules and its eval method, not its product. Three patterns (a planted trap set, a stop state decided only by code, and strict number matching rules) lift Patient Zero from about 85 to about 92 on the rubric for roughly 7 to 10 net new hours. A combined "trace plus does the source say it" product scores about the same as Patient Zero (85.5) for 12 to 16 more hours and drifts toward the crowded "audit any AI answer" space and the REJECTED Receipts idea. That combined shape already exists as Patient Zero's planned pivot ("the trace you can check"); the borrowings make that pivot cheaper if the head-to-head forces it.

**Where the code is (read this first).** The GitHub repo `vs-githjk/rerunlab` holds only planning docs on `main` (12 files under `plan/`, last push 2026-10-19 06:36 UTC; `gh api .../branches` lists only `main`). The build is a **local, unpushed branch** `build/rerunlab` in `/Users/vidyutsriram/projects/rerunlab` (207 commits, last 2026-10-20 08:08 PDT, 974 tracked files, about 33,000 lines of TypeScript and tests, working tree has uncommitted changes to eval results and screenshots). I read that checkout read-only; every path below is relative to it. Side note for Vidyut, not part of this task: that work exists on one laptop only.

Evidence states: VERIFIED = I read the file or ran a read-only command; ESTIMATE = my judgement. Rubric scores are single-judge estimates, not blind.

---

## 1. What RerunLab is (from the code and README)

1. **Pipeline.** Paste a paper (URL or PDF) and its code repo. A Claude agent reads the paper's table numbers and the code in the user's own GitHub Actions, installs and runs it in Docker (phase 1, explore); then a **clean replay with no agent** reruns the recorded steps in a fresh container (phase 2), and only numbers phase 2 wrote count. A separate job signs the bundle with GitHub's OIDC token and the server recomputes the verdict itself. VERIFIED: `README.md` "How it works", `docs/architecture.md`, `packages/core/src/replay.ts`, `packages/runner/src/agent/loop.ts`, `packages/server/src/oidc.ts`.
2. **Matches / does not match.** Per number (`packages/core/src/match.ts` `compareClaim`): **match** if the rerun rounded to the paper's displayed decimals equals the paper value; **close** if within 1 unit of the last displayed digit AND within 1% (`verdict-rules.ts` `CLOSE_MAX_RELATIVE = 0.01`) or inside a stated spread; else **differs**; plus **not_found** and **unverifiable** (`provenance.ts` reasons such as `agent_written`, `hardcoded_in_source`, `input_file_literal`, `weak_no_context`). Per run, a five-row decision table (`computeVerdict`) gives one of four badges: Reproduced (at least 3 numbers, all match or close, no analysis edit), Partly reproduced, Not reproduced automatically, Could not run automatically, each with listed reasons.
3. **Evidence display.** Each row shows paper number, rerun number, outcome chip, and an evidence drawer with file, line, SHA-256 and excerpt (`apps/web/src/components/report/number-compare-table.tsx`, `outcome-chip.tsx`); a "How the badge was decided" panel lists the reasons and one limit line (`how-decided.tsx`, `apps/web/src/copy/report-page.ts` lines 195 to 203).
4. **Eval.** A planted set of 38 counted cases (8 controls, 30 breaks including 10 adversarial cheats and 8 seeded mutants) plus 3 declared known limits not counted, CORE-Bench capsules, frozen by `eval/cases.lock.json`; metrics with Wilson intervals and a zero-event upper bound (`docs/accuracy-method.md`, `eval/metrics.ts`, `eval/planted/mutate.ts`). Result (`eval/results/latest-scripted.json`, VERIFIED): scripted agreement 68 of 68, false greens 0 of 30 (95% upper bound 9.5%). 89 test files.
5. **State.** Works (per README and tests, not run by me): the deterministic pipeline, clean replay, provenance rules, verdict, report UI, scripted eval. Not done: the **real-agent accuracy run is pending** (README "Accuracy": needs a key and spend approval); the site is not deployed; the code is not pushed; the known-non-reproduction set has n = 1 (`plan/progress.md` R6); the `parts_sum` formula check is switched off after 3 fix rounds (R16); Stata untested.

---

## 2. Overlap, difference, and the combined idea

| | RerunLab | Patient Zero (round 2, planned) |
|---|---|---|
| Question answered | Does this paper's code reproduce the number printed in the paper? | Where did this number come from, and where did its wording change? |
| Input | Paper PDF plus code repo | One stat, quote, or a pasted AI answer |
| Evidence | Numbers in files a clean replay produced (file, line, SHA) | Two verbatim spans per edge on fetched pages (URL, date source, SHA, Wayback) |
| Who decides | Code (`computeVerdict`); the agent only reports observations | Code checks plus a small model for hop labels; stop states planned as rules |
| Number handling | Strict: displayed decimals, whole-number boundaries, close = AND rule, refuse to guess | Planned: atoms with declared transforms (rounding, unit, percent); rules not yet written |
| Honest non-answers | Could not run, Not reproduced, unverifiable reasons | TRAIL GOES COLD, PARTIAL, TOOL FAILED, NO PAGES FOUND |
| Eval | Planted controls, breaks, adversarial cheats, mutants; false-green bar 0 | 20 dev and 10 held-out real claims; hit rate, ablation, head-to-head |
| Search and sponsors | None (Claude, Docker, GitHub Actions) | Tavily time-walk and Token Factory, the rubric's 10-point line |
| Shared core | Verify a number against a source with code, never trust the model's word, show the exact evidence, say "not enough" plainly |

**The combined idea, scored side by side (ESTIMATE, single judge, median build quality, same team and hours):**

| Rubric line (weight) | PZ round 2 as planned | PZ + top borrowings (section 3) | Combined C2: trace + "does the cited source say it" for every number in an AI answer | Combined C1: trace + rerun the data or code behind the number |
|---|---|---|---|---|
| Sourced and verifiable (30) | 4.5 → 27 | 5 → 30 | 5 → 30 | 4.5 → 27 |
| Works end to end (25) | 4 → 20 | 4.5 → 22.5 | 3.5 → 17.5 (two pipelines in the same 40 h) | 3 → 15 (Docker, minutes to hours per run) |
| Usefulness (20) | 4 → 16 | 4 → 16 | 4 → 16 (clearer for AI-answer users, but the reporter story blurs) | 3 → 12 (two users) |
| Agent design (15) | 4 → 12 | 4.5 → 13.5 | 4 → 12 | 3 → 9 ("complexity alone is not a benefit") |
| Token Factory and Tavily (10) | 5 → 10 | 5 → 10 | 5 → 10 | 4 → 8 (half the product uses neither) |
| **Total /100** | **85** | **92** | **85.5** | **71** |
| Extra hours vs PZ plan | 0 | about 7 to 10 net (top 3) | about 12 to 16 | 40+ |

**Plainly: the combination is scope creep, not an upgrade.** C2 gains nothing net because the second pipeline costs reliability on the 25-point line, and "audit any AI answer" is the crowded space the auditor already flagged (Parafact, CiteTrue and others, `plan/audit.md` finding 2) and close to the REJECTED Receipts idea ("too simple", `plan/decisions.md`). C1 adds a code-execution engine that earns no sponsor points and cannot fit 4 people at 2 h a day by Nov 19. The real upgrade is RerunLab's discipline applied inside Patient Zero. Keep C2 as what it already is: the pivot if a consumer tool matches us in the spike.

---

## 3. Patterns worth borrowing (ranked by points per hour)

Lifts are rubric points on the 100 scale, ESTIMATE, and overlap (they are not additive). Hours are gross; "net" subtracts work Patient Zero already plans. Write every piece fresh in the hackathon repo (section 4).

| # | Borrow | RerunLab file | What to borrow, applied to Patient Zero | Rubric lift | Hours | Maturity |
|---|---|---|---|---|---|---|
| 1 | **Planted trap set on recorded traces** | `eval/planted/mutate.ts`, `docs/accuracy-method.md` sections 2, 3 and 5, `eval/cases.lock.json`, `eval/metrics.ts`, `eval/results/latest-scripted.json` (`falseGreensPlanted`, `knownLimits`) | Take 3 or 4 real traces recorded during the spike (Tavily responses cached by request hash) and build 20 to 30 offline traps with an expected stop state each: parent number nudged 3 to 10% (edge must be refused or labelled "number changed"), "gold fish" spelling variant (must join), a debunk page inserted (must become a meta node), the poisoned page, a metadata date later than the first Wayback capture (date must be capped), body-text date only, a syndicated copy (must cluster), an injected 429 or timeout (TOOL FAILED), empty results (NO PAGES FOUND), budget exhaustion (PARTIAL). Report "wrong origins: 0 of n, 95% upper bound 1 minus 0.05^(1/n)" (0 of 10 is 25.9%, 0 of 30 is 9.5%, VERIFIED by calculation), list known limits openly without counting them, label it "planted by us, by construction, never a headline", and freeze the case files with a sha256 lock. Runs with **no API keys**, so a judge can run it in one command | Sourced +1.5, Works end to end +1.5 to 2 (the "failure or insufficient-evidence case" the judges look for, reproducible without keys), Agent design +0.5 to 1. About +4 | 6 to 8 gross; about 3 already planned (injection test, forced-failure test, eval hours); **net 3 to 5** | Proven (mutation testing; rule-of-three style bounds); planted-trap evals for agents: Emerging |
| 2 | **Stop state decided only by code, with "how this was decided"** | `packages/core/src/match.ts` `computeVerdict` (rows 1 to 5, mutually exclusive, reasons), `verdict-rules.ts` (all knobs in one file), `apps/web/src/components/report/how-decided.tsx`, `docs/architecture.md` (server recomputes and ignores the runner's verdict), `packages/runner/src/agent/prompts.ts` ("You do not decide ... a separate checker compares") | One pure function `decide_stop_state(trace) -> {state, row, counts, reasons}` over the stored trace JSON; every threshold (2 earlier-window searches, caps, atom rules) in one rules file; the agent and the model never write the state; REPLAY recomputes it from stored spans and must agree. The card gets a "How this was decided" panel: the rule row that fired, the reasons, and one limit line ("earliest source we found, web-era only"). The model prompt says it labels hops and never decides edges or origins | Agent design +1 (the "when it refines or stops" walkthrough), Sourced +0.5 (fact vs inference), Works end to end +0.5 | 3 gross; stop states already planned; **net 1.5** | Proven (deterministic rules over model output) |
| 3 | **Number reading and matching rules** | `packages/core/src/numbers.ts` `parseDisplayedNumber`, `provenance.ts` `canonicalLiteral`, `significantDigits`, `indexOfNumber` (lines 116 to 200), `match.ts` `scaledRound` and the close rule, `provenance.ts` `weak_no_context` (lines 21, 59 to 62, 427 to 430) | For atom matching (pipeline steps 1, 2, 8): whole-number boundaries (35 is not in 1935, 0.35 or 3,500); one canonical key per number (".412" = "0.412" = "41.2%" only via a declared percent transform); refuse to guess and log the skip (ranges, "<0.001", decimal commas, two numbers in one cell); define the rounding transform exactly (equal when rounded to the coarser displayed precision: 8.25 to 8 is "rounded", 8 to 9 is "number changed"); and the weak-number rule: a number with fewer than 3 significant digits ("8 seconds", "35%", "10 times") counts as an atom hit only if the subject lemma sits in the same sentence; distinctive numbers ("2,231", "12.7") may match with looser context | Sourced +1 to 1.5 (fewer false nodes and wrong hop labels; the goldfish "8" and "9" are exactly weak numbers) | 3 to 4 gross; atom matching is planned but these rules are new; **net 2 to 3** | Parsing and boundaries: Proven. The significant-digit rule: Emerging (RerunLab's own rule, tested only in its scripted harness) |
| 4 | **Model lists, code verifies, with named reject reasons** | `packages/runner/src/paper/verify.ts` (`ClaimDraft`, `RejectReason`: not_on_page, unparseable, duplicate, over_cap; `normalizeText`: NFKC, invisible characters, one dash and space spelling; value computed from the string, never copied from the model), `paper/extract.ts` header | Step 0 extraction and check 1 (verbatim spans): one shared normaliser for pasted text and fetched pages (soft hyphens, non-breaking spaces, curly quotes and look-alike dashes otherwise break verbatim matches); the number's value is parsed by code from the matched string; skipped items are shown ("2 numbers skipped: a range, an ambiguous figure") | Sourced +0.5, Works end to end +0.5 | 1.5 to 2; **net 1** | Proven |
| 5 | **Evidence row and drawer** | `apps/web/src/components/report/number-compare-table.tsx` (`Evidence`: file, line, SHA-256, excerpt), `outcome-chip.tsx`, README "Every row shows the paper's number, the rerun number, the outcome and the file and line" | Scan screen 6 and the red-hop diff: one row per statistic, "AI answer says / earliest page we found says / chip (same, rounded, changed, not found, skipped) / drawer (URL, date and how dated, fetch time, SHA, Wayback, excerpt)". A judge opens a citation in one click, which is the 30-point line's evidence instruction | Usefulness +0.5 to 1 ("easy to navigate"), Sourced +0.5 | 2 to 3, inside the planned 6 h scan screen; **net 0** (a designer brief note) | Proven |
| 6 | **Hard budget check before each call** | `packages/runner/src/agent/budget.ts` (`check()` tests the worst case of the NEXT call; `maxOutputTokens()` caps the reply), `loop.ts` `AgentStopReason` | Before each Tavily call, check the credits left cover that call's maximum; before each Token Factory call, cap tokens so the call cannot cross $0.50; stop with a named cause that becomes PARTIAL "budget that ran out". Makes the 150-credit cap and the 5-a-day hosted live cap provable | Works end to end +0.5, Agent design +0.5 (cost and latency trade-offs) | 1 to 1.5 | Proven |
| 7 | **Config fingerprint in every result** | `eval/run.ts` lines 382 to 393 (`toolSchemasSha256`, `agentConfigHash` over prompt, tools and rules), `docs/accuracy-method.md` section 4 (freeze before the final run; scripted runs twice must be identical) | Every trace JSON and eval result carries model IDs, prompt sha256, rules version and Tavily parameters; the REPLAY badge shows the hash; the targets file gets a sha256 lock next to its timestamp; the trap set runs twice in CI and must give identical output | Works end to end +0.5 (reproducible), Token Factory and Tavily line (traces without credentials) small | 1 | Proven |
| 8 | **Copy lint in CI** | `scripts/copy-check.ts` (banned words, pricing words, em and en dashes, with its own fixtures) | Ban "independent sources", "invented by", "this outlet changed", "proves", a bare "origin" on cards, and em or en dashes across README, UI copy and card templates. Four builders at 2 h a day will drift; the lint keeps the brief's "Never claimed" list true | Sourced +0.5 (protects against overclaim) | 1 | Proven |

**Fit with the hours.** Gross about 18 to 23 h; net new about 11 to 15 h for all eight, about 7 to 10 h for the top 3. Layer 1 is already 35 to 41 of 40 h and the core week 47 to 52 of 56 h (`plan/idea-brief.md` "Hours"), so: items 2, 3, 4, 6, 7, 8 replace code the core week writes anyway (they are the shape of that code, about 5 to 7 h net); item 1 needs about 3 to 5 h that the plan does not have. Recommended source: the Layer 2 animation polish item (5 to 8 h, already "drops first"). Zero In stays untouched (LOCKED). Item 5 is a note to master-designer, no hours.

---

## 4. Do not take

| RerunLab piece | Why not |
|---|---|
| The rerun engine: Docker executors, clean replay, Stata (`packages/runner/src/executor/*`, `packages/core/src/replay.ts`, `replay-run.ts`) | No rubric line rewards running code; no Tavily or Token Factory use; tens of hours |
| OIDC attestation and signed badges (`packages/server/src/oidc.ts`, `packages/runner/src/attest.ts`, `.github/workflows/rerun.yml`) | Trust infrastructure for an untrusted runner; Patient Zero has none. Judges assess asynchronously and will not test it |
| Sign-in, GitHub App, runner setup wizard, publish and unpublish, badge SVG, gallery (`apps/web/src/lib/auth.ts`, `components/runner/setup-wizard.tsx`, `routes/badge/*`, `components/share/*`) | No points; Patient Zero's text permalink covers sharing |
| Formula consistency checks (`packages/core/src/consistency.ts`, `distributions.ts`) | Built for regression tables, not viral stats; RerunLab itself parked `parts_sum` after 3 fix rounds (`plan/progress.md` R16) |
| Fix library and learning loop (`packages/core/src/fix-library.ts`, `docs/learning-loop.md`) | Install-error hints for code reruns; nothing to fix in a web trace |
| RerunLab's four badge names | Patient Zero's five stop states are LOCKED in the brief; borrow the decision-table shape, not the vocabulary |
| A heuristic arms race | RerunLab's static analysis of agent shell commands "did not converge in 3 build runs (about 10 fix rounds, new bypasses each round)" and was deleted for a structural design (`plan/progress.md` R13). Lesson for Patient Zero: do not try to detect fake or laundered origins with ever more text heuristics beyond the meta-page rule; keep trust structural (verbatim spans, link-verified edges, dates capped by Wayback) |
| CORE-Bench capsules, Claude agent loop (`packages/runner/src/agent/claude.ts`) | Wrong domain; the agent must run on Token Factory models for the 10-point line |

**Rule note.** No originality rule about pre-existing code was found for this event (`plan/submission.md` line 26: searched the event bundle for "original", "pre-existing", "existing code", "Rules", "Terms", 0 hits; UNRESOLVED). The safe default: **borrow ideas and patterns, write fresh code in the hackathon repo after Oct 28**, so the public commit history shows the timeline. RerunLab is Vidyut's own Apache-2.0 work, so licence is not the issue; the event's rule and how judges read the history are.

**Where copying would be tempting (flag to every builder):**
- `packages/core/src/numbers.ts` and `provenance.ts` `indexOfNumber` (pure, small, well tested; the strongest pull). Port the rules and the test cases as ideas, write the code fresh.
- `packages/core/src/match.ts` and `verdict-rules.ts` (the decision table).
- `eval/metrics.ts` (Wilson interval, zero-event bound) and `eval/planted/mutate.ts` (seeded mutation).
- `scripts/copy-check.ts`, `packages/runner/src/agent/budget.ts`.
- The UI: `number-compare-table.tsx`, `outcome-chip.tsx`, `how-decided.tsx`, the app shell and Tailwind tokens. Also the whole TanStack Start, Drizzle, Better Auth stack if Patient Zero picks TypeScript: copying the app shell would make a 33,000-line repo look pre-built.

---

## 5. Open questions for Vidyut (he decides)

1. **Combine, borrow, or keep separate?** Recommended: borrow the top 3 now and items 4, 6, 7, 8 inside the core week; keep RerunLab a separate project; keep C2 only as Patient Zero's existing pivot.
2. **May anyone copy RerunLab code into the hackathon repo?** Recommended: no, patterns only, written fresh, until the organizers confirm the originality rule (asking them is outward-facing, so only with your OK, for example in the kickoff Q&A or by email to the form contact).
3. **Where do the 3 to 5 hours for the trap set come from?** Recommended: the Layer 2 animation polish item (already first to drop); Zero In untouched.
4. **Mention RerunLab in "Why us" next to PaperTrail?** Recommended: yes, one line, only if you are fine naming a private, unreleased project, and only with the honest number: "scripted eval, 0 of 30 false greens on planted breaks; real-agent accuracy not yet run". No link until it is public.
5. **Stack.** If the team picks TypeScript and Bun because RerunLab proves it works for you, the copy temptation is highest, so the no-copy rule in question 2 matters more. Recommended: pick the stack by the four teammates' skills at the plan stage, not by RerunLab.

---
Not checked: I did not run RerunLab's tests or eval (read-only brief), so "works" means the README, test files and committed result file say so. I did not read `replay.ts`, `tools.ts`, `consistency.ts` in full, the RerunLab `plan/` docs beyond `progress.md`, or any held-out data in `/Users/vidyutsriram/projects/rerunlab-heldout`. No web lookups were needed.
