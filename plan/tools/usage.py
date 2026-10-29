#!/usr/bin/env python3
"""Usage ledger for every agent run in this project, counted from Claude Code's own transcripts
(not from what agents report about themselves).

For each run (main session and every subagent) it records: agent type, model, tokens
(input, output, cache read, cache write), and every tool call grouped by service:
Apify, Bright Data, browser automation, web search and fetch, GitHub, Codex, sponsor APIs
(Tavily, Nebius Token Factory) and any other host reached with curl.

usage: python3 plan/tools/usage.py [project-key-dir ...]
  default: every ~/.claude/projects/* dir whose name contains Nebius-Hackathon or Nebulus-Hackathon
writes:  plan/usage.jsonl (one row per run, rewritten each time) and plan/usage.md (summary tables)
"""
import collections, glob, json, os, re, sys

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))  # plan/
PROJECTS = os.path.expanduser("~/.claude/projects")
keys = sys.argv[1:] or [d for d in glob.glob(f"{PROJECTS}/*")
                        if re.search(r"(Nebius|Nebulus)-Hackathon$", d)]

SPONSOR_HOSTS = {"api.tavily.com": "Tavily API", "tokenfactory.nebius.com": "Nebius Token Factory",
                 "api.tokenfactory.nebius.com": "Nebius Token Factory", "api.studio.nebius.com": "Nebius Token Factory"}
HOST_RE = re.compile(r"https?://([A-Za-z0-9.-]+)")


def service(tool, inp):
    """Map one tool call to (service, detail)."""
    if tool.startswith("mcp__"):
        server, _, name = tool[5:].partition("__")
        label = {"apify": "Apify", "brightdata": "Bright Data", "playwright": "Browser (Playwright)",
                 "chrome-devtools": "Browser (Chrome DevTools)"}.get(server, f"MCP {server}")
        return [(label, name)]
    if tool in ("WebSearch", "WebFetch"):
        return [("Web search and fetch", tool)]
    if tool == "Bash":
        cmd = str(inp.get("command", ""))
        out = []
        if re.search(r"(^|[\s;&|(])gh\s", cmd):
            out.append(("GitHub (gh)", "gh"))
        if re.search(r"(^|[\s;&|(])codex\s", cmd):
            out.append(("Codex", "codex"))
        if "curl" in cmd or "requests." in cmd or "urllib" in cmd:
            for host in set(HOST_RE.findall(cmd)):
                out.append((SPONSOR_HOSTS.get(host, "Other HTTP"), host))
        return out or [("Shell", "bash")]
    return [("Claude Code tools", tool)]


def scan(path, agent):
    row = {"agent": agent, "file": os.path.basename(path), "models": collections.Counter(),
           "tokens": collections.Counter(), "services": collections.Counter(),
           "details": collections.Counter(), "first": None, "last": None}
    for line in open(path, errors="ignore"):
        try:
            e = json.loads(line)
        except ValueError:
            continue
        ts = e.get("timestamp")
        if ts:
            row["first"] = row["first"] or ts
            row["last"] = ts
        m = e.get("message")
        if not isinstance(m, dict) or m.get("role") != "assistant":
            continue
        if m.get("model"):
            row["models"][m["model"]] += 1
        for k, v in (m.get("usage") or {}).items():
            if isinstance(v, int):
                row["tokens"][k] += v
        for b in m.get("content") or []:
            if isinstance(b, dict) and b.get("type") == "tool_use":
                for svc, detail in service(b["name"], b.get("input") or {}):
                    row["services"][svc] += 1
                    row["details"][f"{svc}: {detail}"] += 1
    return row


rows = []
for key in keys:
    for sess in glob.glob(f"{key}/*.jsonl"):
        rows.append(scan(sess, "main session"))
    for sub in glob.glob(f"{key}/*/subagents/agent-*.jsonl"):
        meta = sub[:-len(".jsonl")] + ".meta.json"
        agent = "subagent"
        if os.path.exists(meta):
            md = json.load(open(meta))
            agent = f"{md.get('agentType', 'subagent')}: {md.get('description', '')}"
        rows.append(scan(sub, agent))
rows.sort(key=lambda r: r["first"] or "")

with open(f"{HERE}/usage.jsonl", "w") as f:
    for r in rows:
        f.write(json.dumps({k: (dict(v) if isinstance(v, collections.Counter) else v) for k, v in r.items()}) + "\n")

tot_services, tot_tokens, tot_details = collections.Counter(), collections.Counter(), collections.Counter()
for r in rows:
    tot_services.update(r["services"]); tot_tokens.update(r["tokens"]); tot_details.update(r["details"])

md = ["# Usage ledger", "", f"Counted from Claude Code transcripts by plan/tools/usage.py. {len(rows)} runs.", "",
      "## Totals by service", "", "| Service | Calls |", "|---|---|"]
md += [f"| {s} | {n} |" for s, n in tot_services.most_common()]
md += ["", "## LLM tokens (all runs)", "", "| Kind | Tokens |", "|---|---|"]
md += [f"| {k} | {v:,} |" for k, v in tot_tokens.items() if k.endswith("tokens")]
md += ["", "## Per run", "", "| Started (UTC) | Agent | Model | Output tokens | Apify | Bright Data | Browser | Web | GitHub | Sponsor APIs | Other HTTP |",
       "|---|---|---|---|---|---|---|---|---|---|---|"]
for r in rows:
    s = r["services"]
    md.append(f"| {(r['first'] or '')[:16]} | {r['agent'][:60]} | {', '.join(r['models']) or '-'} | "
              f"{r['tokens'].get('output_tokens', 0):,} | {s['Apify']} | {s['Bright Data']} | "
              f"{s['Browser (Playwright)'] + s['Browser (Chrome DevTools)']} | {s['Web search and fetch']} | "
              f"{s['GitHub (gh)']} | {s['Tavily API'] + s['Nebius Token Factory']} | {s['Other HTTP']} |")
md += ["", "## Detail (service: tool or host)", ""]
md += [f"- {d}: {n}" for d, n in sorted(tot_details.items()) if not d.startswith(("Shell", "Claude Code tools"))]
md += ["", "Not covered here: calls our own app makes to Token Factory and Tavily at runtime; the app logs those itself (plan Global Constraints)."]
open(f"{HERE}/usage.md", "w").write("\n".join(md) + "\n")
print("\n".join(md[:30]))
