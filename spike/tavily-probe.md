# Tavily capability probe (#7)

Run 2026-11-01 PT by RishitRai. Neutral phrases only: a baking line ("cream the butter and sugar until light and fluffy"), a public-domain opening line ("it was the best of times, it was the worst of times") and one nonsense phrase. No spike claim was used.

Total: **12 credits, 14 calls** (limit 200). Requests are `POST https://api.tavily.com/<endpoint>` with `include_usage: true`; the key is sent as a bearer header and appears nowhere here. Docs read the same day: search and extract API references, credits page.

## What this changes for the walker (T10, T11)

1. **`exact_match` returned no `raw_content`.** All 10 results were null even with `include_raw_content: "text"`; the same query without `exact_match` returned text for 7 of 10. Page text has to come from a second `/extract` call or our own fetch.
2. **Dates are not returned reliably on a plain exact search.** `exact_match` with `include_published_date` and no date window gave null on 10 of 10. The same query with `end_date` gave a date on 10 of 10. Always send a date window when dates matter.
3. **Do not combine `exact_match` with `filter_by_published_date` by default.** It cut 10 results to 2, although all 10 unfiltered results already had in-window dates. Filter off also lets undated pages through, so the walker must handle a null date.
4. **`published_date` is usually the publish date, not a guarantee.** It was within a day of the page's publish date on 11 of 12 pages. It is still an estimate, so the plan's cap by Wayback first capture stays necessary.
5. **Parse links with a real markdown parser.** Links can be relative or bare anchors, and URLs can contain parentheses, such as `Creaming_(cooking)`.

## 1. Links: does `/extract` with markdown keep hyperlinks?

**Yes, inline in the markdown. Partly usable: there is no links field and no raw HTML.**

Request: `extract { urls: ["https://en.wikipedia.org/wiki/Creaming_(food)", "https://www.gutenberg.org/ebooks/98"], format: "markdown" }`

| Request | Page | Markdown links found | Text length |
|---|---|---|---|
| markdown, basic | Wikipedia | 151 | 13987 |
| markdown, basic, repeat | Wikipedia | 158 | 16704 |
| markdown, advanced | Wikipedia | 229 | 25020 |
| text, basic | Wikipedia | 0 | 4070 |
| markdown, basic | Gutenberg | 49 | 4430 |

- Each result has only `url`, `title`, `raw_content` and `images`. There is no links field. The documented formats are `markdown` and `text`, so there is no raw HTML option.
- Examples returned: `[Jump to content](#bodyContent)` on basic, `[Jump to content](https://en.wikipedia.org/wiki/Creaming_(cooking)...` on advanced, and the relative `(/gutenberg/pg-logo-new.jpg)` on Gutenberg. Resolve relative links against the page URL.
- The same page gave different lengths on two basic calls, so do not treat an extract as stable between calls. Hash what was actually used.

## 2. Exact match: only pages containing the phrase verbatim?

**Yes on everything we could check; one result could not be checked.**

Request: `search { query: "\"cream the butter and sugar until light and fluffy\"", exact_match: true, max_results: 10, include_raw_content: "text", include_published_date: true }`

Comparison ignored case and collapsed whitespace, so this tests the wording, not byte equality. The returned snippet held the phrase on 10 of 10. Opening the first 5 results:

| Result | Phrase in the page's own HTML |
|---|---|
| instagram.com/reel/Da1f7mZIcp4 | not visible to our fetch, snippet only; cannot confirm |
| ambermaetoday.substack.com/p/the-best-soft-and-fluffy-sugar-cookies | yes |
| facebook.com/ObaapaRecipes/videos/classic-pound-cake-recipe/976720704166656 | yes |
| theclevercarrot.com/2023/09/overnight-sourdough-apple-cake/comment-page-6 | yes |
| biggerbolderbaking.com/how-to-cream-butter-and-sugar | yes |

Controls: a nonsense phrase with `exact_match` returned 0 results, so it does not fall back to loose matches. The same baking query without `exact_match` had the phrase in the raw text of only 1 of 10 results.

Note: results include social pages and a comment page, so a match can come from comments rather than the article.

## 3. Date cut-off: does `end_date` exclude newer pages?

**Yes for dated pages. No for undated pages, unless filtered.**

| Request (`end_date: "2014-12-31"`) | Results | Dated, all in window | Null date |
|---|---|---|---|
| baking phrase, `exact_match` | 10 | 10 | 0 |
| baking phrase, `exact_match`, `filter_by_published_date` | 2 | 2 | 0 |
| baking phrase, no `exact_match` | 10 | 1 | 9 |
| baking phrase, no `exact_match`, `filter_by_published_date` | 10 | 10 | 0 |
| Dickens line, no `exact_match` | 8 | 6 | 2 |

So a phrase restricted to before 2015 returned 10 results. The snippet held the phrase on all 10 exact results. No returned date fell after the cut-off.

