import { describe, expect, it } from "vitest";
import { dateEvidence } from "../src/engine/dating.ts";
import { createUsageLog } from "../src/usage/log.ts";
import { isPrivateAddress, crossrefDate, crossrefDated, ncbiDated, createEvidence, isPublicPage, looksLikeChallenge, ncbiDate, publicationDate, safeFetch } from "../src/engine/publication.ts";

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
  it("does not read publication attributes embedded in another attribute's value", () => {
    expect(publicationDate(head('<meta title=" name=\'citation_date\' content=\'1990-01-01\' ">'))).toBeNull();
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

describe("registry dates", () => {
  const ncbi = (pubdate: string, epubdate = "") => ({ result: { uids: ["1"], "1": { pubdate, epubdate } } });
  it("takes the earlier full NCBI date; a partial date becomes the last day of its period", () => {
    expect(ncbiDate(ncbi("2004 Jun 15", "2004 May 20"), "1")).toBe("2004-05-20");
    expect(ncbiDate(ncbi("2004 Jun"), "1")).toBe("2004-06-30");
    expect(ncbiDate(ncbi("2004"), "1")).toBe("2004-12-31");
    expect(ncbiDate(ncbi("2004 Jun", "2004 Feb 29"), "1")).toBe("2004-02-29");
    expect(ncbiDate(ncbi("2004 Spring"), "1")).toBeNull();
    expect(ncbiDate({}, "1")).toBeNull();
  });
  it("says how much of the date the registry gave, and keeps the last-day value for ordering", () => {
    expect(ncbiDated(ncbi("2020"), "1")).toEqual({ date: "2020-12-31", precision: "year" });
    expect(ncbiDated(ncbi("2020 Jun"), "1")).toEqual({ date: "2020-06-30", precision: "month" });
    expect(ncbiDated(ncbi("2020 Jun 15"), "1")).toEqual({ date: "2020-06-15", precision: "day" });
    expect(ncbiDated(ncbi("2020 Jun", "2020 Feb 29"), "1")).toEqual({ date: "2020-02-29", precision: "day" });
    expect(crossrefDated({ message: { issued: { "date-parts": [[2020]] } } })).toEqual({ date: "2020-12-31", precision: "year" });
    expect(crossrefDated({ message: { issued: { "date-parts": [[2020, 6]] } } })).toEqual({ date: "2020-06-30", precision: "month" });
    expect(crossrefDated({ message: { issued: { "date-parts": [[2020, 6, 9]] } } })).toEqual({ date: "2020-06-09", precision: "day" });
  });
  it("takes the earliest of print, online and issued from Crossref", () => {
    const work = { message: { "published-print": { "date-parts": [[2005, 3, 1]] }, "published-online": { "date-parts": [[2004, 11, 9]] }, issued: { "date-parts": [[2005]] } } };
    expect(crossrefDate(work)).toBe("2004-11-09");
    expect(crossrefDate({ message: { issued: { "date-parts": [[2005, 2]] } } })).toBe("2005-02-28");
    expect(crossrefDate({ message: { issued: { "date-parts": [[null]] } } })).toBeNull();
  });
});

describe("page fetching is public-only, logged and challenge-aware", () => {
  const html = (...tags: string[]) => `<html><head>${tags.join("")}</head><body>Article text</body></html>`;
  const cache = () => { const m = new Map(); return { get: (k: string) => m.get(k) ?? null, set: (k: string, v: unknown) => { m.set(k, v); } } as never; };
  const publicHost = async () => ["93.184.216.34"];
  function setup(routes: Record<string, () => Response>, resolve: (host: string) => Promise<string[]> = publicHost) {
    const urls: string[] = [];
    const inner = (async (input: string | URL | Request) => {
      const url = String(input);
      urls.push(url);
      const route = routes[url];
      if (!route) throw new Error(`no route ${url}`);
      return route();
    }) as typeof fetch;
    const usage = createUsageLog({ path: "/dev/null" });
    usage.append = (row) => { usage.rows.push(row); };
    const found = createEvidence({ fetch: inner, cache: cache(), usage, traceId: "t", resolve });
    return { urls, usage, found, evidence: async (...args: Parameters<typeof found>) => (await found(...args))?.date ?? null };
  }
  const json = (body: unknown) => () => new Response(JSON.stringify(body), { headers: { "content-type": "application/json" } });
  const page = (body: string) => () => new Response(body, { headers: { "content-type": "text/html" } });
  const esummary = (db: string, id: string) => `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=${db}&id=${id}&retmode=json`;

  it("dates a PubMed page from NCBI, not from the cookie wall, and logs the call as ncbi with zero credits", async () => {
    const t = setup({ [esummary("pubmed", "14715035")]: json({ result: { "14715035": { pubdate: "2004 Jan 20", epubdate: "" } } }) });
    expect(await t.evidence("https://pubmed.ncbi.nlm.nih.gov/14715035/")).toBe("2004-01-20");
    expect(t.urls).toEqual([esummary("pubmed", "14715035")]);
    expect(t.usage.rows).toHaveLength(1);
    expect(t.usage.rows[0]).toMatchObject({ service: "ncbi", endpoint: "esummary", step: "dating", credits: 0, costUsd: 0, cacheHit: false, status: "200" });
  });

  it("says which kind of evidence each date is: PubMed, PubMed Central, Crossref, or the page's own tags", async () => {
    const pubmed = setup({ [esummary("pubmed", "7")]: json({ result: { "7": { pubdate: "2004 Jan 20" } } }) });
    expect(await pubmed.found("https://pubmed.ncbi.nlm.nih.gov/7/")).toEqual({ date: "2004-01-20", source: "registry_pubmed" });
    const pmc = setup({ [esummary("pmc", "8")]: json({ result: { "8": { pubdate: "2010 Mar 5" } } }) });
    expect(await pmc.found("https://pmc.ncbi.nlm.nih.gov/articles/PMC8/")).toEqual({ date: "2010-03-05", source: "registry_pmc" });
    const cr = setup({ "https://api.crossref.org/works/10.1000%2Fz": json({ message: { issued: { "date-parts": [[2012, 4, 2]] } } }) });
    expect(await cr.found("https://doi.org/10.1000/z")).toEqual({ date: "2012-04-02", source: "registry_crossref" });
    const own = setup({ "https://n.example/a": page(html('<meta name="citation_date" content="2008/02/03">')) });
    expect(await own.found("https://n.example/a")).toEqual({ date: "2008-02-03", source: "metadata" });
  });

  it("passes a partial registry date's precision along, and says nothing extra for a full day", async () => {
    const y = setup({ [esummary("pubmed", "5")]: json({ result: { "5": { pubdate: "2020" } } }) });
    expect(await y.found("https://pubmed.ncbi.nlm.nih.gov/5/")).toEqual({ date: "2020-12-31", precision: "year", source: "registry_pubmed" });
    const m = setup({ "https://api.crossref.org/works/10.1000%2Fm": json({ message: { issued: { "date-parts": [[2020, 6]] } } }) });
    expect(await m.found("https://doi.org/10.1000/m")).toEqual({ date: "2020-06-30", precision: "month", source: "registry_crossref" });
  });

  it("dates a PMC page from its own PMC record, never from a PMID printed in its text (that may be a cited reference)", async () => {
    const t = setup({ [esummary("pmc", "1234567")]: json({ result: { "1234567": { pubdate: "2010 Mar 5" } } }),
      [esummary("pubmed", "999")]: json({ result: { "999": { pubdate: "1987 Dec 1" } } }) });
    expect(await t.evidence("https://pmc.ncbi.nlm.nih.gov/articles/PMC1234567/", "References. 12. Smith J. PMID: 999")).toBe("2010-03-05");
    expect(t.urls).toEqual([esummary("pmc", "1234567")]);
  });

  it("dates a DOI link from Crossref, and a page with citation_doi but no date", async () => {
    const work = { message: { "published-online": { "date-parts": [[2012, 4, 2]] } } };
    const direct = setup({ "https://api.crossref.org/works/10.1000%2Fabc.1": json(work) });
    expect(await direct.evidence("https://doi.org/10.1000/abc.1")).toBe("2012-04-02");
    expect(direct.usage.rows[0]).toMatchObject({ service: "crossref", endpoint: "works", credits: 0, costUsd: 0 });
    const publisher = setup({ "https://api.crossref.org/works/10.1000%2Fabc.1": json(work) });
    expect(await publisher.evidence("https://www.science.org/doi/full/10.1000/abc.1")).toBe("2012-04-02");
    expect(publisher.urls).toEqual(["https://api.crossref.org/works/10.1000%2Fabc.1"]);
    const viaMeta = setup({ "https://journal.example/a": page(html('<meta name="citation_doi" content="10.1000/abc.1">')), "https://api.crossref.org/works/10.1000%2Fabc.1": json(work) });
    expect(await viaMeta.evidence("https://journal.example/a")).toBe("2012-04-02");
    expect(viaMeta.usage.rows.map((r) => r.service)).toEqual(["fetch", "crossref"]);
  });

  it("uses only a publication-marked time element as a dateline fallback", async () => {
    const url = "https://news.example/a";
    const unrelated = '<time datetime="1990-01-01">1990</time>';
    const published = '<time itemprop="datePublished" datetime="2020-06-09">June 9</time>';
    expect(await setup({ [url]: page(html(unrelated, published)) }).found(url))
      .toEqual({ date: "2020-06-09", source: "byline" });
    expect(await setup({ [url]: page(html(unrelated)) }).found(url)).toBeNull();
    const teaser = '<aside itemscope><time itemprop="datePublished" datetime="2009-03-01">March 1</time></aside>';
    // Rendered sidebar dates count as ambiguity; they must not silently vanish.
    expect(await setup({ [url]: page(html(teaser, published)) }).found(url)).toBeNull();
    const related = '<div class="related" itemscope itemtype="https://schema.org/NewsArticle">' + published + "</div>";
    expect(await setup({ [url]: page(html("<p>Posted June 9, 2020</p>", related)) }).found(url)).toBeNull();
    expect(await setup({ [url]: page(html(related, published)) }).found(url)).toBeNull();
    const old = '<time itemprop="datePublished" datetime="2009-03-01">Old</time>';
    const article = '<article itemscope itemtype="https://schema.org/NewsArticle">' + published + '</article>';
    const webPage = '<div itemscope itemtype="WebPage">' + published + '</div>';
    expect(await setup({ [url]: page(html(article, '<ul class="related"><li><a>Old</a>' + old + '</li></ul>')) }).found(url)).toBeNull();
    expect(await setup({ [url]: page(html(webPage, '<section>' + old + '</section>')) }).found(url)).toBeNull();
    expect(await setup({ [url]: page(html('<p>Posted June 9, 2020</p>', teaser)) }).found(url)).toBeNull();
    for (const hidden of ['<!-- ' + published + ' -->', '<script type="text/template">' + published + '</script>']) {
      expect(await setup({ [url]: page(html(hidden)) }).found(url)).toBeNull();
    }
    for (const tag of ["template", "textarea", "noscript"]) {
      const hidden = `<${tag}>${old}</${tag}>`;
      expect(await setup({ [url]: page(html(hidden)) }).found(url)).toBeNull();
      expect(await setup({ [url]: page(html(hidden, published)) }).found(url))
        .toEqual({ date: "2020-06-09", source: "byline" });
    }
    const decoy = '<time data-itemprop="datePublished" datetime="2009-03-01">March 1</time>';
    const withData = '<time itemprop="datePublished" data-datetime="2009-03-01" datetime="2020-06-09">June 9</time>';
    expect(await setup({ [url]: page(html(decoy, withData)) }).found(url)).toBeNull();
    expect(await setup({ [url]: page(html(withData)) }).found(url))
      .toEqual({ date: "2020-06-09", source: "byline" });
  });

  it("counts rendered, loosely marked and quoted-tag dates before accepting a dateline", async () => {
    const url = "https://news.example/a";
    const real = '<time itemprop="datePublished" datetime="2020-06-09">June 9</time>';
    const old = '<time itemprop="datePublished" datetime="2009-03-01">Old</time>';
    expect(await setup({ [url]: page(html('<time title=" itemprop=\'datePublished\' datetime=\'2009-03-01\' ">Teaser</time>')) }).found(url)).toBeNull();
    for (const candidate of [
      '<article><footer>' + real + '</footer></article><div class="related">' + old + '</div>',
      '<nav class="breadcrumb">' + real + '</nav>' + old,
      '<nav-menu>' + real + '</nav-menu>' + old,
      '<aside><aside>' + real + '</aside>' + old + '</aside>',
      '<time itemprop=datePublished datetime="2020-06-09">June 9</time>' + old,
      '<time itemprop="datePublished dateCreated" datetime="2020-06-09">June 9</time>' + old,
      '<article title="a > b" itemscope>' + real + '</article>' + old,
    ]) expect(await setup({ [url]: page(html(candidate)) }).found(url)).toBeNull();
    for (const region of ["aside", "nav", "footer"]) {
      expect(await setup({ [url]: page(html(`<${region}>${old}</${region}>`)) }).found(url)).toBeNull();
    }
    // A custom-element name is not a nav region, and a quoted > is not a tag end.
    expect(await setup({ [url]: page(html('<nav-menu title="a > b">' + real + '</nav-menu>')) }).found(url))
      .toEqual({ date: "2020-06-09", source: "byline" });
  });

  it("reads a page's own meta tags and logs the page GET as a fetch row", async () => {
    const t = setup({ "https://news.example/a": page(html('<meta name="citation_publication_date" content="2008/02/03">')) });
    expect(await t.evidence("https://news.example/a")).toBe("2008-02-03");
    expect(t.usage.rows[0]).toMatchObject({ service: "fetch", endpoint: "page", credits: 0, costUsd: 0 });
  });

  it("treats a cookie wall as no evidence, logs it, and does not cache it", async () => {
    const wall = '<html><head><title>Cookies</title></head><body>Cookies must be enabled to view this page. Please enable cookies.</body></html>';
    expect(looksLikeChallenge(wall)).toBe(true);
    expect(looksLikeChallenge(html('<meta name="citation_date" content="2004/06/15">'))).toBe(false);
    const t = setup({ "https://pubmed.example/x": page(wall) });
    expect(await t.evidence("https://pubmed.example/x")).toBeNull();
    expect(t.usage.rows[0]).toMatchObject({ service: "fetch", status: "bad_response" });
    expect(await t.evidence("https://pubmed.example/x")).toBeNull();
    expect(t.urls).toHaveLength(2);
  });

  it("refuses a redirect into a private, loopback or link-local host before requesting it, at any hop", async () => {
    for (const target of ["http://127.0.0.1/admin", "http://169.254.169.254/latest", "http://10.0.0.5/x", "http://localhost:8080/x"]) {
      const t = setup({ "https://a.example/x": () => new Response(null, { status: 302, headers: { location: target } }) });
      expect(await t.evidence("https://a.example/x")).toBeNull();
      expect(t.urls).toEqual(["https://a.example/x"]);
      expect(t.usage.rows[0]).toMatchObject({ service: "fetch", status: "network_error" });
    }
    const hop = setup({
      "https://a.example/x": () => new Response(null, { status: 301, headers: { location: "https://b.example/y" } }),
      "https://b.example/y": () => new Response(null, { status: 302, headers: { location: "http://127.0.0.1/z" } }),
    });
    expect(await hop.evidence("https://a.example/x")).toBeNull();
    expect(hop.urls).toEqual(["https://a.example/x", "https://b.example/y"]);
  });

  it("follows a redirect between public hosts and sends a User-Agent naming the project, with no email", async () => {
    let agent = "";
    const inner = (async (input: string | URL | Request, init?: RequestInit) => {
      agent = (init?.headers as Record<string, string>)["user-agent"] ?? "";
      return String(input).endsWith("/a") ? new Response(null, { status: 301, headers: { location: "/b" } }) : new Response("ok");
    }) as typeof fetch;
    expect(await (await safeFetch(inner, 100, async () => ["93.184.216.34"])("https://a.example/a")).text()).toBe("ok");
    expect(agent).toContain("patient-zero-trace");
    expect(agent).not.toContain("@");
  });

  it("caps the response size", async () => {
    const inner = (async () => new Response("x".repeat(500))) as typeof fetch;
    expect((await (await safeFetch(inner, 100, async () => ["93.184.216.34"])("https://a.example/a")).text()).length).toBe(100);
  });

  it("serves the second request for a URL from the cache, logged as a cache hit", async () => {
    const t = setup({ [esummary("pubmed", "5")]: json({ result: { "5": { pubdate: "2001 Jan 2" } } }) });
    await t.evidence("https://pubmed.ncbi.nlm.nih.gov/5/");
    await t.evidence("https://pubmed.ncbi.nlm.nih.gov/5/");
    expect(t.urls).toHaveLength(1);
    expect(t.usage.rows.map((r) => r.cacheHit)).toEqual([false, true]);
  });
});

describe("addresses and names that point inside", () => {
  it("classifies private, loopback, link-local, CGNAT and IPv6 internal addresses", () => {
    for (const a of ["127.0.0.1", "10.1.2.3", "172.16.0.1", "172.31.255.255", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "224.0.0.1",
      "::1", "::", "fc00::1", "fd12:3456::1", "fe80::1", "::ffff:127.0.0.1", "::ffff:7f00:1", "ff02::1", "64:ff9b::7f00:1", "64:ff9b::a00:1", "2002:7f00:1::", "2002:a9fe:a9fe::1", "::7f00:1", "::127.0.0.1", "::10.0.0.1"]) expect(isPrivateAddress(a), a).toBe(true);
    for (const a of ["93.184.216.34", "172.32.0.1", "100.63.0.1", "2606:2800:220:1::1", "::ffff:5db8:d822", "64:ff9b::5db8:d822", "2002:5db8:d822::1", "::5db8:d822"]) expect(isPrivateAddress(a), a).toBe(false);
  });
  it("refuses a name that resolves to loopback (nip.io, localtest.me) or to one private address among several, before requesting it", async () => {
    for (const [host, addresses] of [["127.0.0.1.nip.io", ["127.0.0.1"]], ["localtest.me", ["127.0.0.1", "::1"]], ["mixed.example", ["93.184.216.34", "10.0.0.7"]], ["gone.example", []]] as const) {
      let requested = 0;
      const inner = (async () => { requested++; return new Response("<html></html>"); }) as typeof fetch;
      await expect(safeFetch(inner, 1000, async () => [...addresses])(`https://${host}/x`)).rejects.toThrow(/blocked/);
      expect(requested).toBe(0);
    }
  });
  it("checks the address of every hop: a public name that redirects to a name resolving inside is stopped there", async () => {
    const seen: string[] = [];
    const inner = (async (input: string | URL | Request) => {
      seen.push(String(input));
      return new Response(null, { status: 302, headers: { location: "https://evil.localtest.me/y" } });
    }) as typeof fetch;
    const resolve = async (host: string) => (host.endsWith("localtest.me") ? ["127.0.0.1"] : ["93.184.216.34"]);
    await expect(safeFetch(inner, 1000, resolve)("https://a.example/x")).rejects.toThrow(/blocked/);
    expect(seen).toEqual(["https://a.example/x"]);
  });
  it("stops after three redirect hops", async () => {
    const inner = (async (input: string | URL | Request) => new Response(null, { status: 302, headers: { location: `${String(input)}x` } })) as typeof fetch;
    await expect(safeFetch(inner, 1000, async () => ["93.184.216.34"])("https://a.example/")).rejects.toThrow(/redirects/);
  });
  it("reads at most the byte limit of a huge page and cancels the stream", async () => {
    let pulled = 0, cancelled = false;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) { pulled++; controller.enqueue(new Uint8Array(1000).fill(97)); },
      cancel() { cancelled = true; },
    });
    const inner = (async () => new Response(stream)) as typeof fetch;
    const text = await (await safeFetch(inner, 2500, async () => ["93.184.216.34"])("https://a.example/")).text();
    expect(text.length).toBe(2500);
    expect(cancelled).toBe(true);
    expect(pulled).toBeLessThan(10);
  });
});

