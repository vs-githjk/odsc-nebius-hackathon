# Usage ledger: AnoopIbrampur

Counted from Claude Code transcripts by ~/.claude/skills/master-budget/usage.py. 1 runs.

## Totals by service

| Service | Calls |
|---|---|
| Shell | 55 |
| Claude Code tools | 24 |
| GitHub (gh) | 21 |
| MCP ccd_turn | 19 |
| MCP ccd_host | 7 |
| MCP ccd_directory | 1 |
| MCP ccd_pr | 1 |

## LLM tokens

| Kind | Tokens |
|---|---|
| input_tokens | 226 |
| cache_creation_input_tokens | 967,426 |
| cache_read_input_tokens | 10,822,202 |
| output_tokens | 65,572 |

## Per run

| Started (UTC) | Agent | Model | Output tokens | Apify | Bright Data | Browser | Web | GitHub | Codex | Nebius Token Factory | Tavily API | Other HTTP |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 2026-10-30T20:10 | main session | claude-opus-5-5, claude-sonnet-5-5 | 65,572 | 0 | 0 | 0 | 0 | 21 | 0 | 0 | 0 | 0 |

## Detail (service: tool or host)

- GitHub (gh): gh: 21
- MCP ccd_directory: change_directory: 1
- MCP ccd_host: open_in_editor: 7
- MCP ccd_pr: get_status: 1
- MCP ccd_turn: update_plan: 14
- MCP ccd_turn: wrap_up: 5

Not covered: other people's machines until they run this and commit plan/usage/<who>.*; calls the project's own app makes at runtime (the app logs those itself); Codex's own token use (logged by master-codex).
