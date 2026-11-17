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

function jsonLdDates(html: string): string[] {
  const found: string[] = [];
  const walk = (node: unknown) => {
    if (Array.isArray(node)) node.forEach(walk);
    else if (node && typeof node === "object") {
      for (const [key, value] of Object.entries(node)) {
        if (key === "datePublished" && typeof value === "string") found.push(value);
        else walk(value);
      }
    }
  };
  for (const m of html.matchAll(/<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try { walk(JSON.parse(m[1]!)); } catch { /* malformed JSON-LD is no evidence */ }
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
  if (host.includes(":")) return false;
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) return false;
  return host.includes(".");
}

const MAX_CHARS = 600_000;
const TIMEOUT_MS = 10_000;

// The page's own publication metadata, or null. A page that will not load, is not HTML or declares nothing gives null,
// which leaves the date to the archive capture exactly as before.
export async function fetchPublication(url: string, fetchPage: typeof fetch): Promise<string | null> {
  if (!isPublicPage(url)) return null;
  try {
    const response = await fetchPage(url, { headers: { accept: "text/html" }, signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!response.ok || !/html/i.test(response.headers.get("content-type") ?? "")) return null;
    return publicationDate((await response.text()).slice(0, MAX_CHARS));
  } catch {
    return null;
  }
}