Spot checks against the pages' own metadata: oprah.com/food/honey-cupcakes 2009-12-10, thegalleygourmet.net/homemade-lofthouse-cookies-holiday-version 2013-12-19, everydayannie.com/2009/02/14/funfetti-cake 2009-02-14, strawberryplum.com peach sour cream bundt cake 2013-08-29, marcsievers.com/la-vie-piquant/2013/10/07 2013-10-07. All agree with the API. food52.com returned HTTP 429 and kitchenconfidante.com returned 403 to our fetch, so those two were not checked.

Dates also appear inconsistently: pages such as cheatinwheat.com and nigella.com had a null date without the filter and a real date with it, on the same cut-off.

## 4. Published or updated: which date does `include_published_date` give?

**Mostly the publish date in this sample (partly: the docs call it a best estimate of "published or last updated").**

Compared on 12 pages with a non-null API date and readable page metadata (`datePublished` or `article:published_time`; `dateModified` or `article:modified_time`):

| Page | API date | Page published | Page modified |
|---|---|---|---|
| instructables.com How-to-Cream-Butter-and-Sugar | 2011-05-14 | 2011-05-14 | 2019-11-28 |
| pastrychefonline.com/the-creaming-method | 2012-05-22 | 2012-05-22 | 2024-09-21 |
| thegalleygourmet.net lofthouse cookies | 2013-12-19 | 2013-12-19 | 2025-12-05 |
| marcsievers.com/la-vie-piquant/2013/10/07 | 2013-10-07 | 2013-10-07 | 2021-07-16 |
| welike2cook.com/2012/03/tow-creaming.html | 2012-03-14 | 2012-03-13 | 2013-06-07 |
| bbcgoodfood.com how-cream-butter-and-sugar video | 2008-11-27 | 2013-05-11 | 2020-08-11 |
| kingarthurbaking.com/blog/2015/04/27 | 2015-04-27 | April 27 (year cut in our capture) | September (year cut) |
| fifteenspatulas.wordpress.com 2010/12/23 | 2010-12-23 | 2010-12-23 | 2010-12-23 |
| oprah.com/food/honey-cupcakes | 2009-12-10 | 2009-12-10 | none |
| everydayannie.com 2009/02/14 | 2009-02-14 | 2009-02-14 | none |
| strawberryplum.com bundt cake | 2013-08-29 | 2013-08-29 | 2013-08-29 |
| onehotoven.com/how-to-cream-butter | 2026-09-19 | 2026-09-19 | 2026-09-19 |

- Where modified differs from published (7 pages), the API never returned the modified date.
- 11 of 12 agree with the published date to within a day. One (BBC Good Food) is more than four years earlier than the page's own date, so an API date can also be earlier than the page claims.
- Limits: 12 recipe pages, mostly drawn from date-window searches. Page metadata can itself be rewritten on republishing, so onehotoven's 2026 date cannot be told apart from a republish here. This does not show the date is right on news or stat pages.

## Credits and calls

| # | Endpoint | Parameters beyond `include_usage` | Credits | Latency ms | Results |
|---|---|---|---|---|---|
| 1 | search | baking phrase quoted, `exact_match`, `max_results` 10, `include_raw_content` text, `include_published_date` | 1 | 1297 | 10 |
| 2 | search | baking phrase, `max_results` 10, `include_raw_content` text, `include_published_date` | 1 | 1141 | 10 |
| 3 | search | nonsense phrase quoted, `exact_match`, `max_results` 5 | 1 | 3048 | 0 |
| 4 | search | baking phrase quoted, `exact_match`, `max_results` 10, `include_published_date` | 1 | 1333 | 10 |
| 5 | search | as 4, `end_date` 2014-12-31 | 1 | 2054 | 10 |
| 6 | search | baking phrase, `end_date` 2014-12-31, `max_results` 10, `include_published_date` | 1 | 1167 | 10 |
| 7 | search | Dickens line, `end_date` 2014-12-31, `max_results` 10, `include_published_date` | 1 | 1077 | 8 |
| 8 | search | baking phrase, `search_depth` advanced, `max_results` 5, `include_published_date` | 2 | 1802 | 5 |
| 9 | extract | 2 URLs, `format` markdown | 0 | 1120 | 2 |
| 10 | extract | 1 URL, `format` markdown, `extract_depth` advanced | 0 | 1609 | 1 |
| 11 | extract | 1 URL, `format` text | 1 | 605 | 1 |
| 12 | search | as 5, `filter_by_published_date` | 1 | 1832 | 2 |
| 13 | search | as 6 without `include_published_date`, `filter_by_published_date` | 1 | 1409 | 10 |
| 14 | extract | 1 URL, `format` markdown, `include_images` false | 0 | 84 | 1 |

**Credit rules seen:** basic search 1, advanced search 2. Extract is billed per 5 successful URLs, so single calls report 0 until the count rolls over (calls 9 to 11 covered 4 URLs and call 11 reported 1, which comes earlier than the "every 5" wording suggests, so do not rely on the rollover point). `beforeCall` should budget 1 credit for any basic extract call of up to 5 URLs, and 2 for advanced. Call 14's 84 ms suggests a server-side cache.

`exact_match` and date windows cost nothing extra. The credits page lists these prices; the search and extract counts above are as reported by `usage.credits`.
