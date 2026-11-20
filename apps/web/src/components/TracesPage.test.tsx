import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { loadTraces } from "../data/loadTraces.ts";
import { TracesPage } from "./TracesPage.tsx";

describe("the traces list's ending counts (XO on #307)", () => {
  const { traces, errors } = loadTraces();
  const html = renderToStaticMarkup(<TracesPage traces={traces} errors={errors} />);
  const recorded = traces.filter((t) => !t.synthetic);
  const count = (label: string) => new RegExp(`${label} <span class="tl-count">(\\d+)</span>`).exec(html)?.[1];

  it("counts recorded runs only, so the invented example does not inflate Origin found", () => {
    const realOrigins = recorded.filter((t) => t.decision.state === "ORIGIN_FOUND").length;
    expect(count("Origin found")).toBe(String(realOrigins));
    expect(count("All")).toBe(String(recorded.length));
  });
  it("still offers every ending as a filter, so the examples can be found", () => {
    for (const t of traces.filter((x) => x.synthetic)) expect(html).toContain('name="tl-ending"');
    expect(html).toContain("A search service failed");
  });
});
