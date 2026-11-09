# Spike and head-to-head grading, relabelled forms A to D

Prepared 2026-11-07 PT by Rohan's Codex agent for #28. This is an agent-assisted content adjudication for XO review, not a claim that Rohan personally rechecked every source.

## Scope and blinding disclosure

- Graded all 24 XO-relabelled forms on `main`: four forms for each of six claims. Letters are shuffled separately per claim. No tool identity, cross-claim letter ranking or winner is inferred.
- This covers the available run 1 forms. The latest decision in `plan/decisions.md` says **no spike rerun**; the earlier instruction to grade two runs is superseded. No additional run or missing form is invented.
- Before reading these forms, both original target files were checked against their pre-run commitments. They are revealed byte-for-byte with this report; their notes and grading criteria were not rewritten after results.
- Agent did **not** open PR #38, #50 or #52, `spike/REPORT.md`, `spike/traces/`, original `spike/h2h-forms/`, or Rishit's post-Nov-2 comments on #10. The XO identity key was not accessed.
- **Not fully blind:** during requested WhatsApp reads, the agent saw Rishit's summaries saying the reported earliest pages were false matches for claims 1, 2, 4 and 6 and real matches for 3 and 5, plus a mention of a discarded 1994 page for claim 1. That can reveal or suggest a form's identity despite letter relabelling. Claim 1's target was already known in team planning and is separated in totals below. Rohan's own exposure is unconfirmed.
- The six input claim texts on #5 were read on Nov 7 with Rohan's explicit approval for the separate E1 exclusion check. That access did not include evaluated outputs. Held-out E1 texts, targets and nonce remain private and are absent here.
- No prompts, question wording, rules or thresholds changed. No spike, head-to-head or paid model run was performed for this grading.

## Target reveal and hash checks

The commitments are in [targets-a.sha256](../eval/targets-a.sha256) and [targets-b.sha256](../eval/targets-b.sha256), originally delivered in PR #29 and on #10. Exact original bytes, including the nonce line, are in the two revealed JSONL files. The nonce is an evaluation salt, not an API credential.

```text
$ shasum -a 256 eval/targets-a.jsonl eval/targets-b.jsonl
d8a20892c9ffc14f71db1aee75253d381997b84b4992c129bd9b32407df6ebdc  eval/targets-a.jsonl
5c10c10cc8098310a9de16f65e87d34b8773f5000836c813db3136f8630360b8  eval/targets-b.jsonl
```

Both match the original commitments. Original files were not reformatted. Claim 1 date is a Wayback capture, not a claimed publication date; claim 4 uses online publication rather than issue date. Claims 3 and 5 deliberately have no web target: honest bounded stopping is the success criterion. The old Wikipedia edit noted for claim 5 is accepted as explanatory provenance, not empirical validation of the percentage.

## What the columns mean

- **Target +meta / -meta:** whether the registered target/alias appears anywhere in the supplied chain, first as supplied and then after removing fact-check/provenance-investigation rows. This is a citation-presence audit. An unrelated oldest page does not erase a target cited elsewhere, but does fail earliest-source grading. These flags do **not** establish that a tool discovered the target without seeing a meta page, or that a meta-free run succeeded. The forms do not contain the query/exclusion records needed for that counterfactual; no end-to-end no-meta hit rate is claimed.
- Primary source announcements and original reporting are retained. Debunks, incident repositories and retrospective provenance investigations are meta; they may help explain a chain but cannot be its origin. Bibliographic/DOI aliases of the registered paper are equivalent, and archive slash/port spelling is normalized without changing the capture day.
- **Earliest:** Pass identifies the specific registered claim origin; Partial identifies only a component or conflates origin and upstream context; Fail is wrong, unrelated or substitutes a different claim. Boundary means a justified cold-trail explanation, not a discovered web origin. The adjudication categories below are documented for review; only the targets, not a numerical composite scoring rule, were preregistered.
- **Date:** Pass means the registered target date is explicitly present, even if an unrelated header is also wrong. Partial means incomplete precision or a documented online/issue-date error. N/A applies to cold targets; a print year is not an original web publication date.
- **Chain / quotes:** ordered citations are not proof of every hyperlink edge. Several forms put descriptive summaries in blockquotes; these are not awarded a verbatim PASS. Selected source-anchor checks are documented below; unchecked spans remain unverified, not silently passed or failed.
- **Stop:** Pass explains the actual evidence boundary without inflating independent support; Partial is a generic cold label or a caveat undermined by a wrong candidate chain. For a cold target, only a justified Pass counts as correct cold.
- **Wall time:** ND for every form. XO removed timing and holds the identity key off-repo; XO must append the original times after grading is posted. Grading runtime is not substituted for tool wall time.

