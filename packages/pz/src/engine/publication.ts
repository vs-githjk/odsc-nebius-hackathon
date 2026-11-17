import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { send, type ClientDeps } from "../clients/http.ts";
import type { Cache } from "../clients/cache.ts";
import type { UsageLog } from "../usage/log.ts";

// Publication evidence for the dating stage (#79). The dating rules are unchanged and live in dating.ts: structured
// publication metadata is the page's own claim of when it was published, and it is capped by the first successful
// archive capture there. This file only reads that metadata from a page's raw HTML. The Tavily search date and the
// page body are never read here (C6).

const NAMES = ["citation_publication_date", "citation_date", "article:published_time", "datepublished", "dc.date", "dc.date.issued"];

const attr = (tag: string, name: string) =>
  new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, "i").exec(tag)?.slice(1).find((v) => v !== undefined) ?? null;

// Scholarly sites write 2004/06/15; that is the same calendar day as 2004-06-15, so only the separator changes. A
// partial date (2004/06) stays partial and dating.ts leaves it unconfirmed.
const clean = (value: string) => {
  const v = value.trim();
  const slashed = /^(\d{4})\/(\d{2})\/(\d{2})(.*)$/.exec(v);
  return slashed ? `${slashed[1]}-${slashed[2]}-${slashed[3]}${slashed[4]}` : v;
};

// Only the page's own item counts: a top-level item, or the item in @graph whose @type is the page's main type. A
// datePublished on a cited work, a related article or anything nested deeper belongs to another document.
const MAIN_TYPES = new Set(["Article", "ScholarlyArticle", "NewsArticle", "BlogPosting", "Report", "WebPage"]);
function jsonLdDates(html: string): string[] {
  const found: string[] = [];
  const typed = (item: Record<string, unknown>) => [item["@type"]].flat().some((t) => typeof t === "string" && MAIN_TYPES.has(t));
  const own = (item: unknown, top: boolean) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return;
    const record = item as Record<string, unknown>;
    if (typeof record.datePublished === "string" && (top || typed(record))) found.push(record.datePublished);
    if (Array.isArray(record["@graph"])) for (const member of record["@graph"]) own(member, false);
  };
  for (const m of html.matchAll(/<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const parsed: unknown = JSON.parse(m[1]!);
      for (const item of Array.isArray(parsed) ? parsed : [parsed]) own(item, true);
    } catch { /* malformed JSON-LD is no evidence */ }
  }
  return found;
}

// The first publication date the page declares about itself, in this order: citation_publication_date, citation_date,
// article:published_time (also as itemprop datePublished), JSON-LD datePublished, DC.date. Nothing is chosen by age.
export function publicationDate(html: string): string | null {
  const metas = [...html.matchAll(/<meta\b[^>]*>/gi)].map((m) => m[0]);
  const byName = new Map<string, string>();
  for (const tag of metas) {
    const key = (attr(tag, "name") ?? attr(tag, "property") ?? attr(tag, "itemprop"))?.toLowerCase();
    const content = attr(tag, "content");
    if (key && content && NAMES.includes(key) && !byName.has(key)) byName.set(key, content);
  }
  for (const name of NAMES.slice(0, 3)) if (byName.has(name)) return clean(byName.get(name)!);
  const ld = jsonLdDates(html)[0];
  if (ld) return clean(ld);
  for (const name of NAMES.slice(3)) if (byName.has(name)) return clean(byName.get(name)!);
  return null;
}

// Only public web pages are fetched: http(s), a named host, no loopback, private or link-local address literal.
export function isPublicPage(url: string): boolean {
  let u: URL;
  try { u = new URL(url); } catch { return false; }
  if (u.protocol !== "https:" && u.protocol !== "http:") return false;
  const host = u.hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) return false;
  if (host.includes(":") || host.startsWith("[")) return false;
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host) || /^\d+$/.test(host) || /^0x/i.test(host)) return false;
  return host.includes(".");
}

const PAGE_BYTES = 1_000_000;
const API_BYTES = 200_000;
const TIMEOUT_MS = 10_000;
const MAX_HOPS = 3;
// Polite and honest about who is asking. No email, no key.
export const USER_AGENT = "patient-zero-trace/1.0 (research tool for tracing a claim to its first source; github.com/vs-githjk/odsc-nebius-hackathon)";

// Loopback, private, link-local, CGNAT, multicast/reserved and unspecified addresses, IPv4 and IPv6 (ULA, link-local,
// and IPv4-mapped forms of all of the above).
export function isPrivateAddress(address: string): boolean {
  const kind = isIP(address);
  if (kind === 4) {
    const [a, b, c] = address.split(".").map(Number) as [number, number, number];
    return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || (a === 192 && b === 0 && c === 0)
      || (a === 198 && (b === 18 || b === 19)) || a >= 224;
  }
  if (kind === 6) {
    const v = address.toLowerCase();
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(v)?.[1]
      ?? (/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(v)?.slice(1).map((h) => parseInt(h, 16)).flatMap((n) => [n >> 8, n & 255]).join("."));
    if (mapped) return isPrivateAddress(mapped);
    return v === "::" || v === "::1" || /^f[cd]/.test(v) || /^fe[89ab]/.test(v) || v.startsWith("ff");
  }
  return true;
}