describe("redirects against a real local server", () => {
  it("never requests the Location it refused: removing redirect manual would hit /secret", async () => {
    const { createServer } = await import("node:http");
    let secretHits = 0;
    const server = createServer((req, res) => {
      if (req.url === "/secret") { secretHits++; res.end("secret"); return; }
      res.writeHead(302, { location: `http://127.0.0.1:${(server.address() as { port: number }).port}/secret` });
      res.end();
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const port = (server.address() as { port: number }).port;
    // The first hop is a public-looking name that really reaches the local server; its Location points at loopback.
    const real = ((url: string, init?: RequestInit) => fetch(String(url).replace("start.example", "127.0.0.1"), init)) as typeof fetch;
    try {
      await expect(safeFetch(real, 1000, async () => ["93.184.216.34"])(`http://start.example:${port}/a`)).rejects.toThrow(/blocked/);
      expect(secretHits).toBe(0);
    } finally {
      server.close();
    }
  });
});

describe("JSON-LD belongs to the page's own item", () => {
  const ld = (value: unknown) => `<script type="application/ld+json">${JSON.stringify(value)}</script>`;
  it("takes a top-level item and the main-type item in @graph, not a related or cited one", () => {
    expect(publicationDate(ld({ "@type": "Article", datePublished: "2010-05-06" }))).toBe("2010-05-06");
    expect(publicationDate(ld({ "@graph": [{ "@type": "BreadcrumbList", datePublished: "1990-01-01" }, { "@type": ["WebPage", "Thing"], datePublished: "2011-02-03" }] }))).toBe("2011-02-03");
    expect(publicationDate(ld({ "@type": "Article", citation: [{ "@type": "Article", datePublished: "1990-01-01" }] }))).toBeNull();
    expect(publicationDate(ld({ "@graph": [{ "@type": "Review", datePublished: "1990-01-01" }] }))).toBeNull();
    expect(publicationDate(ld([{ "@type": "Organization" }, { "@type": "NewsArticle", datePublished: "2015-06-07" }]))).toBe("2015-06-07");
  });
});

describe("the evidence pass has a time budget", () => {
  it("stops starting lookups once the budget is spent, so a slow site cannot eat the time dating needs", async () => {
    let calls = 0;
    const inner = (async () => { calls++; await new Promise((r) => setTimeout(r, 60)); return new Response("<html><head><meta name=\"citation_date\" content=\"2004/06/15\"></head></html>"); }) as typeof fetch;
    const usage = createUsageLog({ path: "/dev/null" });
    usage.append = (row) => { usage.rows.push(row); };
    const evidence = createEvidence({ fetch: inner, cache: { get: () => null, set: () => {} }, usage, traceId: "t", resolve: async () => ["93.184.216.34"], budgetMs: 700 });
    const started = Date.now();
    const dates: (string | undefined)[] = [];
    for (let i = 0; i < 40; i++) dates.push((await evidence(`https://p${i}.example/x`))?.date);
    expect(Date.now() - started).toBeLessThan(1500);
    expect(calls).toBeGreaterThan(0);
    expect(calls).toBeLessThan(40);
    expect(dates.slice(-1)[0]).toBeUndefined();
    expect(dates[0]).toBe("2004-06-15");
  });
});

describe("isPublicPage", () => {
  it("only allows public http(s) pages", () => {
    for (const url of ["https://pubmed.ncbi.nlm.nih.gov/1/", "http://news.example/a"]) expect(isPublicPage(url)).toBe(true);
    for (const url of ["file:///etc/passwd", "http://localhost/x", "http://127.0.0.1/x", "http://169.254.169.254/latest", "http://[::1]/x", "http://intranet/x", "ftp://a.example/x", "http://2130706433/x"]) expect(isPublicPage(url)).toBe(false);
  });
});
