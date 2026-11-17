import { describe, expect, it } from "vitest";
import { dateEvidence } from "../src/engine/dating.ts";
import { fetchPublication, isPublicPage, publicationDate } from "../src/engine/publication.ts";

const head = (...tags: string[]) => `<html><head><title>x</title>${tags.join("\n")}</head><body>The 10,000 steps claim.</body></html>`;

describe("publicationDate reads only what the page declares about itself", () => {
  it("reads citation_publication_date and turns 2004/06/15 into the same day", () => {
    expect(publicationDate(head('<meta name="citation_publication_date" content="2004/06/15">'))).toBe("2004-06-15");
  });
  it("reads article:published_time whatever the attribute order, and DC.date", () => {
    expect(publicationDate(head('<meta content="2012-03-04T10:00:00Z" property="article:published_time">'))).toBe("2012-03-04T10:00:00Z");
    expect(publicationDate(head("<meta name='DC.date' content='2001-02-03'>"))).toBe("2001-02-03");
  });
  it("reads JSON-LD datePublished, including inside @graph", () => {
    const ld = '<script type="application/ld+json">{"@graph":[{"@type":"Article","datePublished":"2010-05-06"}]}</script>';
    expect(publicationDate(head(ld))).toBe("2010-05-06");
  });
  it("prefers the scholarly tag, takes no date from the body, and never picks the older of two", () => {
    expect(publicationDate(head('<meta name="article:published_time" content="1999-01-01">', '<meta name="citation_publication_date" content="2004/06/15">'))).toBe("2004-06-15");
    expect(publicationDate("<html><body>Published 1990-01-01</body></html>")).toBeNull();
  });
  it("ignores broken JSON-LD and meta tags with no content", () => {
    expect(publicationDate(head('<script type="application/ld+json">{oops</script>', '<meta name="citation_date">'))).toBeNull();
  });
  it("hands #79's dating the value unchanged: a partial date stays unconfirmed, a later date is capped by the capture", () => {
    const capture = { status: "found" as const, firstCapture: "2020-06-24", timestamp: "20200624000000" };
    expect(dateEvidence({ metadata: publicationDate(head('<meta name="citation_publication_date" content="2004/06/15">')) }, capture))
      .toMatchObject({ kind: "published", value: "2004-06-15", source: "metadata" });
    expect(dateEvidence({ metadata: publicationDate(head('<meta name="citation_publication_date" content="2004/06">')) }, { status: "none" }))
      .toMatchObject({ kind: "unconfirmed", value: null });
    expect(dateEvidence({ metadata: "2023-01-01" }, capture)).toMatchObject({ kind: "existed_by", value: "2020-06-24", conflictingDate: true });
  });
});

describe("fetchPublication", () => {
  it("only fetches public http(s) pages", () => {
    for (const url of ["https://pubmed.ncbi.nlm.nih.gov/1/", "http://news.example/a"]) expect(isPublicPage(url)).toBe(true);
    for (const url of ["file:///etc/passwd", "http://localhost/x", "http://127.0.0.1/x", "http://169.254.169.254/latest", "http://[::1]/x", "http://intranet/x", "ftp://a.example/x"]) expect(isPublicPage(url)).toBe(false);
  });
  it("returns null for a failed, non-HTML or errored fetch and never calls out for a private address", async () => {
    let calls = 0;
    const html = (body: string, type = "text/html") => (async () => { calls++; return new Response(body, { headers: { "content-type": type } }); }) as unknown as typeof fetch;
    expect(await fetchPublication("https://a.example/x", html(head('<meta name="citation_date" content="2004/06/15">')))).toBe("2004-06-15");
    expect(await fetchPublication("https://a.example/x", html("{}", "application/json"))).toBeNull();
    expect(await fetchPublication("https://a.example/x", (async () => { throw new Error("down"); }) as typeof fetch)).toBeNull();
    const before = calls;
    expect(await fetchPublication("http://127.0.0.1/x", html("x"))).toBeNull();
    expect(calls).toBe(before);
  });
});