export type Resolver = (host: string) => Promise<string[]>;
export const dnsResolver: Resolver = async (host) => (await lookup(host, { all: true })).map((entry) => entry.address);

// Reads at most `limit` bytes of the body, then cancels the stream so a huge page is never held in memory.
async function readCapped(response: Response, limit: number): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    const take = value.subarray(0, limit - total);
    chunks.push(take);
    total += take.length;
    if (total >= limit) { await reader.cancel(); break; }
  }
  return new TextDecoder().decode(Buffer.concat(chunks));
}

// A fetch that follows redirects by hand, at most MAX_HOPS, and checks every hop before it is requested: the literal
// host (isPublicPage) and then every address the name resolves to, so 127.0.0.1.nip.io and localtest.me are refused
// like 127.0.0.1. The body is read to `limit` bytes. (The check and the request resolve the name separately, so a
// DNS-rebinding host could still answer differently; the pages carry no credentials, so what leaks is only a GET.)
export function safeFetch(inner: typeof fetch, limit: number, resolve: Resolver = dnsResolver): typeof fetch {
  return (async (input: string | URL | Request, init?: RequestInit) => {
    let url = String(input);
    for (let hop = 0; hop <= MAX_HOPS; hop++) {
      if (!isPublicPage(url)) throw new Error("blocked: not a public page");
      const addresses = await resolve(new URL(url).hostname);
      if (!addresses.length || addresses.some(isPrivateAddress)) throw new Error("blocked: resolves to a private address");
      const response = await inner(url, { ...init, redirect: "manual", headers: { "user-agent": USER_AGENT, ...(init?.headers as Record<string, string> | undefined) } });
      const location = response.headers.get("location");
      if (response.status >= 300 && response.status < 400 && location) {
        await response.body?.cancel();
        url = new URL(location, url).href;
        continue;
      }
      return new Response(await readCapped(response, limit), { status: response.status, headers: { "content-type": response.headers.get("content-type") ?? "" } });
    }
    throw new Error("too many redirects");
  }) as typeof fetch;
}

