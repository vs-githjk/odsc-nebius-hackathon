#!/usr/bin/env python3
"""Usage ledger for a project, counted from Claude Code's own transcripts (not from agents' self-reports).

For each run (the main session and every subagent) it records the agent type, model, tokens
(input, output, cache read, cache write) and every tool call grouped by service: Apify, Bright Data,
browser automation, web search and fetch, GitHub, Codex, other MCP servers, and HTTP requests made from
the shell, detected from URLs written in the command text (one per URL occurrence; requests made by a
script without a URL in the command line are not seen).

usage: python3 ~/.claude/skills/master-budget/usage.py [--project DIR] [--who NAME] [--key KEY ...] [--combine]
  --project  project folder (default: current directory)
  --who      whose runs these are (default: your GitHub login from `gh`, else git user.name, else $USER)
  --key      extra ~/.claude/projects/<KEY> dirs to include, e.g. the project's old name after a folder rename.
             Keys listed one per line in DIR/plan/usage-keys.txt are included too.
  --combine  skip scanning; only rebuild the team summary from every person's file (after a pull or a merge conflict)
writes:    DIR/plan/usage/<who>.jsonl and DIR/plan/usage/<who>.md. Runs are merged, never replaced: each run is keyed
           by machine and transcript, so a second machine, a cleared transcript folder or an empty scan keeps the
           runs already recorded. Each run carries generated_at (when this script last saw it). Then
           DIR/plan/usage.md, the summary across everyone in plan/usage/ (generated: safe to overwrite;
           on a merge conflict in it, run with --combine).
Solo, plan/usage/ holds one person and the summary matches that person's file. In a team, every member runs it
on their own machine (each machine only sees its own Claude Code sessions) and commits plan/usage/<who>.*.
Hosts named in DIR/plan/usage-hosts.json ({"api.tavily.com": "Tavily API", ...}) get their own column.
"""
import argparse, collections, datetime, fcntl, glob, hashlib, json, os, re, socket, subprocess

ap = argparse.ArgumentParser()
ap.add_argument("--project", default=os.getcwd())
ap.add_argument("--key", action="append", default=[])
ap.add_argument("--who")
ap.add_argument("--combine", action="store_true")
args = ap.parse_args()
project = os.path.abspath(args.project)
plan = os.path.join(project, "plan")
projects = os.path.expanduser("~/.claude/projects")

keys = [re.sub(r"[^A-Za-z0-9]", "-", project)] + args.key
keys_file = os.path.join(plan, "usage-keys.txt")
if os.path.exists(keys_file):
    keys += [l.strip() for l in open(keys_file) if l.strip() and not l.startswith("#")]
key_dirs = [os.path.join(projects, k) for k in dict.fromkeys(keys) if os.path.isdir(os.path.join(projects, k))]

hosts_file = os.path.join(plan, "usage-hosts.json")
NAMED_HOSTS = json.load(open(hosts_file)) if os.path.exists(hosts_file) else {}
MCP_LABELS = {"apify": "Apify", "brightdata": "Bright Data", "playwright": "Browser (Playwright)",
              "chrome-devtools": "Browser (Chrome DevTools)"}
HOST_RE = re.compile(r"https?://([A-Za-z0-9.-]+)")


def services(tool, inp):
    """Map one tool call to a list of (service, detail)."""
    if tool.startswith("mcp__"):
        server, _, name = tool[5:].partition("__")
        return [(MCP_LABELS.get(server, f"MCP {server}"), name)]
    if tool in ("WebSearch", "WebFetch"):
        return [("Web search and fetch", tool)]
    if tool == "Bash":
        cmd = inp.get("command", "") if isinstance(inp, dict) else ""
        cmd = cmd if isinstance(cmd, str) else ""
        out = []
        if re.search(r"(^|[\s;&|(])gh\s", cmd):
            out.append(("GitHub (gh)", "gh"))
        if re.search(r"(^|[\s;&|(])codex\s", cmd):
            out.append(("Codex", "codex"))
        if re.search(r"curl|wget|requests\.|urllib|httpx|fetch\(", cmd):
            for host in HOST_RE.findall(cmd):
                out.append((NAMED_HOSTS.get(host, "Other HTTP"), host))
        return out or [("Shell", "bash")]
    return [("Claude Code tools", tool)]


