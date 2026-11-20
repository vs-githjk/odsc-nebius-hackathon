import { describe, expect, it, vi } from "vitest";
import { arrive, backTarget, focusHeading } from "./navigation.ts";

describe("route experience", () => {
  it("restores an explicit return and opens new results at the top, once per route", () => {
    const state = { current: "#/traces", scroll: 720, positions: new Map<string, number>(), origins: new Map<string, string>(), restore: "" };
    expect(arrive("#/t/one", state)).toBe(0);
    expect(state.origins.get("#/t/one")).toBe("#/traces");
    expect(arrive("#/t/one", state)).toBeNull();
    state.scroll = 200;
    state.restore = "#/traces";
    expect(arrive("#/traces", state)).toBe(720);
    expect(state.restore).toBe("");
    expect(arrive("#/t/two", state)).toBe(0);
  });
  it.each(["#/", "#/t/live"])("a fresh live result from %s discards a pending restoration", (current) => {
    const state = { current, scroll: 900, positions: new Map([["#/t/live", 900]]), origins: new Map<string, string>(), restore: "#/t/live" };
    expect(arrive("#/t/live", state, true)).toBe(0);
    expect(state.restore).toBe("");
    expect(state.scroll).toBe(0);
    expect(arrive("#/t/live", state)).toBeNull();
  });
  it("returns to the previous hash including future list routes and trace routes", () => {
    for (const previous of ["#/", "#/traces", "#/how", "#/t/one"]) {
      expect(backTarget(previous, "#/t/two")).toBe(previous);
    }
    for (const previous of ["", "https://example.test", "#/t/two"]) {
      expect(backTarget(previous, "#/t/two")).toBe("#/");
    }
  });
  it("makes the main heading focusable without changing restored scroll", () => {
    const heading = { tabIndex: 0, focus: vi.fn() };
    const querySelector = vi.fn().mockReturnValue(heading);
    focusHeading({ querySelector });
    expect(querySelector).toHaveBeenCalledWith("main h1");
    expect(heading.tabIndex).toBe(-1);
    expect(heading.focus).toHaveBeenCalledWith({ preventScroll: true });
    expect(() => focusHeading({ querySelector: vi.fn().mockReturnValue(null) })).not.toThrow();
  });
});
