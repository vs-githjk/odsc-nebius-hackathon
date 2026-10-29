# Run of show: <hackathon> <year>

Copy to `plan/run-of-show.md` at kickoff. D = the submission deadline in local time, taken from the hacker portal and written in `plan/submission.md`. Fill the Clock column once D is known. The planner's hour plan places its blocks inside these anchors; it never moves the four hard anchors (storyboard D-14h, freeze D-6h, submit D-3h, sentinel T-60 and T-10).

Originality rule: check the event's rule before any prep. Cal Hacks 13.0 (Fri Oct 23 to Sun Oct 25, 2026, Palace of Fine Arts SF): "you cannot work on a project you started before the hackathon", so pre-event work is tooling, accounts, templates, agent upgrades and problem research only. No project code, repo or designs before the start.

D = <date and time, local> (source: <portal URL or screenshot path>)

## Pre-event checklist (days before)
Keys and passwords stay in password managers or `~/.config/...` files with chmod 600, never in chat.
- [ ] Anthropic API key works (status-only ping).
- [ ] Agentverse and ASI:One account, plus one test agent built outside any project repo, to learn registration, chat protocol, discoverability and where the agent address is shown.
- [ ] Every team member has an ASI:One handle (sponsors may ask for each one).
- [ ] Google AI Studio and Google Cloud: key works; write down where the project number and project ID are shown, in case a form asks.
- [ ] Devpost account for every member, joined to the hackathon.
- [ ] YouTube channel verified so it can upload public videos and set a custom thumbnail (or Vimeo as backup).
- [ ] Vercel (or host) account with read access master-guardian can use for `plan/live.json`.
- [ ] Templates ready (not project code): README skeleton with sponsor section, agent name and address slots and badges; Devpost field sheet (`templates/submission.md`); storyboard still template; title, end card and caption styles; 3:2 and 16:9 thumbnail templates.
- [ ] Video pipeline dry run on dummy footage: cut, captions, loudness, web copy under 95 MB, upload unlisted, confirm it plays in an embed.
- [ ] Domain decision: worth it or not. If yes, Vidyut buys it after kickoff and allows at least 2 h for delegation and negative caching; the `*.vercel.app` URL is always the fallback in the submission.

## Event timeline
| When | Clock | What | Owner | Only Vidyut decides |
|---|---|---|---|---|
| Kickoff | | Hacker-portal challenges page captured into `plan/submission.md`: deadline, video cap, unlisted OK?, judging format (expo or video), each sponsor's required fields | Vidyut (screenshot), master-finder, master-planner | which prizes to target |
| Kickoff + 10 min | | Preflight H0.5 into `plan/preflight.md` | main session | anything RED |
| Kickoff to +4h | | Grill (2 rounds), research, ideas on the real rubric, idea locked | master-grill, master-finder, master-planner | the idea |
| D-32h | | Repo public with a license; Devpost draft with name, placeholder-free tagline, team members (a Draft is not a submission) | main session, master-writer | repo visibility, name |
| D-24h | | Thin end-to-end happy path on the deployed URL; sponsor hooks real (agent registered, address recorded); first `plan/live.json` | master-builder, master-guardian | deploys |
| D-16h | | Wow moment works on prod; claims ledger updated (built, mocked, planned) | master-builder, master-planner | cuts below the line |
| **D-14h** | | **Video storyboard gate**: visual storyboard artifact, Vidyut writes "approve" (quote in state.json) | master-creator | approve, mock disclosure, sponsors shown, voice, length |
| D-10h | | Rough cut v1 from fresh captures; Vidyut records real assets (call audio, his own browser takes) | master-creator, Vidyut | notes |
| **D-6h** | | **Feature freeze**: inspector whole-branch plus demo-path mode; judge on prod returns top 3 fixes; bug fixes only after this | master-reviewer, master-auditor | which fixes |
| D-5h | | Final video uploaded by Vidyut (public or as the rules say, "Not made for kids"); 3:2 thumbnail at most 5 MB; sponsor cut if a sponsor needs 3 to 5 min | master-creator, Vidyut | upload |
| D-4h | | Writer's Devpost mode, every field final; README final with agent addresses and badges; claims check against `plan/live.json` | master-writer | tagline, story |
| **D-3h** | | **SUBMIT**: press "Submit project", confirm green "Submitted"; incognito check (video plays, try-it works, repo public, sponsor fields filled, tracks and prizes selected, all teammates listed) | Vidyut, main session | submit |
| D-3h to D-30m | | Polish only, re-save the submitted project; sentinel confirms live build = intended SHA; no merges in the last 60 min unless the guardian re-verifies after | main session, master-guardian | any merge |
| **T-60, T-10** | | **Sentinel judging-window mode**: GO / NO-GO with evidence (live SHA, hero path smoke, cold start warmed, call caps with headroom, env flags, error monitor quiet, fallback video plays) | master-guardian | NO-GO actions |
| Before judging | | Coach drill: 2 min talk plus 1 min Q&A, and a 30 s version; demo on laptop and phone; fallback video queued; name each sponsor technology on screen as it appears | master-coach, Vidyut | talk track |
| After | | Retro (failure categories, root causes, agent edits); memory update; LinkedIn post only on his approval | master-coach, main session | posting |

At LA Hacks 2026 the video took about 5 h from go to v5, which is why the storyboard gate sits at D-14h: it leaves room for 3 review rounds.
