# Research, Nov 15 2026: deadline re-check and competitors

## Summary
1. **Deadline: Fri Nov 20, 11:59 PM EST = 8:59 PM PT** (VERIFIED). Our internal D (Nov 19 23:59 PT) stays.
2. **Video: 2 to 3 minutes suggested** (VERIFIED). Prizes $2,000 / $1,000 / $500 in Token Factory credits; judges are two Nebius Senior Developer Advocates (VERIFIED).
3. Form still arrives by email (UNRESOLVED). Unlisted video OK: NOT FOUND.
4. No rival for this challenge traces backward or counts independent sources; the best ship live URLs and verdicts.

## Part 1: event facts
Source: https://hackathon.odsc.ai/event (200) and its new bundle `/assets/index-BfZ3JFuo.js` (200, 699,838 bytes), fetched 17:52 PT.

| Fact | Now | State | Oct 28 file |
|---|---|---|---|
| Close | `deadlineAt:"2026-11-20T23:59:00-05:00"`; "They close on Friday, November 20, 2026 at 11:59 PM EST." | VERIFIED | time UNRESOLVED. **Changed** |
| In PT | Nov 20, 20:59 PST (DST ended Nov 1, so EST is right) | VERIFIED | |
| Form open? | "Submissions open near the end of the hackathon"; link by email. No form URL in bundle (searched `submitUrl`, `submissionLink`, `formUrl`, `typeform`, `forms.gle`: 0) | UNRESOLVED | same |
| Fields | App's admin insert: `team_name`, `captain_name`, `team_description`, `project_url`, `deployment_url` (opt), `report_url` (opt); `video_links` elsewhere in app | REPORTED (code) | same |
| Video | `suggestedMinutes:[2,3]`; "Nebius suggests a 2-3 minute demo video, plus a public repository with a README." Suggested, not a cap | VERIFIED | no cap. **Changed** |
| Unlisted OK | "unlisted", "YouTube", "Loom": 0 hits | NOT FOUND | same |
| Prizes | Winner $2,000, runner-up $1,000, third $500, Token Factory credits; "Prizes are credits, not cash"; codes "within a few days of the winner announcement"; | VERIFIED | not announced. **Changed** |
| Judges | Tony Kipkemboi, Jacquie Capur, Senior Developer Advocates, Nebius, remote; "Both Nebius judges participate virtually." | VERIFIED | **Changed** |
| Finalist Q&A | "A short live Q&A for finalists may be arranged ... optional and not a live demo day." | VERIFIED | **New** |
| Credits | FAQ: free Token Factory credits for every registrant via dev.nebius.com/builders | VERIFIED | **Changed** |
| Criteria; team size, originality | Criteria 30/25/20/15/10 unchanged. | "team size", "up to four", "pre-existing", "eligib": 0 hits | NOT FOUND | same |

## Part 2a: rival teams (gh search, `--match readme`, created after Oct 27; READMEs read via API, 17:53 PT)
About 60 hits, mostly the Nebius x NVIDIA Global hackathon. Strongest naming hackathon.odsc.ai:

| Repo | What it is | Polish | Does what we don't |
|---|---|---|---|
| skanvish11/Aletheia-core | Claim investigator: support and counter-evidence searches, per-assertion verdict, quick vs deep | 57 commits, 8,221-word README, pushed today | Verdict plus counter-evidence planning |
| triogempar/sourcetrail | Brief where each sentence points at a verbatim passage; second Nebius model plus local check strikes unsupported sentences | **Live** sourcetrail-chi.vercel.app (200), 16 commits | Clickable URL, credit cap, struck sentences |
| Wwang1119/evidencedesk | Coursework brief, click-to-inspect quotes, Markdown and audit JSON export | "All 36 offline tests pass", 3 live runs | `doctor` setup check, exports |
| GF-creator-code ("Sourced") | Plan, search, sufficiency judge (max 3 rounds), untrusted-data separation | 45 commits, saved traces | Maps each design choice to the rubric |
| prasad-anandappa/veritas | Every claim "cited + resolvable + verified", asserted in code; shingle dedup | 1 commit, strong README | Mock mode: judges run it without keys |

Closest mechanism (other hackathon): NoeGRANGE/fact-checker has a step "find the earliest dated coverage" (REPORTED). In 15 rival READMEs, "earliest", "independent source", "reprint", "syndicat": no same-challenge rival traces backward (NOT FOUND).

## Part 2b: products

| Product | Does well | Patient Zero adds |
|---|---|---|
| Perplexity, ChatGPT, Claude | Beat our week-0 spike on all 6 claims (spike/grading.md: Perplexity 6/6 stops Pass, ours 0/6); name early sources well | Hop tree, independence count, red hop. We win only on the origin card, not on a better answer |
| Consensus, Elicit | Paper search and systematic-review reports ("up to 80% time savings", Elicit) | Open web, time order, genealogy |
| Scite | Each citing sentence labelled supporting, contrasting or mentioning (REPORTED; scite.ai 403s curl) | Closest idea, but papers only; we follow web reprints and wording drift |
| Factiverse, Originality.ai | Check a claim true or false now, with source links | Where the number came from |
| Google About this image | When an image was first indexed, where it may have first appeared | Same idea for statistics in text (NOT FOUND from Google) |
| Full Fact AI | Claim matching; "how widely it had been repeated"; 40+ orgs | Backward origin, not forward spread |
| ClaimBuster | Check-worthiness scoring, API | Ranks claims, never traces |

## What to do
- Two Nebius DevRel judges: make Token Factory and Tavily calls visible in the README and the 2 to 3 minute video.
- Ship a live URL or a no-key replay mode; the top rivals do.
- Lead with the origin card and independence count; say plainly that answer engines cite better.

Sources (17:52 to 17:56 PT): hackathon.odsc.ai/event; GitHub repos above; consensus.app/home/about-us; elicit.com; originality.ai/automated-fact-checker; idir.uta.edu/claimbuster; factiverse.ai; fullfact.org/ai; blog.google About this image.

CHECKED_AT: Sun Nov 15 20:56 EST 2026 (17:56 PT)
SUBJECT: hackathon.odsc.ai/event (index-BfZ3JFuo.js); repo@5a52762
CHECKED: event bundle, odsc.ai page, 8 gh searches, 15 READMEs, 8 product pages, 4 web searches
NOT CHECKED: Nebius Discord, X, LinkedIn (login or not authorised), Devpost; rival apps not run; Logically (administration July 2025, REPORTED) left out of table
UNRESOLVED: form fields and open date (email); unlisted video; team size cap
