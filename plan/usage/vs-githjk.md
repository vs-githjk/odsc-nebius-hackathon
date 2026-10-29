# Usage ledger: vs-githjk

Counted from Claude Code transcripts by ~/.claude/skills/master-budget/usage.py. 10 runs.

## Totals by service

| Service | Calls |
|---|---|
| Shell | 212 |
| Claude Code tools | 97 |
| Other HTTP | 82 |
| Web search and fetch | 46 |
| GitHub (gh) | 31 |
| Codex | 8 |
| Bright Data | 7 |
| Apify | 7 |
| Browser (Playwright) | 3 |
| Nebius Token Factory | 3 |

## LLM tokens

| Kind | Tokens |
|---|---|
| input_tokens | 838 |
| cache_creation_input_tokens | 1,570,968 |
| cache_read_input_tokens | 61,806,130 |
| output_tokens | 424,527 |

## Per run

| Started (UTC) | Agent | Model | Output tokens | Apify | Bright Data | Browser | Web | GitHub | Codex | Nebius Token Factory | Tavily API | Other HTTP |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 2026-10-29T05:59 | main session | claude-opus-5-5 | 150,954 | 0 | 0 | 0 | 2 | 10 | 8 | 0 | 0 | 6 |
| 2026-10-29T06:00 | master-finder: Research ODSC x Nebius hackathon | claude-opus-5-5 | 68,707 | 0 | 5 | 3 | 3 | 2 | 0 | 3 | 0 | 55 |
| 2026-10-29T06:24 | master-planner: Rank ideas for ODSC x Nebius | claude-opus-5-5 | 43,512 | 0 | 0 | 0 | 4 | 2 | 0 | 0 | 0 | 0 |
| 2026-10-29T06:31 | master-auditor: Oversight red-team of ideas | claude-opus-5-5 | 19,287 | 0 | 0 | 0 | 2 | 2 | 0 | 0 | 0 | 4 |
| 2026-10-29T06:52 | master-planner: Ambitious idea round r3 | claude-opus-5-5 | 31,060 | 0 | 0 | 0 | 4 | 1 | 0 | 0 | 0 | 0 |
| 2026-10-29T06:52 | master-xo: GitHub team setup | claude-opus-5-5 | 18,683 | 0 | 0 | 0 | 0 | 11 | 0 | 0 | 0 | 0 |
| 2026-10-29T06:58 | master-auditor: Oversight r3 with ambition gate | claude-opus-5-5 | 22,598 | 0 | 0 | 0 | 3 | 3 | 0 | 0 | 0 | 4 |
| 2026-10-29T07:46 | master-finder: Market validation for Patient Zero | claude-opus-5-5 | 40,009 | 7 | 2 | 0 | 25 | 0 | 0 | 0 | 0 | 11 |
| 2026-10-29T08:19 | master-planner: Refine Patient Zero, round 1 | claude-opus-5-5 | 29,492 | 0 | 0 | 0 | 3 | 0 | 0 | 0 | 0 | 2 |
| 2026-10-29T08:27 | master-auditor: Red-team Patient Zero brief, round 2 | claude-opus-5-5 | 225 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |

## Detail (service: tool or host)

- Apify: apify--rag-web-browser: 1
- Apify: call-actor: 3
- Apify: get-dataset-items: 3
- Bright Data: scrape_batch: 2
- Bright Data: search_engine: 2
- Bright Data: search_engine_batch: 3
- Browser (Playwright): browser_close: 1
- Browser (Playwright): browser_navigate: 1
- Browser (Playwright): browser_snapshot: 1
- Codex: codex: 8
- GitHub (gh): gh: 31
- Nebius Token Factory: api.tokenfactory.nebius.com: 2
- Nebius Token Factory: tokenfactory.nebius.com: 1
- Other HTTP: api.apify.com: 5
- Other HTTP: cerebralvalley.ai: 1
- Other HTTP: claude.ai: 1
- Other HTTP: dev.nebius.com: 3
- Other HTTP: discord: 1
- Other HTTP: docs.studio.nebius.com: 1
- Other HTTP: docs.tavily.com: 10
- Other HTTP: docs.tokenfactory.nebius.com: 6
- Other HTTP: en.wikipedia.org: 1
- Other HTTP: forms.hsforms.com: 1
- Other HTTP: fullfact.org: 1
- Other HTTP: hackathon.odsc.ai: 6
- Other HTTP: hn.algolia.com: 6
- Other HTTP: injester-com.pages.dev: 1
- Other HTTP: lablab.ai: 1
- Other HTTP: nebius.com: 11
- Other HTTP: news.ycombinator.com: 1
- Other HTTP: objection.ai: 1
- Other HTTP: objection.lol: 1
- Other HTTP: odsc.ai: 9
- Other HTTP: opendatascience.com: 1
- Other HTTP: reporterslab.org: 2
- Other HTTP: share.hsforms.com: 1
- Other HTTP: static.nebius.com: 1
- Other HTTP: web.archive.org: 2
- Other HTTP: www.cjr.org: 1
- Other HTTP: www.damiencharlotin.com: 1
- Other HTTP: www.poynter.org: 1
- Other HTTP: www.tavily.com: 2
- Other HTTP: www.w3: 1
- Other HTTP: www.wwno.org: 1
- Web search and fetch: WebFetch: 6
- Web search and fetch: WebSearch: 40

Not covered: other people's machines until they run this and commit plan/usage/<who>.*; calls the project's own app makes at runtime (the app logs those itself); Codex's own token use (logged by master-codex).
