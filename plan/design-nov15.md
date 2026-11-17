# Patient Zero design review (Sun Nov 15, 2026)

Main at 5a52762, run locally, judged against pz-final `DESIGN.md`, its screenshots and issue #69. Screenshots: `.playwright-mcp/design-nov15/` (start, sample-rich, sample-conflicting at 1440 and 390, light and dark, plus three scrubber stops and three other samples).

**Slop check: FIX.** Not template slop: type, tokens, ramp and the one lifted card follow DESIGN.md. It fails as unfinished: no working action, no designed states, little hover or motion, and the product's own moments (stop card, red hop, copies band) are missing.

Holds up: fonts, no console errors, no sideways scroll at 390, 44 px handle, arrow keys, focus ring, phone text 14 px or more.

## 1. Critique, ranked by what a judge notices

1. **Start page has nothing to do.** The input is disabled with a builder's note ("Live traces arrive with the engine"), the nav button "Trace a claim" links to the page you are on, and the hero is an invented penguin claim. No rewind story, no select-a-number scene. Tasks 1, 2, 4, 5.
2. **The ending is a 13 px footnote.** "Ends TRAIL GOES COLD. How this was decided: row 6" in grey under the card. Sample-origin has no origin card. Task 6.
3. **The band is a thin node graph.** Four hollow circles and hairline curves, labelled "1 page" three times with no domain; the target shows swarms of copies. Task 7.
4. **No red hop.** Every stop is the same grey ring; nothing marks where the wording changed. The diff boxes each word separately (nine boxes for one phrase) and nothing says what changed. Tasks 8, 9.
5. **Source detail is a hostname and a pill.** No title, quoted span or capture date; raw ISO dates ("2022-08-20", ticks "2019-05"). Task 10.
6. **Samples read like a test index.** Rows titled by stop state ("Trail goes cold" twice) for one claim. Task 3.
7. **CONFLICTING hides the conflict.** Two stops overlap into one glyph and the two numbers never appear together. Task 13.
8. **Almost no motion or hover.** No autoplay intro, no count-up, two hover rules in the app. Tasks 12, 15, 17.
9. **States are bare.** No-pages is one grey line, tool-failed looks like a success, an unknown id is one sentence, no loading state. Task 16.
10. **Finish.** Dead space under a one-line sentence at 1440; counter is "5 pages · 4 clusters", not the chain to roots; dark band turns muddy olive on the today side; band labels sit on curves at 390; no footer. Tasks 12, 20.

## 2. References

URLs checked live today; patterns are from knowing the products, not a fresh study.

1. **NYT, How the Virus Got Out** (https://www.nytimes.com/interactive/2020/03/22/world/coronavirus-spread.html). Each dot is one case and moves as the story advances. Use: live walk and rewind story, each page a dot flying into its cluster.
2. **Perplexity** (https://www.perplexity.ai/). Numbered source chips with favicon and domain; a visible step list while it searches. Use: source cards, live walk log rail.
3. **Wayback Changes** (https://web.archive.org/web/changes/example.com). Two captures side by side, colour-coded diff, a date over each. Use: evidence drawer, CONFLICTING view.
4. **GitHub blame** (https://docs.github.com/en/repositories/working-with-files/using-files/viewing-and-understanding-files). Age as a heat gutter; hover gives who and when. Use: word blame popover tinted by the time ramp.
5. **Forensic Architecture timemap** (https://github.com/forensic-architecture/timemap). Selecting an event opens a card with its sources; timeline and evidence stay linked. Use: band, scrubber and source card share one selection.
6. **Google Fact Check Explorer** (https://toolbox.google.com/factcheck/explorer). One fixed claim card: claim, who said it, date, verdict. Use: origin card, sample rows.
7. **Our World in Data** (https://ourworldindata.org/grapher/life-expectancy). Every chart carries its source line and exports a clean image with it. Use: share card.
8. **Linear** (https://linear.app/changelog). The key shown beside the control. Use: scrubber hints, shortcut sheet, Esc on the drawer.

## 3. Tasks to Wed Nov 18 (21)

Demo path first: 6, 8, 10, 14, 1, 3, 16. Plan ids noted.

Start page:
1. **Working claim box (2 h).** Input enabled; a claim matching a recorded trace opens it, otherwise a plain "not recorded yet" state; the nav button focuses the box.
2. **Paste a whole AI answer (3 h).** Multi-line paste; each number intake finds is marked; clicking one opens the dark quick-look popover with "Trace this number".
3. **Sample rows as claims (1.5 h).** Each row: claim wording in Newsreader, ending with a ramp dot, earliest year, page count.
4. **Real hero claim (1 h).** A real traced statistic with its count; penguin fixtures sit under Samples.
5. **Rewind story, short (3 h, T17).** Three pinned stops: year, morphing sentence, counter; static stack under reduced motion.

Trace page:
6. **Stop card and origin card (3 h, T17).** One card in the band per trace: state title, one sentence, what was searched, rule row; all six states; footnote removed.
7. **Band of copies (3 h).** Clusters as dot swarms sized by count; copies not yet published at the handle's year show as rings; the active cluster shows its domain.
8. **Red hop (2 h).** Coral stop on the track, coral edge in the band, label "Wording changed here"; changed words marked as one run.
9. **Readout chips (2 h, T16).** What changed at this hop, each chip "measured" or "inferred, N%", staggered 60 ms.
10. **Source card (2 h).** Favicon with letter-tile fallback, page title, domain, "June 2021", capture date, the quoted span with the match marked, Open page and Open archive.
11. **Evidence drawer (3 h).** Clicking a cluster opens a side panel: its copies, two spans compared side by side; Esc closes.
12. **Counter chain (1 h, T16).** "5 pages, 4 clusters, traced to 1 root we could link", counting to the handle's year; sentence gap closed.
13. **CONFLICTING view (2 h).** Both earliest spans side by side, differing numbers marked; overlapping stops fan apart.
14. **Live walk replay (3 h, T32).** Recorded events play back: pages land one by one, log lines appear, the counter ticks, the handle walks to the earliest page; Skip button; REPLAY badge.
15. **Autoplay intro and morph (2 h).** Once per trace the handle travels to the earliest stop and back on DESIGN.md timings; kept words slide, new words fade in.
16. **Loading, empty, error (2 h).** Skeleton stage; no-pages shows what was searched; tool-failed in caution tone with what was reached; unknown id offers the samples.
17. **Keyboard and hover (1.5 h).** Hover and focus states with a date tooltip on stops and clusters; arrow hint under the scrubber; "?" opens a shortcut sheet.
18. **Word blame popover (2 h, T16).** Hover, focus or tap a word: the earliest page and date it appears on, tinted by the ramp.
19. **Share card (2 h).** A 1200 by 630 view per trace: claim, earliest year, ending, ramp bar; "Copy link" with a quiet check.
20. **Dark, dates, phone (1.5 h, all screens).** Dark band ramp fixed; every date reads "August 2022"; no label on a curve at 390; footer with wordmark and team line.
21. **Rule sheet (1 h, T17).** "How this was decided" opens the decision row in plain words.

Not checked: word morph between stops, pointer drag, reduced motion, Safari, Firefox, screen readers, Lighthouse, the cold-unread and partial samples.
