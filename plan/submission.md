# Submission: ODSC x Nebius Hackathon 2026

Owner: master-finder seeded this at H3 (2026-10-28 23:20 PDT). Master Planner owns it after the idea is locked. Every row cites where it came from. Status of the whole file: **partial (public pages only)**. There is no hacker portal yet: the submission link is emailed to registered participants near the end, and prizes and judges are "announced soon".

Sources used below (all fetched 2026-10-28 between 23:01 and 23:15 PDT, HTTP 200):
- [E] https://hackathon.odsc.ai/event (a JS app; text read from its bundle `/assets/index-CImxg_2Q.js`, the event config object `gt`). Newest source: its hero image asset is dated 2026-10-22.
- [W] https://odsc.ai/west/nebius-hackathon/ (WordPress page, `dateModified` 2026-10-01). OLDER, describes a one-day in-person event; conflicts with [E] on format. [E] wins where they disagree.
- [F] HubSpot form definition, portal 1865444, form `f432bc3c-2e85-4624-a0f0-6cde804a6636` (https://forms.hsforms.com/embed/v3/form/1865444/f432bc3c-2e85-4624-a0f0-6cde804a6636/json), `formDefinitionUpdatedAt` 2026-10-23 05:26 PDT; also rendered read-only in Playwright.

## Event facts
| Fact | Value | State | Source |
|---|---|---|---|
| Event dates | Oct 28 to Nov 20, 2026. Kickoff at ODSC AI West SF, streamed; then fully virtual build | VERIFIED | [E] `date`, FAQ "After kickoff, the hackathon runs fully virtual through November 20." |
| Submission deadline D | **Friday Nov 20, 2026. Exact time and timezone NOT FOUND.** Plan for Nov 19 23:59 PT as our own internal D until the emailed link states a time | date VERIFIED, time UNRESOLVED | [E] `submissions.closeNote`: "They close on Friday, November 20, 2026." Searched bundle for "11:59", "PT", "PST", "PDT", "Deadline": no hits. Settled by the submission email |
| When submissions open | "near the end of the hackathon"; link emailed to registered participants | VERIFIED | [E] `submissions.openNote`, `linkSharedWith` |
| Submission platform | **Not Devpost.** Link arrives by email. hackathon.odsc.ai is ODSC's own judging app (Supabase): its admin code stores submissions with fields `team_name`, `captain_name`, `team_description`, `project_url`, `deployment_url` (optional), `report_url` (optional), `video_links` (optional), `hackathon_id`; judges score per criterion (`max_score`, `weight`) | platform UNRESOLVED; field list REPORTED (inferred from admin code, not the participant form) | [E] bundle strings around `z.from("submissions").insert({team_name:..., captain_name:..., ...})` |
| Hard requirements | 1) Inference on Nebius Token Factory 2) Real-time web search with Tavily 3) A public repo with a README 4) A short demo | VERIFIED | [E] `challenge.requirements` |
| Demo length cap | "short demo"; no minute cap stated | UNRESOLVED | [E] requirement `{id:"demo",format:"short"}`; searched bundle for "minute" (only "About 2 minutes" registration copy) |
| Unlisted video accepted? | NOT FOUND | UNRESOLVED | searched [E] for "unlisted", "YouTube", "Vimeo": no hits |
| Judging format | No live demo day. Judging after Nov 20; "Judges will assess the working demo, public repo, and README." Winners announced soon after | VERIFIED | [E] FAQ "How will projects be judged?" and "Is there a demo day?" |
| Judging criteria and weights | Sourced and verifiable answers 30; Works end to end 25; Usefulness 20; Agent design 15; Use of Token Factory and Tavily 10. Full expectation text in `plan/intel.md` section 4 | VERIFIED | [E] `judging[]` |
| Prizes | "Prizes and judges will be announced soon; registered participants will be notified by email." Winner benefits: promotion across ODSC channels, ODSC blog write-up, interview spotlight | VERIFIED (not announced) | [E] `winners.prizesNote`, `winners.benefits` |
| Judges | Not announced | VERIFIED (not announced) | [E] same line |
| Max prizes per project | NOT FOUND (single challenge) | UNRESOLVED | [E] |
| Team size limit | **NOT FOUND.** Solo allowed; teams form in person or "online through live-support matching". The form takes a free-text list of teammate emails | UNRESOLVED | [E] FAQ "Can I come without a team?"; [F] field `emails`; searched [E] for "team size", "Team size", "max": no hit. Our team of 4 is not contradicted anywhere |
| Originality rule (pre-existing code) | **NOT FOUND.** No rule about code written before Oct 28 on any public page | UNRESOLVED | searched [E] bundle for "original", "pre-existing", "existing code", "Rules", "Terms": 0 hits; [W] has none. Safe default: start the repo after kickoff (Oct 28) and keep commit history public so the timeline is self-evident |
| Eligibility and geography | "Free, open to everyone", "no acceptance review". The form accepts any country. ODSC Privacy Policy and Terms and Conditions must be accepted (no hackathon-specific rules page found) | VERIFIED (no restriction found) | [E] FAQ "Do I need to apply and be accepted?"; [F] country list; links https://odsc.ai/privacy-policy/ and https://odsc.ai/code-of-conduct/ from [W] |
| Practical geography limit | Token Factory billing needs a bank card and a supported country of residence (a Nebius feature-request user reports Philippines missing) | billing card VERIFIED; country gap REPORTED (tier 3) | https://docs.tokenfactory.nebius.com/other-capabilities/billing-new.md ; ideas.nebius.com snippet via Google (Bright Data search) |
| Terms / rules page | No hackathon rules page exists publicly. Footer: "Co-hosted by ODSC AI and Nebius. Details subject to change." | ABSENT on public pages (searched [E] and [W]) | [E] `footerNote` |
| Live support | "live support is available online for the entire hackathon"; Nebius engineers online throughout. **Channel not named** (no Discord or Slack link on [E] or in the form). Nebius runs a public builder Discord: https://discord.com/invite/nN58zxSTFR | support VERIFIED; event channel UNRESOLVED | [E] `offer[]` "Live support all hackathon"; dev.nebius.com "Join Discord" link |
| Team matching | In person at kickoff, or online through live-support matching | VERIFIED | [E] FAQ |
| Expo pass | Registered hackers get a complimentary ODSC AI West Expo pass | VERIFIED | [E] `offer[]` |
| Organizer contact | paula.m@odsc.com (form thank-you message) | VERIFIED | [F] `inlineMessage` |
| Conflict to know | [W] still says one-day in-person Oct 29, rolling acceptance, "limited spots", tracks (agents, coding, personal AI, inference, open), 17:30 PT submit with "repo link + short demo", GPU compute on Nebius AI Cloud and Token Factory API credits. [E] (newer) says month-long virtual, single research-agent challenge, no acceptance review. Treat [W] as stale; ask at kickoff whether Token Factory credits from [W] still apply | VERIFIED conflict | [W] text; [E] config |

