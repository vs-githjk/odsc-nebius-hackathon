import { describe, expect, it } from "vitest";
import { publicationDate } from "../src/engine/publication.ts";

// The metadata path's teaser gap (XO's probe on #285, case 11): a <meta itemprop="datePublished"> inside a related
// block backdated the page through publicationDate, before the byline rule ever ran. A meta date inside a teaser block,
// or nav, aside, header or footer, must not count; and a page holding more than one datePublished is ambiguous.
const page = (body: string, head = "") => `<!doctype html><html><head><title>Story</title>${head}</head><body>${body}</body></html>`;
const OLD = '<meta itemprop="datePublished" content="2009-03-01">';
const REAL = '<meta itemprop="datePublished" content="2020-06-09">';

describe("meta dates inside teaser blocks do not count", () => {
  it("case 11: a datePublished meta inside div.related gives no date", () => {
    expect(publicationDate(page(`<article><p>Posted June 9 2020</p></article><div class="related">${OLD}</div>`))).toBeNull();
  });

  for (const cls of ["related", "more", "popular", "latest", "recommend", "teaser", "sidebar", "widget"]) {
    it(`inside .${cls}`, () => expect(publicationDate(page(`<article><p>Story</p><div class="${cls}">${OLD}</div></article>`))).toBeNull());
    it(`inside #${cls}`, () => expect(publicationDate(page(`<div id="${cls}">${OLD}</div>`))).toBeNull());
  }
  for (const tag of ["nav", "aside", "header", "footer"]) {
    it(`inside ${tag}`, () => expect(publicationDate(page(`<article><p>Story</p></article><${tag}>${OLD}</${tag}>`))).toBeNull());
  }

  it("any meta date name counts as a meta date: citation_date and DC.date inside a teaser block are ignored too", () => {
    expect(publicationDate(page(`<div class="related"><meta name="citation_date" content="2009-03-01"></div>`))).toBeNull();
    expect(publicationDate(page(`<footer><meta name="DC.date" content="2009-03-01"></footer>`))).toBeNull();
    expect(publicationDate(page(`<aside><meta property="article:published_time" content="2009-03-01"></aside>`))).toBeNull();
  });

  it("a meta inside a comment or a script is not read at all", () => {
    expect(publicationDate(page(`<!-- <meta name="citation_date" content="1990-01-01"> -->`))).toBeNull();
    expect(publicationDate(page(`<script>document.write('<meta name="citation_date" content="1990-01-01">')</script>`))).toBeNull();
  });
});

describe("a page with more than one datePublished is ambiguous", () => {
  it("two datePublished metas outside any teaser block give no date", () => {
    expect(publicationDate(page(`<article>${REAL}</article><div>${OLD}</div>`))).toBeNull();
  });
  it("a datePublished meta beside a datePublished time gives no date", () => {
    expect(publicationDate(page(`<article>${REAL}<time itemprop="datePublished" datetime="2009-03-01">March 1</time></article>`))).toBeNull();
  });
  it("a datePublished meta beside an RDFa datePublished gives no date", () => {
    expect(publicationDate(page(`<article>${REAL}<span property="datePublished">2009-03-01</span></article>`))).toBeNull();
  });
});

describe("what must keep working", () => {
  it("a head article:published_time still wins, even with a teaser meta in the body", () => {
    expect(publicationDate(page(`<div class="related">${OLD}</div>`, '<meta property="article:published_time" content="2020-06-09T08:00:00Z">'))).toBe("2020-06-09T08:00:00Z");
  });
  it("N02: JSON-LD datePublished still returns the page's date beside a teaser meta", () => {
    const ld = '<script type="application/ld+json">{"@type":"NewsArticle","datePublished":"2020-06-09"}</script>';
    expect(publicationDate(page(`<div class="related">${OLD}</div>`, ld))).toBe("2020-06-09");
  });
  it("a single body microdata datePublished on the page's own item still counts", () => {
    expect(publicationDate(page(`<article itemscope itemtype="https://schema.org/NewsArticle"><h1>Story</h1>${REAL}</article>`))).toBe("2020-06-09");
  });
  it("head citation and DC tags still count", () => {
    expect(publicationDate(page("<p>x</p>", '<meta name="citation_publication_date" content="2004/06/15">'))).toBe("2004-06-15");
    expect(publicationDate(page("<p>x</p>", '<meta name="DC.date" content="2001-02-03">'))).toBe("2001-02-03");
  });
});
