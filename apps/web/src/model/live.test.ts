import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { Trace } from "pz/schema";
import { challengeTraces, liveAction, liveMode, liveStatus, streamTrace } from "./live.ts";
const recorded = Trace.parse(JSON.parse(readFileSync("eval/dev-traces/dev-13.json", "utf8")));
describe("live client", () => {
  it("uses recorded matches before live, and offers live only when enabled", () => {
    expect(liveAction(recorded.claim.text, [recorded], true)).toBe("replay");
    expect(liveAction("Factories produce 42 new widgets each day.", [], true)).toBe("live");
    expect(liveAction("Factories produce 42 new widgets each day.", [], false)).toBe("off");
    expect(liveAction("", [], true)).toBe("off");
  });
  it("silently disables live for unreachable or invalid status", async () => {
    expect(await liveStatus(async () => { throw new Error("offline"); })).toBe(false);
    expect(await liveStatus(async () => new Response("<html>"))).toBe(false);
    expect(await liveStatus(async () => Response.json({ live: true }))).toBe(true);
    expect(await liveStatus(async () => Response.json({ live: false, reason: "cap" }))).toBe(false);
  });
  it("reads split NDJSON chunks and displays stage labels", async () => {
    const text = JSON.stringify({ type: "stage", stage: "walk", status: "started" }) + "\n" + JSON.stringify({ type: "trace", trace: recorded }) + "\n";
    const labels: string[] = [];
    const fake: typeof fetch = async () => new Response(new ReadableStream({ start(c) { for (let i = 0; i < text.length; i += 71) c.enqueue(new TextEncoder().encode(text.slice(i, i + 71))); c.close(); } }));
    const result = await streamTrace("claim", new AbortController().signal, label => labels.push(label), fake);
    expect(result.id).toBe(recorded.id); expect(labels).toEqual(["Searching"]);
  });
  it("does not display arbitrary server errors or accept a truncated stream", async () => {
    await expect(streamTrace("claim", new AbortController().signal, () => {}, async () => new Response('{"type":"error","message":"untrusted"}\n'))).rejects.toThrow("The trace could not finish.");
    await expect(streamTrace("claim", new AbortController().signal, () => {}, async () => new Response(""))).rejects.toThrow("The trace could not finish.");
  });
  it("picks free challenge recordings including cold and variant cases", () => {
    const all = readdirSync("eval/dev-traces").filter(name => /^dev-\d+\.json$/.test(name))
      .map(name => Trace.parse(JSON.parse(readFileSync(`eval/dev-traces/${name}`, "utf8"))));
    const choices = challengeTraces(all);
    expect(choices.length).toBeGreaterThanOrEqual(3); expect(choices.length).toBeLessThanOrEqual(5);
    expect(choices.some(t => t.decision.state === "TRAIL_GOES_COLD")).toBe(true);
    expect(choices.some(t => (t.otherNumbers?.length ?? 0) > 0)).toBe(true);
    expect(choices.every(t => !t.synthetic)).toBe(true);
  });
});

describe("liveMode: paused is said only when a live server says so", () => {
  it("live, paused for any reason, or absent when there is no live server (the Pages site)", async () => {
    expect(await liveMode(async () => Response.json({ live: true }))).toBe("live");
    expect(await liveMode(async () => Response.json({ live: false, reason: "cap" }))).toBe("paused");
    expect(await liveMode(async () => Response.json({ live: false, reason: "disabled" }))).toBe("paused");
    expect(await liveMode(async () => { throw new Error("offline"); })).toBe("absent");
    expect(await liveMode(async () => new Response("<html>"))).toBe("absent");
    expect(await liveMode(async () => new Response("not found", { status: 404 }))).toBe("absent");
  });
});
