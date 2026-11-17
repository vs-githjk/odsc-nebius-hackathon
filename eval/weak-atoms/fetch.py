"""Fetch the E2 dev claims' pages (seenAt, tracedOrigin, tracedBy) into .cache/weak-atoms as plain text.

Full page text stays in the git-ignored .cache/; only short candidate sentences are committed (labels.json).
Run from the repo root: python3 -I eval/weak-atoms/fetch.py
With --set=e3 it fetches the E3 check claims' pages into .cache/weak-atoms-e3 instead (T97 E3 check; E3 is never
tuned on, so the pages are only used to check a cutoff already set on E2).
"""
import hashlib, html.parser, json, pathlib, re, subprocess, sys

E3 = "--set=e3" in sys.argv[1:]
CLAIMS = json.loads(pathlib.Path("eval/dev-claims-e3.json" if E3 else "eval/dev-claims.json").read_text(encoding="utf-8"))
OUT = pathlib.Path(".cache/weak-atoms-e3" if E3 else ".cache/weak-atoms")
OUT.mkdir(parents=True, exist_ok=True)
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 Chrome/130 Safari/537.36"

class Text(html.parser.HTMLParser):
    def __init__(self):
        super().__init__(); self.out = []; self.skip = 0
    def handle_starttag(self, tag, attrs):
        if tag in ("script", "style", "noscript", "svg"): self.skip += 1
        if tag in ("p", "br", "div", "li", "h1", "h2", "h3", "h4", "tr", "td", "section", "article"): self.out.append("\n")
    def handle_endtag(self, tag):
        if tag in ("script", "style", "noscript", "svg") and self.skip: self.skip -= 1
    def handle_data(self, data):
        if not self.skip: self.out.append(data)

def to_text(raw: bytes, url: str) -> str:
    if raw[:4] == b"%PDF":
        return ""   # no PDF extractor on this machine; listed as "pdf" in index.json
    p = Text(); p.feed(raw.decode("utf8", "replace")); return "".join(p.out)

index = {}
for c in CLAIMS:
    for field in ("seenAt", "tracedOrigin", "tracedBy"):
        url = c[field]
        if not url: continue
        key = hashlib.sha256(url.encode()).hexdigest()[:16]
        r = subprocess.run(["curl", "-s", "-L", "--max-time", "30", "-A", UA, "-w", "\n%{http_code}", url], capture_output=True)
        body, _, code = r.stdout.rpartition(b"\n")
        text = to_text(body, url) if code == b"200" else ""
        status = "pdf" if body[:4] == b"%PDF" else code.decode()
        (OUT / f"{key}.txt").write_text(text)
        index.setdefault(c["id"], []).append({"field": field, "url": url, "key": key, "status": status, "chars": len(text)})
        print(c["id"], field, status, len(text), url[:80], file=sys.stderr)
(OUT / "index.json").write_text(json.dumps(index, indent=2))
