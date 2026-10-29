# Usage ledger (everyone)

Counted from Claude Code transcripts by ~/.claude/skills/master-budget/usage.py. 8 runs across 1 person: vs-githjk.

## By person

| Who | Runs | Output tokens | Apify | Bright Data | Web | GitHub | Codex | Last updated (UTC) |
|---|---|---|---|---|---|---|---|---|
| vs-githjk | 8 | 384,343 | 7 | 7 | 43 | 25 | 8 | 2026-10-29T07:58:48Z |

## Totals by service

| Service | Calls |
|---|---|
| Shell | 193 |
| Claude Code tools | 86 |
| Other HTTP | 80 |
| Web search and fetch | 43 |
| GitHub (gh) | 25 |
| Codex | 8 |
| Bright Data | 7 |
| Apify | 7 |
| Browser (Playwright) | 3 |
| Nebius Token Factory | 3 |

## LLM tokens

| Kind | Tokens |
|---|---|
| input_tokens | 756 |
| cache_creation_input_tokens | 1,388,060 |
| cache_read_input_tokens | 55,105,625 |
| output_tokens | 384,343 |

## Per run

| Who | Started (UTC) | Agent | Model | Output tokens | Apify | Bright Data | Browser | Web | GitHub | Codex | Nebius Token Factory | Tavily API | Other HTTP |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| vs-githjk | 2026-10-29T05:59 | main session | claude-opus-5-5 | 140,487 | 0 | 0 | 0 | 2 | 4 | 8 | 0 | 0 | 6 |
| vs-githjk | 2026-10-29T06:00 | master-finder: Research ODSC x Nebius hackathon | claude-opus-5-5 | 68,707 | 0 | 5 | 3 | 3 | 2 | 0 | 3 | 0 | 55 |
| vs-githjk | 2026-10-29T06:24 | master-planner: Rank ideas for ODSC x Nebius | claude-opus-5-5 | 43,512 | 0 | 0 | 0 | 4 | 2 | 0 | 0 | 0 | 0 |
| vs-githjk | 2026-10-29T06:31 | master-auditor: Oversight red-team of ideas | claude-opus-5-5 | 19,287 | 0 | 0 | 0 | 2 | 2 | 0 | 0 | 0 | 4 |
| vs-githjk | 2026-10-29T06:52 | master-planner: Ambitious idea round r3 | claude-opus-5-5 | 31,060 | 0 | 0 | 0 | 4 | 1 | 0 | 0 | 0 | 0 |
| vs-githjk | 2026-10-29T06:52 | master-xo: GitHub team setup | claude-opus-5-5 | 18,683 | 0 | 0 | 0 | 0 | 11 | 0 | 0 | 0 | 0 |
| vs-githjk | 2026-10-29T06:58 | master-auditor: Oversight r3 with ambition gate | claude-opus-5-5 | 22,598 | 0 | 0 | 0 | 3 | 3 | 0 | 0 | 0 | 4 |
| vs-githjk | 2026-10-29T07:46 | master-finder: Market validation for Patient Zero | claude-opus-5-5 | 40,009 | 7 | 2 | 0 | 25 | 0 | 0 | 0 | 0 | 11 |

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
- GitHub (gh): gh: 25
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
- Other HTTP: www.cjr.org: 1
- Other HTTP: www.damiencharlotin.com: 1
- Other HTTP: www.poynter.org: 1
- Other HTTP: www.tavily.com: 2
- Other HTTP: www.w3: 1
- Other HTTP: www.wwno.org: 1
- Web search and fetch: WebFetch: 5
- Web search and fetch: WebSearch: 38

Not covered: other people's machines until they run this and commit plan/usage/<who>.*; calls the project's own app makes at runtime (the app logs those itself); Codex's own token use (logged by master-codex).