## Claim 1: attention span (known to the team)

| Form | Target +meta / -meta | Earliest source | Date | Chain / quotes | Stop | Wall time |
|---|---|---|---|---|---|---|
| [A](blind-forms/claim-1-A.md) | Yes / Yes | **Partial**: Separates BBC goldfish component from Statistic Brain comparison. | **Partial**: February 2012 archive only; no exact day. The 2002 date is a component, not the combined target. | Target at item 9. Includes commentary/meta sources; several blockquotes describe sources rather than quote them. Archive quote not freshly verified. | **Pass**: Correctly distinguishes an unsupported table from independent measurements. | ND (XO) |
| [B](blind-forms/claim-1-B.md) | Yes / Yes | **Pass**: Exact registered capture, ignoring URL slash/port spelling. | **Pass**: 2012-02-08 explicitly labelled capture. | Target at item 16. Original report credits Statistic Brain; meta pages also appear. Exact archived text not freshly retrieved. | **Pass**: Correctly declines to turn the table into empirical evidence. | ND (XO) |
| [C](blind-forms/claim-1-C.md) | Yes / Yes | **Pass**: Correct target and archive day. | **Pass**: 2012-02-08 explicitly labelled capture, not publication. | Target at item 10. Multiple provenance investigations; summaries and described captures are not independently checked verbatim spans. | **Pass**: Correctly distinguishes numerical origin from research support. | ND (XO) |
| [D](blind-forms/claim-1-D.md) | No / No | **Fail**: Hot Rod drag-racing page is unrelated to the attention comparison. | **Fail**: 1994-10-23 is not the registered 2012 capture. | Low-8-second racing passes are a different subject; task-set research and a share link also do not establish the claim. | **Partial**: Cold label avoids declaring a primary origin, but rests on a contaminated candidate chain. | ND (XO) |

## Claim 2: AI email and water

| Form | Target +meta / -meta | Earliest source | Date | Chain / quotes | Stop | Wall time |
|---|---|---|---|---|---|---|
| [A](blind-forms/claim-2-A.md) | Yes / Yes | **Fail**: Names a 2005 book-marketing page, despite containing the registered target at item 4. | **Pass**: Target item gives 2024-09-18; header date belongs to an unrelated page. | A genuine target citation is followed by unrelated short-email examples. Item 4 opening passage matches the fetched page; graphic not checked. | **Partial**: Stops without endorsing a primary origin, but fails to identify the specific result as the stopping point. | ND (XO) |
| [B](blind-forms/claim-2-B.md) | Yes / Yes | **Pass**: Specific registered result distinguished from earlier methodology. | **Pass**: 2024-09-18 for target; 2023-04-06 is separately identified as ancestor. | Target at item 6. Reporting lineage is plausible; supplied excerpts mix paraphrase and quotations. Not every link/quote was independently checked. | **Pass**: Correctly states one originating analysis and no demonstrated replication. | ND (XO) |
| [C](blind-forms/claim-2-C.md) | Yes / Yes | **Fail**: Header substitutes the older multi-question paper for the specific email result. | **Pass**: Target at item 9 is dated 2024-09-18, but the header uses April 2023. | Contains the target, but blends model/version and workload differences. Several summaries, approximate dates and an unlinked entry. | **Partial**: The single-lineage caution is useful; identifying the specific result with the older paper is not. | ND (XO) |
| [D](blind-forms/claim-2-D.md) | Yes / Yes | **Pass**: Specific result correctly separated from older measurement/method ancestors. | **Pass**: Target 2024-09-18 correctly stated; older dates are labelled ancestors. | Target at item 5. Meta incident page also present; some direct excerpts, many links not independently rechecked. Target graphic remains unverified. | **Pass**: Correctly limits the source count and independent-confirmation claim. | ND (XO) |

## Claim 3: communication percentages (cold target)