def scan(path, agent):
    row = {"agent": agent, "file": os.path.relpath(path, projects), "models": collections.Counter(),
           "tokens": collections.Counter(), "services": collections.Counter(),
           "details": collections.Counter(), "first": None, "last": None}
    seen_ids = set()  # one response can span several records that repeat the same usage block
    for line in open(path, errors="ignore"):
        try:
            e = json.loads(line)
        except ValueError:
            continue
        if not isinstance(e, dict):
            continue
        ts = e.get("timestamp")
        if isinstance(ts, str) and ts:
            row["first"] = row["first"] or ts
            row["last"] = ts
        m = e.get("message")
        if not isinstance(m, dict) or m.get("role") != "assistant":
            continue
        mid = m.get("id") if isinstance(m.get("id"), str) else None
        usage = m.get("usage") if isinstance(m.get("usage"), dict) else None
        if usage and (mid is None or mid not in seen_ids):  # count each response's usage once
            if mid:
                seen_ids.add(mid)
            if isinstance(m.get("model"), str):
                row["models"][m["model"]] += 1
            for k, v in usage.items():
                if isinstance(v, int) and not isinstance(v, bool):
                    row["tokens"][k] += v
        content = m.get("content")
        for b in content if isinstance(content, list) else ():
            if isinstance(b, dict) and b.get("type") == "tool_use":
                for svc, detail in services(str(b.get("name", "")), b.get("input")):
                    row["services"][svc] += 1
                    row["details"][f"{svc}: {detail}"] += 1
    return row


def default_who():
    for cmd in (["gh", "api", "user", "--jq", ".login"], ["git", "-C", project, "config", "user.name"]):
        try:
            out = subprocess.run(cmd, capture_output=True, text=True, timeout=8).stdout.strip()
            if out:
                return out
        except (OSError, subprocess.SubprocessError):
            pass
    return os.environ.get("USER", "me")


who_raw = (args.who or default_who()).strip() or "me"
who = re.sub(r"[^A-Za-z0-9_.-]", "-", who_raw).strip("-.") or "me"
usage_dir = os.path.join(plan, "usage")
os.makedirs(usage_dir, exist_ok=True)
lock = open(os.path.join(usage_dir, ".lock"), "w")  # one run at a time per project: scan, merge and summary
fcntl.flock(lock, fcntl.LOCK_EX)
C = collections.Counter
api_labels = sorted(set(NAMED_HOSTS.values()))


def render(rows, title, team):
    tot_s, tot_t, tot_d = C(), C(), C()
    for r in rows:
        tot_s.update(r["services"]); tot_t.update(r["tokens"]); tot_d.update(r["details"])
    people = sorted({r["who"] for r in rows})
    md = [f"# {title}", "",
          f"Counted from Claude Code transcripts by ~/.claude/skills/master-budget/usage.py. {len(rows)} runs"
          + (f" across {len(people)} {'person' if len(people) == 1 else 'people'}: {', '.join(people)}." if team else "."), ""]
    if team:
        cols = ["Who", "Runs", "Output tokens", "Apify", "Bright Data", "Web", "GitHub", "Codex", "Last updated (UTC)"]
        md += ["## By person", "", "| " + " | ".join(cols) + " |", "|" + "---|" * len(cols)]
        for p in people:
            rs = [r for r in rows if r["who"] == p]
            s_, t_ = C(), C()
            for r in rs:
                s_.update(r["services"]); t_.update(r["tokens"])
            md.append(f"| {p} | {len(rs)} | {t_['output_tokens']:,} | {s_['Apify']} | {s_['Bright Data']} | "
                      f"{s_['Web search and fetch']} | {s_['GitHub (gh)']} | {s_['Codex']} | "
                      f"{max((str(r.get('generated_at') or '') for r in rs), default='') or 'unknown'} |")
        md.append("")
    md += ["## Totals by service", "", "| Service | Calls |", "|---|---|"]
    md += [f"| {k} | {n} |" for k, n in tot_s.most_common()]
    md += ["", "## LLM tokens", "", "| Kind | Tokens |", "|---|---|"]
    md += [f"| {k} | {v:,} |" for k, v in tot_t.items() if k.endswith("tokens")]
    head = (["Who"] if team else []) + ["Started (UTC)", "Agent", "Model", "Output tokens", "Apify", "Bright Data",
            "Browser", "Web", "GitHub", "Codex"] + api_labels + ["Other HTTP"]
    md += ["", "## Per run", "", "| " + " | ".join(head) + " |", "|" + "---|" * len(head)]
    for r in sorted(rows, key=lambda r: r.get("first") or ""):
        s_ = C(r["services"]); t_ = C(r["tokens"])
        cells = ([r["who"]] if team else []) + [(r.get("first") or "")[:16], r["agent"][:60], ", ".join(r["models"]) or "-",
                 f"{t_['output_tokens']:,}", s_["Apify"], s_["Bright Data"],
                 s_["Browser (Playwright)"] + s_["Browser (Chrome DevTools)"], s_["Web search and fetch"],
                 s_["GitHub (gh)"], s_["Codex"]] + [s_[a] for a in api_labels] + [s_["Other HTTP"]]
        md.append("| " + " | ".join(str(c).replace("|", "/") for c in cells) + " |")
    md += ["", "## Detail (service: tool or host)", ""]
    md += [f"- {d}: {n}" for d, n in sorted(tot_d.items()) if not d.startswith(("Shell", "Claude Code tools"))]
    md += ["", "Not covered: other people's machines until they run this and commit plan/usage/<who>.*; calls the project's own app makes at runtime (the app logs those itself); Codex's own token use (logged by master-codex)."]
    return "\n".join(md) + "\n"


