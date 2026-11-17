import { describe, expect, it } from "vitest";
import { citationsIn, FOLLOW_MIN_SCORE, namedSources } from "../src/engine/citations.ts";
import { toPlain } from "../src/engine/walk.ts";
import { loadRules } from "../src/rules/index.ts";

const rules = loadRules();
const atoms = {
  number: { raw: "14", canonical: "14" }, unit: "times", subjectLemma: "penguins",
  population: null, time: null, hedge: null, namedSource: null, variants: ["14 times"],
};
const page = "https://news.example/story";

// Builds a page, finds the span sentence in it, and returns the citations.
function cite(markdown: string, spanText = "Penguins nap 14 times a day.") {
  const { text, links } = toPlain(markdown);
  const start = text.indexOf(spanText);
  if (start < 0) throw new Error("span not in page");
  return citationsIn({ text, links, pageUrl: page, span: { start, end: start + spanText.length }, atoms, rules });
}
const padding = `${"Unrelated words about the zoo shop and parking. ".repeat(6).trim()} `;

describe("citationsIn", () => {
  it("scores a link beside the span as near, and keeps it", () => {
    const [c] = cite("Penguins nap 14 times a day. See [the keepers' log](https://zoo.example/log).");
    expect(c).toMatchObject({ url: "https://zoo.example/log", near: true, kind: "link" });
    expect(c!.score).toBeGreaterThanOrEqual(FOLLOW_MIN_SCORE);
  });

  it("keeps a far link whose own context states the claim's number and subject", () => {
    const cites = cite(`Penguins nap 14 times a day. ${padding}An earlier survey said penguins nap 14 times daily, see [the survey](https://survey.example/2010).`);
    const far = cites.find((c) => c.url === "https://survey.example/2010");
    expect(far).toMatchObject({ near: false });
    expect(far!.score).toBeGreaterThanOrEqual(FOLLOW_MIN_SCORE);
  });

  it("drops a far link with nothing about the claim around it, such as a menu link", () => {
    const cites = cite(`[Shop](https://zoo.example/shop) ${padding}Penguins nap 14 times a day.`);
    expect(cites.map((c) => c.url)).not.toContain("https://zoo.example/shop");
  });

  it("finds a DOI and a PubMed id written as text beside the span, and scores them as scholarly", () => {
    const cites = cite("Penguins nap 14 times a day (doi:10.1234/zoo.5678; PMID: 31234567).", "Penguins nap 14 times a day");
    expect(cites.map((c) => [c.url, c.kind])).toEqual([
      ["https://doi.org/10.1234/zoo.5678", "doi"],
      ["https://pubmed.ncbi.nlm.nih.gov/31234567", "pmid"],
    ]);
    expect(cites.every((c) => c.near && c.score > cite("Penguins nap 14 times a day. See [x](https://zoo.example/x).")[0]!.score)).toBe(true);
  });

  it("never follows share buttons, mail links or the page itself", () => {
    const cites = cite("Penguins nap 14 times a day. [Share](https://twitter.com/intent/tweet?u=1) [Mail](mailto:a@zoo.example) [Here](https://news.example/story#top) [Post](https://www.facebook.com/sharer/sharer.php?u=1)");
    expect(cites).toEqual([]);
  });

  it("orders citations best first and lists each url once", () => {
    const cites = cite("Penguins nap 14 times a day, per [a page](https://a.example/p) and [a paper](https://doi.org/10.1/x) and [a page](https://a.example/p).", "Penguins nap 14 times a day");
    expect(cites.map((c) => c.url)).toEqual(["https://doi.org/10.1/x", "https://a.example/p"]);
  });

  it("skips fact-check domains", () => {
    expect(cite("Penguins nap 14 times a day. [Check](https://www.snopes.com/fact-check/penguins).")).toEqual([]);
  });
});

describe("namedSources", () => {
  it("reads the source named after 'according to', 'a study by' and similar", () => {
    expect(namedSources("According to the Harbor Zoo Annual Report, penguins nap 14 times a day.")).toEqual(["Harbor Zoo Annual Report"]);
    expect(namedSources("A study by Coastal University found penguins nap 14 times a day.")).toEqual(["Coastal University"]);
    expect(namedSources("Data from the National Penguin Survey of 2010 show it.")).toEqual(["National Penguin Survey of 2010"]);
  });

  it("returns nothing when no capitalised name follows", () => {
    expect(namedSources("According to some people, penguins nap 14 times a day.")).toEqual([]);
    expect(namedSources("Penguins nap 14 times a day.")).toEqual([]);
  });
});
