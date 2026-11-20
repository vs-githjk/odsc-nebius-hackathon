import { describe, expect, it } from "vitest";
import { BYLINE_GUARDS, bylineDate, datesIn } from "../src/engine/publication.ts";

// The adversarial matrix for the byline fallback (#222). The page's real date is June 9, 2020; the teaser is an older
// related card marked datePublished 2009-03-01. Every case where the real date is later than the teaser must give null:
// a false earlier date is the worst error the engine can make, and a missed date only leaves dating to the archive.
const T = '<time itemprop="datePublished" datetime="2009-03-01">March 1, 2009</time>';
const REAL = '<time itemprop="datePublished" datetime="2020-06-09">June 9, 2020</time>';
const page = (body: string, head = "") => `<!doctype html><html><head><title>Story</title>${head}</head><body>${body}</body></html>`;
const URL_PLAIN = "https://news.example/story";

type Case = { name: string; html: string; url?: string; want: string | null };

const positives: Case[] = [
  { name: "a byline under the headline and a long body after it", html: page(`<article><h1>Story</h1><p>By Jo Smith</p>${REAL}<p>${"Lorem ipsum dolor sit amet. ".repeat(40)}</p></article>`), want: "2020-06-09" },
  { name: "a single marked time in the article", html: page(`<article><h1>Story</h1>${REAL}<p>Body.</p></article>`), want: "2020-06-09" },
  { name: "a single marked time in main", html: page(`<main><h1>Story</h1>${REAL}<p>Body.</p></main>`), want: "2020-06-09" },
  { name: "older dates elsewhere do not veto", html: page(`<article>${REAL}<p>The study ran from <time datetime="1990-01-01">1990</time>, first reported March 3, 2001.</p></article>`), want: "2020-06-09" },
  { name: "a full timestamp is kept as written", html: page('<article><time itemprop="datePublished" datetime="2020-06-09T08:30:00Z">June 9</time></article>'), want: "2020-06-09T08:30:00Z" },
  { name: "a quoted > inside an attribute is not a tag end", html: page(`<article title="a > b">${REAL}</article>`), want: "2020-06-09" },
  { name: "a custom element named nav-menu is not a nav", html: page(`<article><nav-menu></nav-menu>${REAL}</article>`), want: "2020-06-09" },
  { name: "upper-case markup", html: page('<ARTICLE><TIME ITEMPROP="datePublished" DATETIME="2020-06-09">June 9</TIME></ARTICLE>'), want: "2020-06-09" },
  { name: "a 2004/06/15 datetime is the same day", html: page('<article><time itemprop="datePublished" datetime="2004/06/15">June 15</time></article>'), want: "2004-06-15" },
];

