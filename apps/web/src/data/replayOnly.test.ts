import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// The public build (GitHub Pages, .github/workflows/pages.yml) must be replay-only: it shows committed traces and
// never calls Tavily, Token Factory or anything else, and holds no keys. These checks keep the app's own code that way.
const src = fileURLToPath(new URL("../", import.meta.url));
const files = readdirSync(src, { recursive: true, encoding: "utf8" })
  .filter((f) => /\.(ts|tsx)$/.test(f) && !/\.test\.tsx?$/.test(f))
  .map((f) => ({ f, text: readFileSync(join(src, f), "utf8") }));

describe("replay-only web app", () => {
  it("has app code to check", () => {
    expect(files.length).toBeGreaterThan(10);
  });

  it("makes no network calls of its own", () => {
    const calls = /\bfetch\s*\(|XMLHttpRequest|new\s+WebSocket|EventSource|sendBeacon|navigator\.connection/;
    expect(files.filter(({ text }) => calls.test(text)).map(({ f }) => f)).toEqual([]);
  });

  it("reads no environment and no keys", () => {
    const env = /import\.meta\.env|process\.env|API_KEY|NEBIUS|TAVILY/;
    expect(files.filter(({ text }) => env.test(text)).map(({ f }) => f)).toEqual([]);
  });

  it("imports only the engine's schema and headline, never its clients or pipeline", () => {
    const imports = files.flatMap(({ text }) => [...text.matchAll(/from\s+"(pz[^"]*)"/g)].map((m) => m[1]!));
    expect([...new Set(imports)].sort()).toEqual(["pz/headline", "pz/schema"]);
  });

  it("loads nothing from another site: no outside URL in index.html or the styles (src, href, @import, url())", () => {
    const web = fileURLToPath(new URL("../../", import.meta.url));
    const styles = readdirSync(join(web, "src/styles")).filter((f) => f.endsWith(".css")).map((f) => join("src/styles", f));
    const outside = /(?:\bsrc|\bhref)\s*=\s*["']https?:|@import\s+(?:url\()?["']?https?:|url\(\s*["']?https?:/i;
    const hits = ["index.html", ...styles].filter((f) => outside.test(readFileSync(join(web, f), "utf8")));
    expect(hits).toEqual([]);
  });
});
