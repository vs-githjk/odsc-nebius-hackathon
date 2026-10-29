# Usage ledger

Counted from Claude Code transcripts by ~/.claude/skills/master-budget/usage.py. 7 runs. Transcript dirs: -Users-vidyutsriram-ODSC-x-Nebius-Hackathon, -Users-vidyutsriram-OSDC-x-Nebulus-Hackathon.

## Totals by service

| Service | Calls |
|---|---|
| Shell | 136 |
| Claude Code tools | 67 |
| Other HTTP | 51 |
| GitHub (gh) | 22 |
| Web search and fetch | 18 |
| Bright Data | 5 |
| Browser (Playwright) | 3 |
| Nebius Token Factory | 3 |

## LLM tokens (all runs)

| Kind | Tokens |
|---|---|
| input_tokens | 1,096 |
| cache_creation_input_tokens | 2,342,732 |
| cache_read_input_tokens | 63,003,594 |
| output_tokens | 617,663 |

## Per run

| Started (UTC) | Agent | Model | Output tokens | Apify | Bright Data | Browser | Web | GitHub | Codex | Nebius Token Factory | Tavily API | Other HTTP |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 2026-10-29T05:59 | main session | claude-opus-5-5 | 229,075 | 0 | 0 | 0 | 2 | 1 | 0 | 0 | 0 | 3 |
| 2026-10-29T06:00 | master-finder: Research ODSC x Nebius hackathon | claude-opus-5-5 | 143,195 | 0 | 5 | 3 | 3 | 2 | 0 | 3 | 0 | 41 |
| 2026-10-29T06:24 | master-planner: Rank ideas for ODSC x Nebius | claude-opus-5-5 | 83,677 | 0 | 0 | 0 | 4 | 2 | 0 | 0 | 0 | 0 |
| 2026-10-29T06:31 | master-auditor: Oversight red-team of ideas | claude-opus-5-5 | 35,891 | 0 | 0 | 0 | 2 | 2 | 0 | 0 | 0 | 3 |
| 2026-10-29T06:52 | master-planner: Ambitious idea round r3 | claude-opus-5-5 | 50,198 | 0 | 0 | 0 | 4 | 1 | 0 | 0 | 0 | 0 |
| 2026-10-29T06:52 | master-xo: GitHub team setup | claude-opus-5-5 | 34,184 | 0 | 0 | 0 | 0 | 11 | 0 | 0 | 0 | 0 |
| 2026-10-29T06:58 | master-auditor: Oversight r3 with ambition gate | claude-opus-5-5 | 41,443 | 0 | 0 | 0 | 3 | 3 | 0 | 0 | 0 | 4 |

## Detail (service: tool or host)

- Bright Data: scrape_batch: 2
- Bright Data: search_engine_batch: 3
- Browser (Playwright): browser_close: 1
- Browser (Playwright): browser_navigate: 1
- Browser (Playwright): browser_snapshot: 1
- GitHub (gh): gh: 22
- Nebius Token Factory: api.tokenfactory.nebius.com: 2
- Nebius Token Factory: tokenfactory.nebius.com: 1
- Other HTTP: cerebralvalley.ai: 1
- Other HTTP: dev.nebius.com: 3
- Other HTTP: discord: 1
- Other HTTP: docs.studio.nebius.com: 1
- Other HTTP: docs.tavily.com: 7
- Other HTTP: docs.tokenfactory.nebius.com: 4
- Other HTTP: forms.hsforms.com: 1
- Other HTTP: hackathon.odsc.ai: 4
- Other HTTP: hn.algolia.com: 3
- Other HTTP: injester-com.pages.dev: 1
- Other HTTP: lablab.ai: 1
- Other HTTP: nebius.com: 6
- Other HTTP: news.ycombinator.com: 1
- Other HTTP: objection.ai: 1
- Other HTTP: objection.lol: 1
- Other HTTP: odsc.ai: 6
- Other HTTP: opendatascience.com: 1
- Other HTTP: share.hsforms.com: 1
- Other HTTP: static.nebius.com: 1
- Other HTTP: www.cjr.org: 1
- Other HTTP: www.damiencharlotin.com: 1
- Other HTTP: www.tavily.com: 2
- Other HTTP: www.w3: 1
- Other HTTP: www.wwno.org: 1
- Web search and fetch: WebFetch: 3
- Web search and fetch: WebSearch: 15

Not covered: calls the project's own app makes at runtime (the app logs those itself), and Codex's own token use (logged by master-codex).
