import { describe, expect, it, vi } from "vitest";
import { closeDetails, scrubberKey } from "./traceKeyboard.ts";

describe("scrubber keyboard", () => {
  it("moves left toward older pages, right toward newer pages, and clamps at either end", () => {
    expect(scrubberKey("ArrowLeft", 1, 3)).toBe(2);
    expect(scrubberKey("ArrowRight", 1, 3)).toBe(0);
    expect(scrubberKey("ArrowLeft", 3, 3)).toBe(3);
    expect(scrubberKey("ArrowRight", 0, 3)).toBe(0);
  });
  it("Home selects the oldest and End the newest, including a single page", () => {
    expect(scrubberKey("Home", 1, 3)).toBe(3);
    expect(scrubberKey("End", 1, 3)).toBe(0);
    expect(scrubberKey("Home", 0, 0)).toBe(0);
    expect(scrubberKey("End", 0, 0)).toBe(0);
    expect(scrubberKey("Tab", 1, 3)).toBeNull();
    expect(scrubberKey("constructor", 1, 3)).toBeNull();
    expect(scrubberKey("__proto__", 1, 3)).toBeNull();
  });
});

describe("details keyboard", () => {
  it("Escape closes the nearest open disclosure and returns focus to its direct summary", () => {
    const summary = { focus: vi.fn() };
    const details = { open: true, querySelector: vi.fn().mockReturnValue(summary) };
    const closest = vi.fn().mockReturnValue(details);
    const event = { key: "Escape", target: { closest } as unknown as Element, preventDefault: vi.fn(), stopPropagation: vi.fn() };
    closeDetails(event);
    expect(closest).toHaveBeenCalledWith("details[open]");
    expect(details.querySelector).toHaveBeenCalledWith(":scope > summary");
    expect(details.open).toBe(false);
    expect(summary.focus).toHaveBeenCalledWith({ preventScroll: true });
    expect(event.preventDefault).toHaveBeenCalled();
    expect(event.stopPropagation).toHaveBeenCalled();
  });
  it("does not consume Escape if there is no direct summary to return focus to", () => {
    const details = { open: true, querySelector: vi.fn().mockReturnValue(null) };
    const event = { key: "Escape", target: { closest: () => details } as unknown as Element, preventDefault: vi.fn(), stopPropagation: vi.fn() };
    closeDetails(event);
    expect(details.open).toBe(true);
    expect(event.preventDefault).not.toHaveBeenCalled();
  });
  it("leaves other keys and Escape outside an open disclosure alone", () => {
    const closest = vi.fn().mockReturnValue(null);
    const event = { key: "Enter", target: { closest } as unknown as Element, preventDefault: vi.fn(), stopPropagation: vi.fn() };
    closeDetails(event);
    expect(closest).not.toHaveBeenCalled();
    closeDetails({ ...event, key: "Escape" });
    expect(event.preventDefault).not.toHaveBeenCalled();
  });
});