| Form | Target +meta / -meta | Earliest source | Date | Chain / quotes | Stop | Wall time |
|---|---|---|---|---|---|---|
| [A](blind-forms/claim-3-A.md) | N/A / N/A | **Boundary**: No dated web origin asserted; identifies narrow 1967 print research. | **N/A**: 1967 is a print research year, not a website date. | Identifies attitude/inconsistent-channel scope and author explanation. Most entries are summaries; formula wording is abbreviated. | **Pass**: Justified print-boundary conclusion; no general communication confirmation claimed. | ND (XO) |
| [B](blind-forms/claim-3-B.md) | N/A / N/A | **Fail**: Names a 2011 discussion of the misconception as earliest. | **N/A**: No registered web date exists; 2011 is a later commentary date. | Earliest page is meta; a description of a belief is not support for it. Does not trace to the print studies or explicitly reject the broad rule. | **Partial**: Generic cold label, without the registered print-boundary explanation. | ND (XO) |
| [C](blind-forms/claim-3-C.md) | N/A / N/A | **Boundary**: Identifies 1967 print papers and distinguishes the broad claim. | **N/A**: May/June 1967 refer to papers, not contemporaneous web publication. | Useful lineage and scope separation; source descriptions mostly paraphrases. Citation ordering alone does not verify edges. | **Pass**: Justified stop: narrow studies do not validate communication in general. | ND (XO) |
| [D](blind-forms/claim-3-D.md) | N/A / N/A | **Boundary**: Identifies print papers and their limited scope. | **N/A**: May/June 1967 are research publication dates, not web-origin dates. | Author formula at item 4 matches the author page. Remaining snippets mix quotes and summaries; not a complete quote-pass claim. | **Pass**: Justified stop, correctly distinguishing research lineage from independent confirmation. | ND (XO) |

## Claim 4: query energy comparison

| Form | Target +meta / -meta | Earliest source | Date | Chain / quotes | Stop | Wall time |
|---|---|---|---|---|---|---|
| [A](blind-forms/claim-4-A.md) | Yes / Yes | **Partial**: Finds synthesis at item 7 but names denominator source as earliest. | **Pass**: Target online date 2023-10-10 is in chain; header January 2009 is the denominator only. | Target DOI and PDF present; modelling lineage is described, not a complete verified edge set. Item 7 is a paraphrase. | **Pass**: Correctly warns that a cost remark/estimate is not an independent energy measurement. | ND (XO) |
| [B](blind-forms/claim-4-B.md) | No / No | **Fail**: Wired moonshot article is an unrelated tenfold comparison. | **Fail**: 2013-02-11 does not date the registered 2023 synthesis. | No target; the retained 10X phrase concerns innovation goals, not query electricity. | **Partial**: Cold label cannot repair the unrelated ancestor. | ND (XO) |
| [C](blind-forms/claim-4-C.md) | Yes / Yes | **Partial**: Contains target at item 11, but promotes the older cost remark as explicit comparison. | **Partial**: Uses issue date 2023-10-18 instead of registered online date 2023-10-10: +8 days. | Includes relevant primary modelling alongside meta investigations. Cost and electricity units must remain distinct. | **Pass**: Correctly rejects a universal measured ratio, despite imprecise earliest-source framing. | ND (XO) |
| [D](blind-forms/claim-4-D.md) | Yes / Yes | **Pass**: Separates denominator from the registered comparison synthesis. | **Pass**: Correctly separates online 2023-10-10 from issue 2023-10-18. | Target at item 4. Its direct energy-synthesis excerpt is supported by the paper PDF; no claim that all other edges/quotes passed. | **Pass**: Correctly reports one synthesis and no independently measured universal ratio. | ND (XO) |

## Claim 5: water-speed fatality percentage (cold target)

| Form | Target +meta / -meta | Earliest source | Date | Chain / quotes | Stop | Wall time |
|---|---|---|---|---|---|---|
| [A](blind-forms/claim-5-A.md) | N/A / N/A | **Boundary**: Locates old mirror wording without treating it as an established fatality calculation. | **N/A**: By-2008 bound is not a verified exact edit timestamp. | No exact historical edit/permalink. Different denominators and later counts are kept distinct; summaries not a full quote audit. | **Pass**: Honest evidentiary stop: no verified calculation supporting 85 percent. | ND (XO) |
| [B](blind-forms/claim-5-B.md) | N/A / N/A | **Boundary**: Identifies unsupported Wikipedia lineage, with earlier count as a different statistic. | **N/A**: Distinguishes print issue date from later web page date; mirror date approximate. | No exact historical edit/permalink. Explicitly acknowledges an excerpt-only source and no independent basis for 85 percent. | **Pass**: Honest stop at an unsupported publication lineage, not a validated percentage. | ND (XO) |
| [C](blind-forms/claim-5-C.md) | N/A / N/A | **Boundary**: Identifies unsourced historical change from 50 to 85 percent. | **N/A**: Explicitly marks exact revision dates unverified. | Most specific edit description, but no exact oldid or verified timestamp. No credit for the earlier 50 percent as the same numeric claim. | **Pass**: Honest stop: one publication lineage and no underlying evidentiary calculation. | ND (XO) |
| [D](blind-forms/claim-5-D.md) | N/A / N/A | **Partial**: Stops at a later retailer repetition. | **N/A**: 2013-04-27 is not a registered origin date; target is deliberately cold. | Quotes later repetitions but does not identify the unsupported historical edit or distinguish empirical support. | **Partial**: Cold label alone is insufficient for a justified evidentiary-boundary conclusion. | ND (XO) |

