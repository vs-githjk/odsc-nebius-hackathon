# Usage ledger

Counted from Claude Code transcripts by plan/tools/usage.py. 6 runs.

## Totals by service

| Service | Calls |
|---|---|
| Shell | 98 |
| Claude Code tools | 49 |
| Other HTTP | 47 |
| GitHub (gh) | 17 |
| Web search and fetch | 15 |
| Bright Data | 5 |
| Browser (Playwright) | 3 |
| Nebius Token Factory | 3 |

## LLM tokens (all runs)

| Kind | Tokens |
|---|---|
| input_tokens | 814 |
| cache_creation_input_tokens | 1,853,454 |
| cache_read_input_tokens | 43,995,713 |
| output_tokens | 414,261 |

## Per run

| Started (UTC) | Agent | Model | Output tokens | Apify | Bright Data | Browser | Web | GitHub | Sponsor APIs | Other HTTP |
|---|---|---|---|---|---|---|---|---|---|---|
| 2026-10-29T05:59 | main session | claude-opus-5-5 | 114,119 | 0 | 0 | 0 | 2 | 1 | 0 | 3 |
| 2026-10-29T06:00 | master-finder: Research ODSC x Nebius hackathon | claude-opus-5-5 | 143,195 | 0 | 5 | 3 | 3 | 2 | 3 | 41 |
| 2026-10-29T06:24 | master-planner: Rank ideas for ODSC x Nebius | claude-opus-5-5 | 83,677 | 0 | 0 | 0 | 4 | 2 | 0 | 0 |
| 2026-10-29T06:31 | master-auditor: Oversight red-team of ideas | claude-opus-5-5 | 35,891 | 0 | 0 | 0 | 2 | 2 | 0 | 3 |
| 2026-10-29T06:52 | master-planner: Ambitious idea round r3 | claude-opus-5-5 | 15,904 | 0 | 0 | 0 | 4 | 1 | 0 | 0 |
| 2026-10-29T06:52 | master-xo: GitHub team setup | claude-opus-5-5 | 21,475 | 0 | 0 | 0 | 0 | 9 | 0 | 0 |

## Detail (service: tool or host)

- Bright Data: scrape_batch: 2
- Bright Data: search_engine_batch: 3
- Browser (Playwright): browser_close: 1
- Browser (Playwright): browser_navigate: 1
- Browser (Playwright): browser_snapshot: 1
- GitHub (gh): gh: 17
- Nebius Token Factory: api.tokenfactory.nebius.com: 2
- Nebius Token Factory: tokenfactory.nebius.com: 1
- Other HTTP: cerebralvalley.ai: 1
- Other HTTP: dev.nebius.com: 3
- Other HTTP: discord: 1
- Other HTTP: docs.studio.nebius.com: 1
- Other HTTP: docs.tavily.com: 6
- Other HTTP: docs.tokenfactory.nebius.com: 4
- Other HTTP: forms.hsforms.com: 1
- Other HTTP: hackathon.odsc.ai: 4
- Other HTTP: hn.algolia.com: 3
- Other HTTP: injester-com.pages.dev: 1
- Other HTTP: lablab.ai: 1
- Other HTTP: nebius.com: 6
- Other HTTP: news.ycombinator.com: 1
- Other HTTP: odsc.ai: 6
- Other HTTP: opendatascience.com: 1
- Other HTTP: share.hsforms.com: 1
- Other HTTP: static.nebius.com: 1
- Other HTTP: www.cjr.org: 1
- Other HTTP: www.damiencharlotin.com: 1
- Other HTTP: www.tavily.com: 2
- Other HTTP: www.w3: 1
- Web search and fetch: WebFetch: 2
- Web search and fetch: WebSearch: 13

Not covered here: calls our own app makes to Token Factory and Tavily at runtime; the app logs those itself (plan Global Constraints).
