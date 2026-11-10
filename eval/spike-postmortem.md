# Spike post-mortem: why we lost each claim

Written Nov 9 for #84 (T34). Sources: our six spike traces and logs (`spike/traces/claim-<n>.json`, `spike/logs/`, from Rishit's #52), the registered targets (`eval/targets-a.jsonl`, `eval/targets-b.jsonl`), the grading and XO's unblinding (`spike/grading.md`), and the head-to-head transcripts (`spike/head-to-head/<tool>/<n>.md`).

**This is analysis only.** Every rule change it points to is measured on the E2 dev set with `make dev-score` (T33), never on these six claims. The spike was the week-0 walker with fixed rules and no model, not the engine being built in T21 to T29.

## The result in one table

| Claim | Our earliest page | Registered target | Grade | Root cause (first), then any second cause |
|---|---|---|---|---|
| 1 attention span | hotrod.com, 1994 ("low-8-second passes" in drag racing) | statisticbrain.com, Wayback capture 2012-02-08 | Fail | **Query never reached target**, then false match |
| 2 AI email and water | prsecrets.com, 2005 ("The 100-Word Email That Can Get The Media To Call You") | washingtonpost.com, 2024-09-18 | Fail | **False match** |
| 3 7/38/55 rule (cold) | psychologytoday.com, 2011 ("The belief is that 55% of communication is body language...") | none: 1967 print studies, no web origin | Fail | **Meta filter**, then stop rule |
| 4 ChatGPT query energy | wired.com, 2013 ("Google X Head on Moonshots: 10X Is Easier Than 10 Percent") | doi.org/10.1016/j.joule.2023.09.004, 2023-10-10 | Fail | **Query never reached target** |
| 5 water speed record (cold) | boatcoversdirect.com, 2013 (a retailer repeating the claim) | none: an unsourced Wikipedia edit, 2008 | Partial | **Stop rule** |
| 6 prenatal choline | frontiersin.org, captured 2024 ("...predicted their biological functions (8, 9).") | doi.org/10.1016/j.ajog.2026.10.017, 2026-10-19 | Fail | **False match**, then query never reached target |

Count by first cause: false match 2, query never reached target 2, meta filter 1, stop rule 1, dating 0, budget 0.

False matches still appear in four of the six traces (1, 2, 4 and 6) as the reported earliest page. On claims 1 and 4 the search could not have found the target even with a perfect matcher, which is why the first cause there is the query.

**Budget was never the limit.** Our runs used 7 to 19 of the 150 allowed credits and 12 to 47 seconds. The tools took about 1 to 4 minutes. We stopped early because every trace hit two or three empty earlier-window searches, not because we ran out.

## Claim by claim

### Claim 1: attention span (8 seconds, goldfish 9)