## Claim 6: prenatal choline trial

| Form | Target +meta / -meta | Earliest source | Date | Chain / quotes | Stop | Wall time |
|---|---|---|---|---|---|---|
| [A](blind-forms/claim-6-A.md) | Yes / Yes | **Pass**: Publisher URL is the registered DOI alias, including percent-encoded parentheses. | **Pass**: 2026-10-19 matches online date. | Target items 5/6. Trial-design summary agrees with the abstract, but is not a literal quoted sentence; other snippets unverified. | **Pass**: Correctly identifies one trial and no independent replication. | ND (XO) |
| [B](blind-forms/claim-6-B.md) | Yes / Yes | **Pass**: Registered DOI, with earlier registration explicitly distinguished from results. | **Pass**: 2026-10-19 matches. The 2017 registry date is not the outcome date. | Target item 8. The 7.78-point summary is supported by abstract; most blockquotes are descriptive summaries. | **Pass**: Correctly distinguishes rounded eight points from an independently replicated exact effect. | ND (XO) |
| [C](blind-forms/claim-6-C.md) | No / No | **Fail**: Frontiers gene-network paper is unrelated to the registered clinical result. | **Fail**: 2024 existed-by date does not match 2026-10-19 and is not demonstrated publication metadata. | NutriGRADE score 7.75 and citation markers 8/9 are not an eight-point IQ outcome. Target absent. | **Partial**: Cold label avoids an affirmative primary result but fails to reach the available target. | ND (XO) |
| [D](blind-forms/claim-6-D.md) | Yes / Yes | **Pass**: Registered DOI and matching trial. | **Pass**: 2026-10-19 correctly labelled online ahead of print. | Target item 9 includes an abstract excerpt supported by PubMed. Secondary sources are correctly treated as reports, not independent trials. | **Pass**: Correctly limits support to one trial, preserving rounding and lineage. | ND (XO) |

## Totals and their limits

| Measure | Result | Interpretation |
|---|---:|---|
| Forms adjudicated | 24/24 | All six claims, four letters per claim |
| Registered web target cited, as supplied | 13/16 | Claim 1: 3/4; claim 2: 4/4; claim 4: 3/4; claim 6: 3/4 |
| Registered web target still cited after meta rows removed | 13/16 | Post-hoc citation presence only; not a no-meta discovery experiment |
| End-to-end target discovery without meta assistance | Not determined | Query paths/exclusions and complete edge proof are not in these forms |
| Specific earliest-source grade, web-target forms | 8 Pass; 3 Partial; 5 Fail | A target appearing in a list does not make an unrelated header correct |
| Explicit exact target date among target-containing forms | 11/13 | 1-A lacks the exact capture day; 4-C uses the issue date, +8 days |
| Correct cold-trail conclusion | 6/8 | 3-A/C/D and 5-A/B/C; 3-B and 5-D only receive Partial |
| Claim 1, known-to-team, target cited | 3/4 | Kept separate from less-known target claims |
| Other web-target claims 2, 4 and 6, target cited | 10/12 | Still subject to WhatsApp exposure and quote/edge limitations |
| Recorded wall times | 0/24 available | XO appends times after posting |
| Full-chain verbatim/link verification | Not established | Selected anchors checked, with explicit inaccessible sources below |

No composite accuracy percentage or tool ranking is reported. Adding citation-presence counts to cold-stop counts would mix different criteria and conceal wrong earliest-source claims. Letter A in one claim is not necessarily the same tool as A in another.

## Selected source-anchor audit

Checks were made on Nov 7 against the fixed targets, not used to rewrite those targets. A supported anchor is not a PASS for every quote or edge in that form.

