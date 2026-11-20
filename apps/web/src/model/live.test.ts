import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { Trace } from "pz/schema";
import { challengeTraces, pausedMessage, liveAction, liveAvailability, liveMode, liveStageLabel, liveStatus, streamTrace, type LiveProgress } from "./live.ts";
const recorded = Trace.parse(JSON.parse(readFileSync("eval/dev-traces/dev-13.json", "utf8")));
describe("live client", () => {
  it("names reading during the active walk without renaming the later spans stage", () => {
    expect(liveStageLabel("intake", "intake", 0)).toBe("Starting");
    expect(liveStageLabel("walk", "walk", 0)).toBe("Searching");
    expect(liveStageLabel("walk", "walk", 2)).toBe("Searching and reading pages");
    expect(liveStageLabel("walk", "spans", 2)).toBe("Searching");
    expect(liveStageLabel("spans", "walk", 2)).toBe("Matching sentences across pages");
    expect(liveStageLabel("spans", "spans", 2)).toBe("Matching sentences across pages");
  });
  it("reads page counts, ignores future events and filters non-host data", async () => {
    const updates: LiveProgress[] = [];
    const lines = [{ type: "future", payload: "ignored" }, { type: "stage", stage: "future", status: "started" },
      { type: "progress", pages: 3, hosts: ["a.example", "https://bad.example/?key=secret", "b.example"] },
      { type: "progress", pages: -1, hosts: [] }, { type: "stage", stage: "walk", status: "completed" }, { type: "trace", trace: recorded }];
    const fake: typeof fetch = async () => new Response(lines.map(line => JSON.stringify(line)).join("\n"));
    await streamTrace("claim", new AbortController().signal, event => updates.push(event), fake);
    expect(updates).toEqual([{ type: "progress", pages: 3, hosts: ["a.example", "b.example"] }, { type: "stage", stage: "walk", status: "completed" }]);
  });
  it.each([[429, "rate_limit", "Too many traces"], [503, "cap", "budget"], [503, "disabled", "paused"], [503, "trace_failed", "could not finish"]])("handles %s %s", async (status, code, message) => {
    const fake: typeof fetch = async () => Response.json({ code, message: "untrusted server text" }, { status: Number(status) });
    await expect(streamTrace("claim", new AbortController().signal, () => {}, fake)).rejects.toThrow(String(message));
  });
  it("retains the status reason and handles a streamed time limit", async () => {
    expect(await liveAvailability(async () => Response.json({ live: false, reason: "cap" }))).toEqual({ mode: "paused", reason: "cap" });
    await expect(streamTrace("claim", new AbortController().signal, () => {}, async () => new Response('{"type":"error","code":"time_limit"}\n'))).rejects.toThrow("time limit");
  });
  it("passes cancellation to the transport", async () => {
    const controller = new AbortController();
    const fake: typeof fetch = async (_url, init) => {
      expect(init?.signal).toBe(controller.signal);
      controller.abort(); init?.signal?.throwIfAborted();
      return new Response();
    };
    await expect(streamTrace("claim", controller.signal, () => {}, fake)).rejects.toMatchObject({ name: "AbortError" });
  });
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
    const labels: LiveProgress[] = [];
    const fake: typeof fetch = async () => new Response(new ReadableStream({ start(c) { for (let i = 0; i < text.length; i += 71) c.enqueue(new TextEncoder().encode(text.slice(i, i + 71))); c.close(); } }));
    const result = await streamTrace("claim", new AbortController().signal, label => labels.push(label), fake);
    expect(result.id).toBe(recorded.id); expect(labels).toEqual([{ type: "stage", stage: "walk", status: "started" }]);
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
  it.each(["cap", "disabled", "not_configured"])("keeps the paused status reason %s for the claim note", async reason => {
    const status = await liveAvailability(async () => Response.json({ live: false, reason }));
    expect(status).toEqual({ mode: "paused", reason });
    expect(pausedMessage(status.mode, status.reason)).toBe(reason === "cap"
      ? "Live tracing is paused: this demo's budget for live searches is used up. Every recorded trace still opens free."
      : "Live tracing is paused for now. Every recorded trace still opens free.");
  });
  it("says nothing about live when the server is absent or live is available", () => {
    expect(pausedMessage("absent", "cap")).toBeNull();
    expect(pausedMessage("live")).toBeNull();
  });
  it("live, paused for any reason, or absent when there is no live server (the Pages site)", async () => {
    expect(await liveMode(async () => Response.json({ live: true }))).toBe("live");
    expect(await liveMode(async () => Response.json({ live: false, reason: "cap" }))).toBe("paused");
    expect(await liveMode(async () => Response.json({ live: false, reason: "disabled" }))).toBe("paused");
    expect(await liveMode(async () => { throw new Error("offline"); })).toBe("absent");
    expect(await liveMode(async () => new Response("<html>"))).toBe("absent");
    expect(await liveMode(async () => new Response("not found", { status: 404 }))).toBe("absent");
  });
});
