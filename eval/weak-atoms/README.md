# Weak-number matching, measured on the E2 dev claims (#59)

This folder chose the rule for weak numbers (fewer than `weakNumberMinSigDigits` significant digits, such as 8, 21 or 10,000) in `atomHit`. It uses the 20 E2 dev claims (#34, PR #51) only: no spike claim, spike trace or held-out claim was opened.

## Steps

1. `python3 -I eval/weak-atoms/fetch.py` fetches each dev claim's `seenAt`, `tracedOrigin` and `tracedBy` pages into the git-ignored `.cache/weak-atoms/` as plain text. Full page text is never committed.
2. `atoms.json` gives each measurable claim its number, subject word and unit.
3. `node --import tsx eval/weak-atoms/candidates.ts` lists every sentence on those pages that carries the claim's number (`candidates.json`).
4. `labels.json` is the same list, labelled by hand. `statesClaim` is true when the sentence on its own ties the number to the claim's subject, including a debunk that repeats the claim. Dates, tag lists, URLs, headers and other uses of the number are false.
5. `node --import tsx eval/weak-atoms/measure.ts [--weak] [--per-claim]` scores the old rule, the shipped rule and the alternatives that were tried.

## What was chosen

A weak number counts only when the subject word sits in the same clause as the number. Nothing between them may be `|`, `:`, `(`, `)`, `[` or `]`, and there may be at most `weakNumberMaxCommas` (2) commas. Semicolons are allowed. Numbers inside URLs never count.

Alternatives scored and not chosen: proximity windows of 2 to 12 words (each lost more true hits than it removed false ones), unit matching ("21 days"; it added false hits), and combinations of the two.

## Limits

- Small sample: 120 sentences from 13 measurable claims. Seven claims could not be measured: dev-01, dev-08 and dev-12 have no number; dev-02, dev-04 and dev-15 write the number as a word ("eight", "five"), which is out of scope for T4 (#50); dev-07 is a range, which is skipped.
- Blocked pages: dev-03 (both pages), dev-06's fact-check (timeout), dev-09's origin and dev-11's spread page (403), and dev-18's report (PDF, no extractor on this machine).
- Labels are one person's judgement.
- The 14 misses come from the subject words in `atoms.json` ("phone" against "smartphones", "habit" against the Spanish word for habit, "ram" against "memory"). They are the same before and after, and they are a fingerprint-variant problem (T22), not a clause problem.
- The one false hit left is "TikTok ... 100 million users": the right subject word, about a different app. Catching it needs a named-entity atom.