- **Ours:** 18 searches, all exact phrases (`"8 seconds" attention`, `"8-second" attention`, `"8 second" attention`) in date windows ending 2026-11-03, 2015-05-13, 2014-02-10, 2013-06-23 and 1994-10-22. The real matches we found were residebpg.com (2013) and medicaldaily.com (2015). The 1994 hotrod.com page and a 2010 PMC paper matched on a weak "8" with "attention" in the sentence. They became the earliest pages, and the last window searched before 1994, where nothing could exist.
- **Target:** statisticbrain.com is dead and survives only in the Wayback Machine. A search engine that indexes the live web cannot return it, so our windows ending 2013-06-23 never saw it.
- **Perplexity:** started from investigations of the claim (tryhugo.app's goldfish myth piece, BBC More or Less, policyviz), then walked the citations backwards: TIME (2015-05-14) linked Microsoft's report, the report credits "Source: Statistic brain", and the archived Statistic Brain captures (2015, then 2012-02-08) close the chain.
- **ChatGPT:** the same path through news coverage (TIME, Telegraph, Ars Technica), the archived Microsoft report PDF, and the BBC's check with AP and NCBI.
- **Why we lost:** the target is an archived page reached by following a citation, and we neither follow citations nor read the archive. The false match then made our reported earliest page wrong as well.

### Claim 2: a 100-word AI email uses a bottle of water

- **Ours:** we found the target. washingtonpost.com (2024-09-18) is in our trace, with a link-verified edge to techrepublic.com (2024-09-20). But earlier windows kept returning "100-word email" marketing and writing tips from 2005 to 2022 (prsecrets.com, erinwrightwriting.com, brafton.com and others). They passed on a weak 100 with "email" in the sentence, are dated earlier, and so became the earliest page.
- **Perplexity and ChatGPT:** searched the topic (AI, water, email), landed on the Washington Post analysis first, and stopped there. They named the April 2023 arXiv paper as a method ancestor that makes a different claim.
- **Why we lost:** a false match outranked the true origin by date. A same-claim check (subject AI and water, not "email") would have left the Washington Post page earliest.

### Claim 3: communication is 7% words, 38% tone, 55% body language (cold)

- **Ours:** the earliest page, psychologytoday.com (2011), says "The belief is that 55% of communication is body language...". That is a page discussing the claim as a belief, which makes it meta, but none of our `metaKeywords` (myth, debunk, zombie, and so on) fired. We then stopped with the generic cold reason.
- **Perplexity:** went to the research: psycnet DOIs for the two 1967 papers by Mehrabian with Wiener and with Ferris, PubMed, and the author's own page (kaaj.com) limiting the result to feelings and attitudes. It named the boundary: print studies, no web origin, and the mutation from "attitude" to "communication".
- **ChatGPT:** the same 1967 DOIs and ERIC, plus debunk pages that discuss the rule.
- **Why we lost:** a meta page passed as a first page, and our stop could not say why the trail ends, at a print study.

### Claim 4: a ChatGPT query uses ten times the energy of a Google search

- **Ours:** the atoms picked "Google" as the subject and "times" as the unit, so every query was `"10 times" Google`, `"10x" Google` or `"ten times" Google`. None mentions ChatGPT, energy or electricity. The two pages kept were a 2013 Wired moonshot story and a 2025 Epoch AI article.
- **Target:** the Joule paper never says "ten times". It compares about 2.9 Wh for a ChatGPT request with 0.3 Wh for a Google search, so the claim's ratio is derived, not quoted.
- **Perplexity and ChatGPT:** searched the topic and found the Joule commentary, the IEA Electricity 2024 report and Goldman Sachs, then the ingredients: Google's 2009 blog post (0.3 Wh), SemiAnalysis (February 2023) and the Reuters report of an Alphabet executive saying "10 times" about cost.
- **Why we lost:** our queries never described the claim, and an exact-number search cannot find a page that states the two numbers behind a ratio.

### Claim 5: the water speed record has an 85% fatality rate since 1940 (cold)

- **Ours:** exact phrases `"85%" water speed record` and the percent and per cent forms. We kept boatcoversdirect.com (2013) and atlasobscura.com (2014), both repetitions, and stopped cold with no reason beyond the generic one.
- **Perplexity:** found Wikipedia's own list of citogenesis incidents, which records the article claiming 50% in 2005 and changing it to 85% in 2008 with no source, then the article's history page.
- **ChatGPT:** stopped at an unsupported statistic using Guinness and historical pages, and found an old Wikipedia mirror.
- **Why we lost:** the origin is a Wikipedia edit, which a date-window search never returns, and our stop could not say "unsourced edit". The page that explained it, the citogenesis list, is exactly the kind of meta page our filter throws away.

### Claim 6: prenatal choline, 8 IQ points at age 4

- **Ours:** queries `"8 IQ points" choline`, `"8 points" choline` and `"eight IQ points" choline`. The earliest page, frontiersin.org, matched on the citation markers "(8, 9)", and a 2025 PMC review matched on a NutriGRADE score of 7.75. The one real match was celinegounder.com (2026-10-27), eight days after the target.
- **Target:** the trial reports 7.78 points, and the university press release rounds it to "about eight points". An exact "8 IQ points" search does not reach the trial's own pages.
- **Perplexity and ChatGPT:** went to PubMed and the DOI, plus the CU Anschutz press release and clinicaltrials.gov, and said the 8 is rounded.
- **Why we lost:** false matches became the earliest page, and our exact variants cannot reach an origin that states the unrounded number.

## What the tools did that we did not

1. **They read pages about the claim as maps.** BBC More or Less, tryhugo.app, Wikipedia's citogenesis list and the AIAAIC repository pointed them to the origin. They never named those pages as the origin. We drop meta pages entirely, so we lose the map too.
2. **They followed citations backwards.** On claim 1 the chain was TIME, then Microsoft's report, then Statistic Brain. Our edges were inferred by date order alone: one link-verified edge in the whole run.
3. **They searched the topic, not just the number.** On claim 4 they searched energy and ChatGPT, and on claim 2 AI and water. Our queries were the variant phrase plus one subject word.
4. **They handled rounded and derived numbers.** 7.78 became "about eight", and 2.9 Wh against 0.3 Wh became "ten times". Our search needs the exact phrase.
5. **They used the archive.** On claim 1 the origin is a dead page that survives only as a Wayback capture.
6. **They named why a trail ends.** On claims 3 and 5 they said: print studies from 1967, an unsourced wiki edit. We say only that the trail goes cold.

## The five changes most likely to close the gap

Ranked by how many of the six losses each would have changed, and then by how sure we are that it helps. Every one is measured on the dev set with T33 before it counts.

| Rank | Change | Claims it would have changed | Task |
|---|---|---|---|
| 1 | **Same-claim check.** Require the variant phrase and read written-out numbers in code, then a typed "same subject, same number, same unit?" before a page can be an origin candidate. This stops a false match becoming the earliest page, and it stops a false match pushing the next search window past the real origin. | 1, 2, 4 and 6 (four of four false earliest pages); on 2 the Washington Post page, already in our trace, would likely have been earliest | T36 (#86) |
| 2 | **Walk by links and citations, and use meta pages as maps.** Follow what each page cites (links, DOIs, "according to", "a study by"), including the pages a debunk or explainer cites, while a meta page itself is never an origin. | 1, 5, and 4 through its cited sources | T44 (#93), with the meta-as-map part as a new item for T44 |
| 3 | **Query planning.** Let the model propose topic queries with the claim's entities (ChatGPT, energy, Washington Post) and rounded or older wording, with code keeping only queries that carry an atom or variant. Pass the number transforms, rounded ("about eight") and derived ratios, to the search side as well as the matcher. | 4, 6, and 2 by reaching the target sooner | T35 (#85) |
| 4 | **Archive-first discovery.** Look up the earliest Wayback captures of cited and candidate URLs, so a dead origin like Statistic Brain can be read. | 1 | T45 (#94) |
| 5 | **Cold stops that explain themselves.** Add `print_boundary`, `unsourced_edit` and `circular` stop reasons, and widen the meta test so a page saying "the belief is that" or "a commonly cited claim" is meta. | 3 and 5 (the two cold claims, 0 of 2 today) | T37 (#87), with the meta keywords measured on the dev set in T33 |

## Limits of this post-mortem

- Six claims, graded once by one agent-assisted grader. The grading's blinding limits (see `spike/grading.md`) carry over.
- Each tool's path is read from its final answer and cited URLs. The transcripts do not record the tools' actual queries, so "queries implied" is our reading of the answer.
- Each root cause is our judgement from the traces and logs. It names the first thing that would have had to change, not every factor.
- The `.cache/pages/` text behind our traces is not in the repo, so the page quotes above come from the stored spans.