## Team
Team of 4, about 2 hours a day each, coordinating through GitHub (conductor brief, 2026-10-28).
| Member | Registered (form) | Token Factory account | Tavily account | GitHub |
|---|---|---|---|---|
| Vidyut | | | | |
| Teammate 2 | | | | |
| Teammate 3 | | | | |
| Teammate 4 | | | | |

## Prize matrix
| Prize | Hard requirements | Exact submission fields | Video length | Owner | Status | Evidence |
|---|---|---|---|---|---|---|
| ODSC x Nebius main challenge: "Build a research agent that brings its sources" | Token Factory inference drives reasoning or synthesis; Tavily retrieves live web evidence; public repo with README (setup and run instructions, architecture overview, model and integration setup, keys out of repo); short demo showing a real question, opened citations, and a failure or insufficient-evidence case | Expected (REPORTED from admin code): team name, captain name, team description, project URL (repo), deployment URL (optional), report URL (optional), video link. Confirm when the email arrives | "short" (no cap found) | main session | partial (public pages only) | [E] `challenge`, `judging[].evidence`, `submissions` |
| Any separate sponsor prizes (Nebius, Tavily) | none announced | n/a | n/a | | not announced | [E] `winners.prizesNote` |

## Submission checklist (fill when the email arrives)
- [ ] Deadline time and timezone copied here from the email, with the email date
- [ ] Every field name on the real form copied verbatim into the matrix
- [ ] Repo public, LICENSE file, README: user and task, setup and run, architecture overview, research trace walkthrough, model IDs used, how keys are configured (`.env.example` only)
- [ ] Demo video: real question, real Token Factory and Tavily calls visible (redacted logs), citations opened and matched to quotes, one insufficient-evidence or failure case
- [ ] Deployment URL (optional field) works in an incognito window
- [ ] Model IDs pinned to ones NOT on the Nov 9, 2026 Token Factory deprecation list (see `plan/research.md`)
- [ ] All 4 teammates listed; confirm whether each must be registered separately

CHECKED_AT: Wed Oct 28 23:20 PDT 2026
SUBJECT: https://hackathon.odsc.ai/event (bundle index-CImxg_2Q.js), https://odsc.ai/west/nebius-hackathon/, HubSpot form f432bc3c
CHECKED: event bundle config, odsc.ai page text and metadata, HubSpot form JSON plus Playwright render, Token Factory billing doc, dev.nebius.com
NOT CHECKED: the participant submission form (does not exist yet); ODSC Terms and Conditions text (no hackathon section located); any ODSC Slack
UNRESOLVED: deadline time and timezone; video cap; unlisted OK; team size cap; originality rule; event support channel; whether [W]'s Token Factory credits still apply. All are settled by the kickoff stream, the confirmation email, or asking paula.m@odsc.com