def to_json(r):
    return {k: (dict(v) if isinstance(v, C) else v) for k, v in r.items()}


def read_rows(fpath):
    out = []
    if not os.path.exists(fpath):
        return out
    for line in open(fpath, errors="ignore"):
        try:
            r = json.loads(line)
        except ValueError:
            continue
        if isinstance(r, dict) and isinstance(r.get("who"), str):
            for k in ("services", "tokens", "details", "models"):
                r[k] = r.get(k) if isinstance(r.get(k), dict) else {}
            r["agent"] = str(r.get("agent", ""))
            out.append(r)
    return out


def read_rows_any(fpath):
    """Rows from the first version's plan/usage.jsonl, which had no who field."""
    out = []
    for line in open(fpath, errors="ignore"):
        try:
            r = json.loads(line)
        except ValueError:
            continue
        if isinstance(r, dict):
            for k in ("services", "tokens", "details", "models"):
                r[k] = r.get(k) if isinstance(r.get(k), dict) else {}
            r["agent"] = str(r.get("agent", ""))
            out.append(r)
    return out


machine = hashlib.sha1(socket.gethostname().encode()).hexdigest()[:8]
now = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


if not args.combine:
    rows = []
    for kd in key_dirs:
        for sess in glob.glob(os.path.join(kd, "*.jsonl")):
            rows.append(scan(sess, "main session"))
        for sub in glob.glob(os.path.join(kd, "*", "subagents", "agent-*.jsonl")):
            agent, meta = "subagent", sub[: -len(".jsonl")] + ".meta.json"
            if os.path.exists(meta):
                try:
                    md_ = json.load(open(meta))
                    agent = f"{md_.get('agentType', 'subagent')}: {md_.get('description', '')}"
                except ValueError:
                    pass
            rows.append(scan(sub, agent))
    fresh = [dict(to_json(r), who=who, who_raw=who_raw, machine=machine, generated_at=now) for r in rows]
    path = os.path.join(usage_dir, f"{who}.jsonl")
    existing = read_rows(path)
    legacy = os.path.join(plan, "usage.jsonl")  # ledger written by the first version of this script
    if os.path.exists(legacy):
        existing += [dict(r, who=who, who_raw=who_raw) for r in read_rows_any(legacy)]
    # rows written before who_raw existed count as owned by their stored name
    other_names = {str(r.get("who_raw") or r["who"]) for r in existing
                   if str(r.get("who_raw") or r["who"]) != who_raw}
    if other_names:
        raise SystemExit(f"{path} holds runs for {', '.join(sorted(other_names))}; pass a different --who")
    merged = {}
    for r in existing:
        r["machine"] = r.get("machine") or machine  # rows from before machine tags belong to this machine
        r["generated_at"] = r.get("generated_at") or r.get("last") or None
        merged[(r["machine"], r.get("file"))] = r
    merged.update({(r["machine"], r["file"]): r for r in fresh})
    rows = sorted(merged.values(), key=lambda r: r.get("first") or "")
    tmp = f"{path}.{os.getpid()}.tmp"
    with open(tmp, "w") as f:
        for r in rows:
            f.write(json.dumps(r) + "\n")
    os.replace(tmp, path)
    if os.path.exists(legacy):
        os.replace(legacy, legacy + ".imported")
    with open(os.path.join(usage_dir, f"{who}.md"), "w") as f:
        f.write(render(rows, f"Usage ledger: {who}", team=False))
    print(f"{len(fresh)} runs seen on this machine, {len(rows)} recorded for {who} -> {os.path.join(usage_dir, who + '.md')}")

everyone = []
for fpath in sorted(glob.glob(os.path.join(usage_dir, "*.jsonl"))):
    everyone += read_rows(fpath)
with open(os.path.join(plan, "usage.md"), "w") as f:
    f.write(render(everyone, "Usage ledger (everyone)", team=True))
n_people = len({r["who"] for r in everyone})
print(f"summary: {len(everyone)} runs across {n_people} {'person' if n_people == 1 else 'people'} -> {os.path.join(plan, 'usage.md')}")
