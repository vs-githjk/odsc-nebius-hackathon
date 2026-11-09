import { describe, expect, it } from "vitest";
import { parseRoute } from "./route.ts";

describe("parseRoute", () => {
  it("reads the start and trace routes", () => {
    expect(parseRoute("")).toEqual({ name: "start" });
    expect(parseRoute("#/")).toEqual({ name: "start" });
    expect(parseRoute("#/t/sample-rich")).toEqual({ name: "trace", id: "sample-rich" });
    expect(parseRoute("#/t/a%20b")).toEqual({ name: "trace", id: "a b" });
  });

  it("a malformed escape falls back to the start route instead of throwing", () => {
    expect(() => parseRoute("#/t/%E0")).not.toThrow();
    expect(parseRoute("#/t/%E0")).toEqual({ name: "start" });
  });
});
