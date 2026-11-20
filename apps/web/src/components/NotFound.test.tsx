import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, describe, expect, it } from "vitest";
import { loadTraces } from "../data/loadTraces.ts";
import { shownAddress } from "./NotFound.tsx";

beforeAll(() => {
  (globalThis as { window?: unknown }).window = { matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }), location: { hash: "" } };
});

describe("not found (#257 item 9)", () => {
  it("an unknown trace id gets a not-found page with ways back, not a bare error", async () => {
    const { TraceRoute } = await import("../App.tsx");
    const { traces } = loadTraces();
    const html = renderToStaticMarkup(<TraceRoute id="dev-99" matched={false} all={traces} />);
    expect(html).toContain("No trace at this address");
    expect(html).toContain("<code>dev-99</code>");
    expect(html).toContain('href="#/traces"');
    expect(html).toContain('href="#/"');
    expect(html).not.toContain("trace-page");
  });

  it("a known trace still opens", async () => {
    const { TraceRoute } = await import("../App.tsx");
    const { traces } = loadTraces();
    expect(renderToStaticMarkup(<TraceRoute id="dev-10" matched={false} all={traces} />)).not.toContain("No trace at this address");
  });

  it("shows the address decoded, cut short, and survives a malformed escape", () => {
    expect(shownAddress("#/t/a%20b")).toBe("#/t/a b");
    expect(shownAddress("#/t/%E0")).toBe("#/t/%E0");
    expect(shownAddress(`#/${"x".repeat(200)}`)).toHaveLength(80);
  });
});