| Check | Forms affected | Result and source |
|---|---|---|
| Registered archive | 1-A/B/C | Current retrieval unavailable. The original precommitted capture remains the grading target; no fresh archived-quote PASS is awarded. |
| Original reporting metadata | 2-A/B/C/D | [Target page](https://www.washingtonpost.com/technology/2024/09/18/energy-ai-use-electricity-water-data-centers/) retrieved. 2-A item 4 opening passage matches. Interactive graphic not checked. |
| Author's scope and formula | 3-A/C/D | [Author page](https://kaaj.com/psych/smorder.html) supports limited feelings/attitudes scope. 3-D item 4 formula matches; 3-A wording is abbreviated rather than literal. |
| Original synthesis | 4-A/C/D | Publisher access blocked, but [the paper PDF](https://asociace.ai/wp-content/uploads/2023/10/ai-spotreba.pdf) was retrieved. 4-D item 4 excerpt is supported after layout cleanup; 4-A/C are descriptions. Cost, electricity and estimated upper bounds must not be merged. |
| Exact historical edit | 5-A/B/C | Current oldid retrieval unavailable. The original target notes specify oldid 199900202 and the unsupported 50-to-85 change; none of these forms gives that exact permalink or timestamp. Credit is for honest evidentiary stopping, not exact edit recovery. |
| Trial identity, date and outcome | 6-A/B/D | [PubMed abstract](https://pubmed.ncbi.nlm.nih.gov/42896815/) retrieved. 6-D item 9 result excerpt is supported with case/whitespace normalization; 6-A/B summaries are consistent but not literal spans. The test is provenance, not treatment advice. |

Other supplied snippets were inspected for relevance, attribution and contradictions, but were not all independently fetched. No all-quote pass rate is claimed. Ellipses, omitted URLs, approximate dates and source summaries remain visible limitations rather than being converted into invented evidence. The forms alone also do not establish a complete hyperlink-by-hyperlink chain.

## XO handoff

1. Review these adjudications with the blinding limitation preserved.
2. After the grading is posted, use the off-repo key to attach tool identities and original wall times; keep the original per-claim letter tables intact for auditability. Do not treat cross-claim letter totals as tool totals.
3. Keep the declared-earliest failures separate from target-citation presence in any README claim. Do not describe the post-hoc meta-row removal as a measured no-meta discovery run.
4. No spike rerun is requested here. Any later rerun must be labelled separately under the team's decisions.

## XO unblinding (appended Nov 9, after the grading above was posted)

The grades above were not changed. The identity key and wall times come from XO's off-repo key, written on Nov 2 when the forms were relabelled. "Ours" is the week-0 spike walker (fixed rules, no model), not the Patient Zero engine being built in T21 to T29.

| Claim | A | B | C | D |
|---|---|---|---|---|
| 1 | Claude, about 1 min | ChatGPT, about 3 to 4 min | Perplexity, about 1.5 min | Ours, 47 s |
| 2 | Ours, 36 s | Perplexity, about 1.5 min | Claude, about 1 min | ChatGPT, about 3 to 4 min |
| 3 | Claude, about 1 min | Ours, 16 s | ChatGPT, about 3 to 4 min | Perplexity, about 1.5 min |
| 4 | Claude, about 1 min | Ours, 12 s | ChatGPT, about 3 to 4 min | Perplexity, about 1.5 min |
| 5 | ChatGPT, about 3 to 4 min | Claude, about 1 min | Perplexity, about 1.5 min | Ours, 18 s |
| 6 | Claude, about 1 min | ChatGPT, about 3 to 4 min | Ours, 16 s | Perplexity, about 1.5 min |

Tool times are the testers' rough stopwatch readings; ours are measured run times.

### Per tool, from the grades above

| Tool | Web target cited (claims 1, 2, 4, 6) | Earliest source, web-target claims | Correct cold-trail stop (claims 3, 5) | Stop graded Pass, all six |
|---|---|---|---|---|
| Perplexity | 4/4 | 4 Pass | 2/2 | 6/6 |
| ChatGPT | 4/4 | 3 Pass, 1 Partial | 2/2 | 6/6 |
| Claude | 4/4 | 1 Pass, 2 Partial, 1 Fail | 2/2 | 5/6 |
| Ours (spike) | 1/4 | 4 Fail | 0/2 | 0/6 |

Plainly: the week-0 spike walker lost to all three tools on every claim. It was the fastest (12 to 47 s), but its earliest pages were false matches, as the offline check in `spike/REPORT.md` found. The blinding limits above still apply (WhatsApp exposure, claim 1 known to the team, quotes and links not fully verified). These are six claims, graded once, by one agent-assisted grader, so they are not a ranking of the tools in general.