// A bot challenge or consent wall is not the page: tiny, no meta tags, and asking for cookies or a captcha.
export function looksLikeChallenge(html: string): boolean {
  return html.length < 8000 && !/<meta\b[^>]*(citation_|article:|datepublished|dc\.date)/i.test(html)
    && /enable cookies|cookies must be enabled|captcha|just a moment|checking your browser|attention required|access denied/i.test(html);
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
type Part = { y: number; m?: number; d?: number };
const pad = (n: number) => String(n).padStart(2, "0");
const lastDay = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();

// "2004 Jun 15" is a full date. "2004 Jun" and "2004" are partial, and #79's dating has no partial-date notion (a
// partial date is unconfirmed there). A registry that gives only a year or a month is still evidence that the work
// was out by the END of that period, so a partial date becomes the last day of the period and is never earlier than
// the truth. Seasons and ranges ("2004 Spring", "2004 Jun 15-30") are not read.
function parseNcbi(value: string | undefined): Part | null {
  const m = /^(\d{4})(?: ([A-Za-z]{3})(?: (\d{1,2}))?)?$/.exec((value ?? "").trim());
  if (!m) return null;
  const month = m[2] ? MONTHS.indexOf(m[2].toLowerCase()) + 1 : undefined;
  if (m[2] && !month) return null;
  return { y: Number(m[1]), ...(month ? { m: month } : {}), ...(m[3] ? { d: Number(m[3]) } : {}) };
}

function earliest(parts: Part[]): string | null {
  const full = parts.filter((p): p is Required<Part> => p.m !== undefined && p.d !== undefined);
  const iso = (p: Required<Part>) => `${p.y}-${pad(p.m)}-${pad(p.d)}`;
  if (full.length) return full.map(iso).sort()[0]!;
  const partial = parts.sort((a, b) => a.y - b.y || (a.m ?? 12) - (b.m ?? 12))[0];
  if (!partial) return null;
  const m = partial.m ?? 12;
  return `${partial.y}-${pad(m)}-${pad(lastDay(partial.y, m))}`;
}

// The earlier full pubdate/epubdate from an NCBI esummary reply (db=pubmed or db=pmc), or null.
export function ncbiDate(json: unknown, id: string): string | null {
  const record = (json as { result?: Record<string, { pubdate?: string; epubdate?: string }> })?.result?.[id];
  if (!record) return null;
  const parts = [parseNcbi(record.pubdate), parseNcbi(record.epubdate)].filter((p): p is Part => p !== null);
  return earliest(parts);
}

// The earliest of published-print, published-online and issued from a Crossref work, or null.
export function crossrefDate(json: unknown): string | null {
  const message = (json as { message?: Record<string, { "date-parts"?: unknown }> })?.message;
  if (!message) return null;
  const parts: Part[] = [];
  for (const key of ["published-print", "published-online", "issued"]) {
    const row = (message[key]?.["date-parts"] as unknown[] | undefined)?.[0];
    if (Array.isArray(row) && Number.isInteger(row[0]) && row[0] > 0) {
      const [y, m, d] = row as number[];
      parts.push({ y: y!, ...(m ? { m } : {}), ...(m && d ? { d } : {}) });
    }
  }
  return earliest(parts);
}

// `budgetMs` caps the time all lookups of one dating pass may take together: once it is spent, no new request starts and
// each request's timeout is cut to what is left, so a slow pass cannot eat the time dating and page_type still need.
export type EvidenceDeps = { fetch: typeof fetch; cache: Cache; usage: UsageLog; traceId: string; resolve?: Resolver; budgetMs?: number };

// Where a page's own publication date can be found, in this order, stopping at the first date:
// 1. A scholarly registry for pages it knows by URL: PubMed (NCBI esummary), PMC (NCBI esummary, or PubMed when the
//    page names its PMID), a DOI link (Crossref).
// 2. The page's own HTML meta tags (publicationDate), and a citation_doi there goes to Crossref.
// Every request is logged as a usage row (service ncbi, crossref or fetch; 0 credits, $0) and cached by URL. A page
// that cannot be fetched, is a challenge page, or declares nothing gives null, which leaves the date to the archive
// capture. All of it is capped by the first archive capture exactly as #79 caps any publication metadata.
export function createEvidence(deps: EvidenceDeps) {
  const base: ClientDeps = { usage: deps.usage, cache: deps.cache, traceId: deps.traceId };
  const pageFetch = safeFetch(deps.fetch, PAGE_BYTES, deps.resolve);
  const apiFetch = safeFetch(deps.fetch, API_BYTES, deps.resolve);
  const until = Date.now() + (deps.budgetMs ?? 20_000);

  async function get<T>(service: "ncbi" | "crossref" | "fetch", endpoint: string, url: string, parse: (body: string) => T, via: typeof fetch): Promise<T | null> {
    const left = until - Date.now();
    if (left < 500) return null;
    try {
      const result = await send<T>({ ...base, fetch: via }, {
        service, endpoint, step: "dating", url, init: { headers: { accept: service === "fetch" ? "text/html" : "application/json" } },
        cacheInput: { service, url }, maxCredits: 0, timeoutMs: Math.min(TIMEOUT_MS, left), parse: (body) => ({ data: parse(body), credits: 0 }),
      });
      return result.data;
    } catch {
      return null;
    }
  }

  const ncbi = (db: "pubmed" | "pmc", id: string) => get("ncbi", "esummary",
    `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=${db}&id=${encodeURIComponent(id)}&retmode=json`,
    (body) => ncbiDate(JSON.parse(body), id), apiFetch);
  const crossref = (doi: string) => get("crossref", "works", `https://api.crossref.org/works/${encodeURIComponent(doi)}`,
    (body) => crossrefDate(JSON.parse(body)), apiFetch);
  const html = (url: string) => get("fetch", "page", url, (body) => {
    if (!/<\s*(?:!doctype|html|head|meta)\b/i.test(body.slice(0, 4000)) || looksLikeChallenge(body)) throw new Error("not a page");
    return body;
  }, pageFetch);

  return async function publicationFor(url: string, savedText = ""): Promise<string | null> {
    let u: URL;
    try { u = new URL(url); } catch { return null; }
    const host = u.hostname.toLowerCase();
    const pubmed = host === "pubmed.ncbi.nlm.nih.gov" ? /^\/(?:\w+\/)?(\d+)/.exec(u.pathname)?.[1] : undefined;
    const pmc = /(?:^|\.)ncbi\.nlm\.nih\.gov$/.test(host) ? /\/(?:pmc\/)?articles\/PMC(\d+)/i.exec(u.pathname)?.[1] : undefined;
    const doi = /(?:^|\.)doi\.org$/.test(host) ? /^\/(10\.\d{4,9}\/.+)$/.exec(decodeURIComponent(u.pathname))?.[1] : undefined;
    let found: string | null = null;
    if (pubmed) found = await ncbi("pubmed", pubmed);
    else if (pmc) {
      const pmid = /\bPMID:?\s*(\d{1,9})\b/.exec(savedText)?.[1];
      found = pmid ? await ncbi("pubmed", pmid) : await ncbi("pmc", pmc);
    } else if (doi) found = await crossref(doi);
    if (found) return found;
    const page = await html(url);
    if (!page) return null;
    const own = publicationDate(page);
    if (own) return own;
    const cited = /<meta\b[^>]*name\s*=\s*["']citation_doi["'][^>]*content\s*=\s*["'](10\.[^"']+)["']/i.exec(page)?.[1]
      ?? /<meta\b[^>]*content\s*=\s*["'](10\.[^"']+)["'][^>]*name\s*=\s*["']citation_doi["']/i.exec(page)?.[1];
    return cited ? crossref(cited) : null;
  };
}
