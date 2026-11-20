import { describe, expect, it } from "vitest";
import { parseRoute } from "./route.ts";

describe("parseRoute", () => {
  it("reads the start and trace routes", () => {
    expect(parseRoute("")).toEqual({ name: "start" });
    expect(parseRoute("#/")).toEqual({ name: "start" });
    expect(parseRoute("#/t/sample-rich")).toEqual({ name: "trace", id: "sample-rich" });
    expect(parseRoute("#/t/a%20b")).toEqual({ name: "trace", id: "a b" });
  });

  it("reads the answer check page and one statistic's trace", () => {
    expect(parseRoute("#/answer")).toEqual({ name: "answer", n: null });
    expect(parseRoute("#/answer/2")).toEqual({ name: "answer", n: 2 });
    expect(parseRoute("#/answer/0")).toEqual({ name: "notFound", hash: "#/answer/0" });
    expect(parseRoute("#/answer/x")).toEqual({ name: "notFound", hash: "#/answer/x" });
  });

  it("a malformed escape is a not-found page instead of throwing", () => {
    expect(() => parseRoute("#/t/%E0")).not.toThrow();
    expect(parseRoute("#/t/%E0")).toEqual({ name: "notFound", hash: "#/t/%E0" });
  });

  it("an unknown address is a not-found page, not the start page", () => {
    expect(parseRoute("#")).toEqual({ name: "start" });
    expect(parseRoute("#/nope")).toEqual({ name: "notFound", hash: "#/nope" });
    expect(parseRoute("#/t/")).toEqual({ name: "notFound", hash: "#/t/" });
    expect(parseRoute("#/how/extra")).toEqual({ name: "notFound", hash: "#/how/extra" });
  });
});