const negatives: Case[] = [
  // The page's own date marked some other way, beside a marked teaser.
  { name: "real date on a span with itemprop", html: page(`<article><span itemprop="datePublished" content="2020-06-09">June 9, 2020</span>${T}</article>`), want: null },
  { name: "real date on a div with itemprop", html: page(`<article><div itemprop="datePublished">2020-06-09</div>${T}</article>`), want: null },
  { name: "real date in a body meta itemprop", html: page(`<article><meta itemprop="datePublished" content="2020-06-09">${T}</article>`), want: null },
  { name: "real date in RDFa property", html: page(`<article><span property="datePublished" content="2020-06-09">June 9</span>${T}</article>`), want: null },
  { name: "real date in RDFa property=schema:datePublished", html: page(`<article><span property="schema:datePublished">2020-06-09</span>${T}</article>`), want: null },
  { name: "WordPress time.published", html: page(`<article><time class="entry-date published" datetime="2020-06-09">June 9, 2020</time>${T}</article>`), want: null },
  { name: "a pubdate attribute", html: page(`<article><time pubdate datetime="2020-06-09">June 9</time>${T}</article>`), want: null },
  { name: "dateModified as a time", html: page(`<article>${T}<time itemprop="dateModified" datetime="2020-06-10">Updated</time></article>`), want: null },
  { name: "dateModified as a meta", html: page(`<article>${T}</article>`, '<meta property="article:modified_time" content="2020-06-10T00:00:00Z">'), want: null },
  { name: "plain text Posted June 9 2020", html: page(`<article><p>Posted June 9 2020</p>${T}</article>`), want: null },
  { name: "plain text 9 June 2020", html: page(`<article><p>By Jo, 9 June 2020</p>${T}</article>`), want: null },
  { name: "plain text 09/06/2020", html: page(`<article><p>09/06/2020</p>${T}</article>`), want: null },
  { name: "plain text Updated 2021", html: page(`<article><p>Updated 2021</p>${T}</article>`), want: null },
  { name: "plain text June 2020", html: page(`<article><p>June 2020 issue</p>${T}</article>`), want: null },
  { name: "real date in the title", html: page(`<article>${T}</article>`).replace("<title>Story</title>", "<title>Story, June 9, 2020</title>"), want: null },
  { name: "real date in a later unmarked time", html: page(`<article>${T}<p>Last updated <time datetime="2020-06-09">this week</time></p></article>`), want: null },
  { name: "real date in a data attribute", html: page(`<article data-published-at="2020-06-09">${T}</article>`), want: null },
  { name: "real date in the canonical link", html: page(`<article>${T}</article>`, '<link rel="canonical" href="https://news.example/2020/06/09/story">'), want: null },
  { name: "real date in the page URL", html: page(`<article>${T}</article>`), url: "https://news.example/2020/06/09/story", want: null },
  { name: "real date in words in the meta description", html: page(`<article>${T}</article>`, '<meta name="description" content="Posted June 9, 2020: the story.">'), want: null },
  { name: "real date in words in og:description", html: page(`<article>${T}</article>`, '<meta property="og:description" content="9 June 2020, a story">'), want: null },
  { name: "real date in an image alt", html: page(`<article><img alt="The scene on June 9, 2020" src="a.jpg">${T}</article>`), want: null },
  { name: "real date in an aria-label", html: page(`<article><span aria-label="Published June 9, 2020"></span>${T}</article>`), want: null },
  { name: "real date in an abbr title", html: page(`<article><abbr title="June 9, 2020">3 days ago</abbr>${T}</article>`), want: null },
  { name: "real date in a noscript copy of the byline", html: page(`<article><noscript><p>Posted June 9, 2020</p></noscript>${T}</article>`), want: null },
  { name: "real date in an application/json script", html: page(`<article>${T}</article><script type="application/json">{"publishedAt":"2020-06-09"}</script>`), want: null },
  { name: "real date in inline page data", html: page(`<article>${T}</article><script>window.__DATA__={publish_date:"2020-06-09"}</script>`), want: null },
  { name: "real date in xmp text", html: page(`<article><xmp>Posted 2020-06-09</xmp>${T}</article>`), want: null },
  { name: "a teaser wrapper with a huge attribute still blocks", html: page(`<article><p>3 days ago</p><div data-props="${"x".repeat(30000)}" class="related">${T}</div></article>`), want: null },
  { name: "real date in JSON-LD dateModified", html: page(`<article>${T}</article>`, '<script type="application/ld+json">{"@type":"Thing","dateModified":"2020-06-09"}</script>'), want: null },
  // A lone teaser in the places teasers live.
  ...["ul.related", "section.related-posts", "div.more", "div.popular", "div.latest", "div.recommend", "div.teaser", "div.sidebar", "div.widget", "div.trending", "div#read-next", "div.card"].map((sel): Case => {
    const [tag, rest] = sel.split(/[.#]/);
    const attr = sel.includes("#") ? `id="${rest}"` : `class="${rest}"`;
    return { name: `a lone teaser in ${sel}`, html: page(`<article><p>Posted June 9 2020</p><${tag} ${attr}>${T}</${tag}></article>`), want: null };
  }),
  ...["aside", "nav", "header", "footer", "details", "dialog"].map((tag): Case => ({ name: `a lone teaser in ${tag}`, html: page(`<article><${tag}>${T}</${tag}></article>`), want: null })),
  { name: "a lone teaser in a list item", html: page(`<article><ul><li><a href="/old">Old</a> ${T}</li></ul></article>`), want: null },
  { name: "a lone teaser in a link", html: page(`<article><a href="/old">${T}</a></article>`), want: null },
  { name: "a lone teaser in a figure", html: page(`<article><figure>${T}</figure></article>`), want: null },
  { name: "a lone teaser in a blockquote", html: page(`<article><blockquote>${T}</blockquote></article>`), want: null },
  { name: "a lone teaser in a table", html: page(`<article><table><tr><td>${T}</td></tr></table></article>`), want: null },
  { name: "a lone teaser in an itemscope", html: page(`<article><div itemscope itemtype="https://schema.org/NewsArticle">${T}</div></article>`), want: null },
  { name: "a lone teaser in an itemscope article", html: page(`<article itemscope itemtype="https://schema.org/NewsArticle">${T}</article>`), want: null },
  { name: "a lone teaser in svg foreignObject", html: page(`<article><svg><foreignObject>${T}</foreignObject></svg></article>`), want: null },
  { name: "a lone teaser outside article and main", html: page(`<div class="story">${T}</div>`), want: null },
  { name: "a lone teaser in one of several articles", html: page(`<article>${T}</article><article><p>Another card</p></article>`), want: null },
  { name: "a lone teaser in a card heading", html: page(`<article><h3><span>Old story</span> ${T}</h3></article>`), want: null },
  { name: "a lone teaser after the body with an unreadable real date", html: page(`<article><h1>Story</h1><p>3 days ago</p><p>${"Lorem ipsum dolor sit amet. ".repeat(20)}</p><div>${T} Old story</div></article>`), want: null },
  { name: "a lone teaser in a nested article", html: page(`<article><p>Story</p><article>${T}</article></article>`), want: null },
  // Content that does not render.
  { name: "a lone teaser in [hidden]", html: page(`<article><div hidden>${T}</div></article>`), want: null },
  { name: "a lone teaser in aria-hidden", html: page(`<article><div aria-hidden="true">${T}</div></article>`), want: null },
  { name: "a lone teaser in display:none", html: page(`<article><div style="display: none">${T}</div></article>`), want: null },
  { name: "a lone teaser in template", html: page(`<article><template>${T}</template></article>`), want: null },
  ...["style", "title", "xmp", "iframe", "noscript", "textarea", "script"].map((tag): Case => ({ name: `real date hidden in ${tag}, teaser rendered`, html: page(`<article><${tag}>${REAL}</${tag}>${T}</article>`), want: null })),
  { name: "real date in a comment", html: page(`<article><!-- ${REAL} -->${T}</article>`), want: null },
  { name: "real date in a bogus <! comment", html: page(`<article><!x datePublished 2020-06-09>${T}</article>`), want: null },
  { name: "real date in a <? processing instruction", html: page(`<article><?x datePublished="2020-06-09"?>${T}</article>`), want: null },
  { name: "an unclosed comment swallowing the real date", html: page(`<article>${T}<!-- ${REAL}`), want: null },
  // The candidate itself is not strict enough.
  { name: "two tokens in itemprop", html: page('<article><time itemprop="datePublished dateCreated" datetime="2009-03-01">March 1</time></article>'), want: null },
  { name: "datePublished on a span", html: page('<article><span itemprop="datePublished" datetime="2009-03-01">March 1</span></article>'), want: null },
  { name: "a partial datetime", html: page('<article><time itemprop="datePublished" datetime="2009-03">March</time></article>'), want: null },
  { name: "no datetime at all", html: page('<article><time itemprop="datePublished">March 1, 2009</time></article>'), want: null },
  { name: "an attribute that only quotes itemprop", html: page(`<article><time title=" itemprop='datePublished' datetime='2009-03-01' ">Teaser</time></article>`), want: null },
  { name: "two marked times, real and teaser", html: page(`<article>${REAL}${T}</article>`), want: null },
  { name: "teaser first, then an undated published span", html: page(`<article>${T}<span class="published">Published yesterday</span></article>`), want: null },
];

// One case per guard that only that guard stops, so the mutation test below can see each one is load-bearing.
const sole: Record<(typeof BYLINE_GUARDS)[number], Case> = {
  "single": { name: "single", html: page(`<article>${T}<span class="published">Published yesterday</span></article>`), want: null },
  "no-hidden-mention": { name: "no-hidden-mention", html: page(`<article>${T}<!-- datePublished: see header --></article>`), want: null },
  "time-only": { name: "time-only", html: page('<article><span itemprop="datePublished" datetime="2009-03-01">March 1</span></article>'), want: null },
  "strict-itemprop": { name: "strict-itemprop", html: page('<article><time itemprop="datePublished dateCreated" datetime="2009-03-01">March 1</time></article>'), want: null },
  "full-date": { name: "full-date", html: page('<article><time itemprop="datePublished" datetime="2009-03">March</time></article>'), want: null },
  "rendered": { name: "rendered", html: page(`<article><div hidden>${T}</div></article>`), want: null },
  "unblocked": { name: "unblocked", html: page(`<article><aside>${T}</aside></article>`), want: null },
  "in-article": { name: "in-article", html: page(`<div>${T}</div>`), want: null },
  "not-in-list": { name: "not-in-list", html: page(`<article><ul><li>${T}</li></ul></article>`), want: null },
  "near-top": { name: "near-top", html: page(`<article><h1>Story</h1><p>${"Lorem ipsum dolor sit amet, consectetur adipiscing elit. ".repeat(10)}</p><p>See also ${T}</p></article>`), want: null },
  "single-article": { name: "single-article", html: page(`<article>${T}</article><article><p>x</p></article>`), want: null },
  "later-time": { name: "later-time", html: page(`<article>${T}<p>Revised <time datetime="2020-06-09">recently</time></p></article>`), want: null },
  "later-attr": { name: "later-attr", html: page(`<article>${T}<div data-updated="2020-06-09"></div></article>`), want: null },
  "later-raw": { name: "later-raw", html: page(`<article><noscript><p>Posted June 9, 2020</p></noscript>${T}</article>`), want: null },
  "later-text": { name: "later-text", html: page(`<article><p>Posted June 9 2020</p>${T}</article>`), want: null },
  "later-jsonld": { name: "later-jsonld", html: page(`<article>${T}</article>`, '<script type="application/ld+json">{"@type":"Thing","dateModified":"2020-06-09"}</script>'), want: null },
  "later-url": { name: "later-url", html: page(`<article>${T}</article>`), url: "https://news.example/2020/06/09/story", want: null },
};

const matrix = [...positives, ...negatives, ...Object.values(sole)];

describe("the byline fallback's adversarial matrix (#222)", () => {
  it(`has at least 80 cases`, () => {
    expect(matrix.length).toBeGreaterThanOrEqual(80);
  });

  for (const c of positives) it(`dates: ${c.name}`, () => expect(bylineDate(c.html, c.url ?? URL_PLAIN)).toBe(c.want));
  for (const c of [...negatives, ...Object.values(sole)]) it(`refuses: ${c.name}`, () => expect(bylineDate(c.html, c.url ?? URL_PLAIN)).toBeNull());

  it("never returns a date earlier than the page's real date on any refusal case", () => {
    for (const c of negatives) {
      const got = bylineDate(c.html, c.url ?? URL_PLAIN);
      expect(got === null || got >= "2020-06-09", c.name).toBe(true);
    }
  });
});

describe("mutation pass: every guard is load-bearing", () => {
  for (const guard of BYLINE_GUARDS) {
    it(`turning off ${guard} makes at least one case wrong`, () => {
      const wrong = matrix.filter((c) => bylineDate(c.html, c.url ?? URL_PLAIN, guard) !== c.want);
      expect(wrong.length, `no case needs ${guard}`).toBeGreaterThan(0);
      expect(bylineDate(sole[guard].html, sole[guard].url ?? URL_PLAIN, guard), `${guard}'s own case`).not.toBeNull();
    });
  }
});

describe("datesIn reads the dates a page writes", () => {
  it("reads the common forms, each as its earliest possible day", () => {
    expect(datesIn("Posted June 9 2020")).toContain("2020-06-09");
    expect(datesIn("9th of June, 2020")).toContain("2020-06-09");
    expect(datesIn("June 2020")).toContain("2020-06-01");
    expect(datesIn("2020-06-09")).toContain("2020-06-09");
    expect(datesIn("09/06/2020")).toContain("2020-06-09");
    expect(datesIn("Updated: 2021")).toContain("2021-01-01");
    expect(datesIn("Copyright 2024")).toEqual([]);
  });
});

// A combinatorial probe: the page's real date written 18 ways, beside the teaser in 24 places, in 4 layouts. Not one of the pages may
// come back with a date earlier than the real one.
describe("combinatorial probe: no false earlier date", () => {
  // The page's real date written 18 ways.
  const real = [
    '<time itemprop="datePublished" datetime="2020-06-09">June 9, 2020</time>',
    '<span itemprop="datePublished" content="2020-06-09">June 9</span>',
    '<div itemprop="datePublished">2020-06-09</div>',
    '<meta itemprop="datePublished" content="2020-06-09">',
    '<span property="datePublished" content="2020-06-09"></span>',
    '<time class="entry-date published" datetime="2020-06-09">June 9</time>',
    '<time itemprop="dateModified" datetime="2020-06-09">Updated</time>',
    '<time datetime="2020-06-09">this week</time>',
    "<p>Posted June 9 2020</p>",
    "<p>9 June 2020</p>",
    "<p>06/09/2020</p>",
    "<p>Published: 2020</p>",
    '<div data-date="2020-06-09"></div>',
    '<img alt="June 9, 2020" src="a.jpg">',
    '<abbr title="Published June 9, 2020">3 days ago</abbr>',
    "<noscript>Posted June 9, 2020</noscript>",
    '<script type="application/json">{"publishedAt":"2020-06-09"}</script>',
    '<script>window.__DATA__={publish_date:"2020-06-09"}</script>',
  ];
  const teaser = [
    T, `<ul class="related"><li>${T}</li></ul>`, `<section class="related-posts">${T}</section>`, `<header>${T}</header>`,
    `<div class="more">${T}</div>`, `<div class="popular">${T}</div>`, `<div class="latest">${T}</div>`, `<div class="recommend">${T}</div>`,
    `<div class="teaser">${T}</div>`, `<aside>${T}</aside>`, `<nav>${T}</nav>`, `<footer>${T}</footer>`,
    `<a href="/old">${T}</a>`, `<h3>${T}</h3>`, `<div itemscope>${T}</div>`, `<div hidden>${T}</div>`,
    `<template>${T}</template>`, `<svg><foreignObject>${T}</foreignObject></svg>`, `<style>${T}</style>`, `<title>${T}</title>`,
    `<xmp>${T}</xmp>`, `<iframe>${T}</iframe>`, `<!-- ${T} -->`, `<div style="display:none">${T}</div>`,
  ];
  const layouts = [
    (r: string, t: string) => page(`<article>${r}${t}</article>`),
    (r: string, t: string) => page(`<article>${t}${r}</article>`),
    (r: string, t: string) => page(`<main>${r}</main><article>${t}</article>`),
    (r: string, t: string) => page(`<article>${t}</article>`, r),
  ];
  it(`${real.length * teaser.length * layouts.length} pages, every one null or not earlier than the real date`, () => {
    const bad: string[] = [];
    for (const r of real) for (const t of teaser) for (const layout of layouts) {
      const html = layout(r, t);
      const got = bylineDate(html, URL_PLAIN);
      if (got !== null && got < "2020-06-09") bad.push(html);
    }
    expect(bad).toEqual([]);
  });
});
