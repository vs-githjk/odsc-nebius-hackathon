import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, describe, expect, it } from "vitest";
import type { Trace } from "pz/schema";
import { loadTraces } from "../data/loadTraces.ts";
import { isPlainClick, matchedNote, outcomeOf, submitsOnKey } from "./claimBox.ts";

// XO on #184: the claim box's behaviours, each tested. jsdom is not on the plan.md allowlist, so each behaviour is a
// pure function the component calls, and the matched note is rendered on the server.
const { traces } = loadTraces();
const rich = traces.find((t) => t.id === "sample-rich")!;
const CLAIM = "Harbor Zoo penguins nap 14 times a day, twice as often as the zoo's seals";

beforeAll(() => {
  // TraceView reads prefers-reduced-motion; no DOM here.
  (globalThis as { window?: unknown }).window = { matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }), location: { hash: "" } };
});

describe("outcomeOf (one submit)", () => {
  it("opens a recorded trace, prompts in plain words, or says not traced yet", () => {
    expect(outcomeOf(CLAIM, traces, 0)).toEqual({ kind: "open", id: "sample-rich" });
    expect(outcomeOf("   ", traces, 0)).toEqual({ kind: "empty" });
    expect(outcomeOf("penguins nap a lot", traces, 0)).toMatchObject({ kind: "problem", try: 1 });
    expect(outcomeOf("Lightning strikes 8 million times a day", traces, 0)).toMatchObject({ kind: "untraced", try: 1 });
  });

  it("gives a repeated answer a new try, the key that makes the live region announce it again", () => {
    const first = outcomeOf("Lightning strikes 8 million times a day", traces, 0);
    const again = outcomeOf("Lightning strikes 8 million times a day", traces, first.kind === "untraced" ? first.try : 0);
    expect(again).toMatchObject({ kind: "untraced" });
    expect(again.kind === "untraced" && first.kind === "untraced" && again.try).not.toBe(first.kind === "untraced" && first.try);
  });
});

describe("submitsOnKey", () => {
  it("Enter submits; Shift+Enter and Enter while composing do not", () => {
    expect(submitsOnKey({ key: "Enter", shiftKey: false, isComposing: false })).toBe(true);
    expect(submitsOnKey({ key: "Enter", shiftKey: true, isComposing: false })).toBe(false);
    expect(submitsOnKey({ key: "Enter", shiftKey: false, isComposing: true })).toBe(false);
    expect(submitsOnKey({ key: "a", shiftKey: false, isComposing: false })).toBe(false);
  });
});

describe("isPlainClick ('Trace a claim')", () => {
  const plain = { metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, button: 0 };
  it("handles a plain left click, and leaves cmd, ctrl, shift, alt and middle clicks to the browser", () => {
    expect(isPlainClick(plain)).toBe(true);
    for (const k of ["metaKey", "ctrlKey", "shiftKey", "altKey"] as const) expect(isPlainClick({ ...plain, [k]: true })).toBe(false);
    expect(isPlainClick({ ...plain, button: 1 })).toBe(false);
  });
});

describe("the matched note", () => {
  it("never calls a sample recorded, and dates a recorded trace", () => {
    expect(matchedNote(rich)).toBe("Matched a sample trace: example data, not a recorded run.");
    const real: Trace = { ...rich, id: "live-x", synthetic: false, mode: "LIVE", recordedAt: "2026-11-17T23:05:00Z" };
    expect(matchedNote(real)).toBe("Matched a recorded trace, recorded November 17, 2026.");
  });

  it("shows on arrival from the claim box only, and a real trace's way back is plain 'Back'", async () => {
    const { TraceRoute } = await import("../App.tsx");
    const real: Trace = { ...rich, id: "live-x", synthetic: false, mode: "LIVE", recordedAt: "2026-11-17T23:05:00Z" };
    expect(renderToStaticMarkup(<TraceRoute id="sample-rich" matched all={traces} />)).toContain("Matched a sample trace");
    expect(renderToStaticMarkup(<TraceRoute id="sample-rich" matched={false} all={traces} />)).not.toContain("Matched a");
    const live = renderToStaticMarkup(<TraceRoute id="live-x" matched all={[real]} />);
    expect(live).toContain("Matched a recorded trace, recorded November 17, 2026.");
    expect(live).toContain('class="back" href="#/">Back</a>');
  });
});
