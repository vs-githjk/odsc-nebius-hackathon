import { z } from "zod";
import { ClientError, send, type ClientDeps, type ClientRequest, type Result } from "./http.ts";

const BASE_URL = "https://api.tavily.com";
const TIMEOUT_MS = 60_000;
// Pay-as-you-go list price from the Tavily credits page, 2026-11-01.
const USD_PER_CREDIT = 0.008;
// From spike/tavily-probe.md: basic search 1 credit, basic extract 1 credit per 5 urls.
const SEARCH_MAX_CREDITS = 1;
const URLS_PER_EXTRACT_CREDIT = 5;

const Usage = z.looseObject({ credits: z.number() }).optional();

const SearchResponse = z.looseObject({
  query: z.string().optional(),
  results: z.array(
    z.looseObject({
      url: z.string(),
      title: z.string().nullable().optional(),
      content: z.string().nullable().optional(),
      score: z.number().optional(),
      raw_content: z.string().nullable().optional(),
      published_date: z.string().nullable().optional(),
    }),
  ),
  usage: Usage,
});
export type SearchResponse = z.infer<typeof SearchResponse>;

const ExtractResponse = z.looseObject({
  results: z.array(
    z.looseObject({
      url: z.string(),
      title: z.string().nullable().optional(),
      raw_content: z.string().nullable().optional(),
    }),
  ),
  failed_results: z.array(z.looseObject({ url: z.string() })).optional(),
  usage: Usage,
});
export type ExtractResponse = z.infer<typeof ExtractResponse>;

export type SearchArgs = {
  query: string;
  exactMatch: boolean;
  endDate?: string;
  startDate?: string;
  includeRawContent: false | "text" | "markdown";
  includePublishedDate: boolean;
  maxResults: number;
  excludeDomains?: string[];
  includeDomains?: string[];
  filterByPublishedDate?: boolean;
};

export type ExtractArgs = { urls: string[]; query?: string; format: "markdown" | "text" };

export type TavilySender = <T>(deps: ClientDeps, request: ClientRequest<T>) => Promise<Result<T>>;

export function createTavily(deps: ClientDeps & { apiKey?: string }, sender: TavilySender = send) {
  const apiKey = deps.apiKey ?? process.env.TAVILY_API_KEY ?? "";

  function post<T>(endpoint: "search" | "extract", body: object, maxCredits: number, step: string, schema: z.ZodType<T & { usage?: { credits: number } | undefined }>) {
    if (!apiKey) throw new ClientError("not_configured", "TAVILY_API_KEY is not set");
    return sender<T>(deps, {
      service: "tavily",
      endpoint,
      step,
      url: `${BASE_URL}/${endpoint}`,
      init: {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
      cacheInput: { service: "tavily", endpoint, body },
      maxCredits,
      timeoutMs: TIMEOUT_MS,
      usdPerCredit: USD_PER_CREDIT,
      secrets: [apiKey],
      parse: (text) => {
        const data = schema.parse(JSON.parse(text));
        return { data, credits: data.usage?.credits ?? maxCredits };
      },
    });
  }

  return {
    async search(args: SearchArgs, { step = "search" }: { step?: string } = {}): Promise<Result<SearchResponse>> {
      const body = {
        query: args.query,
        exact_match: args.exactMatch,
        ...(args.endDate !== undefined && { end_date: args.endDate }),
        ...(args.startDate !== undefined && { start_date: args.startDate }),
        include_raw_content: args.includeRawContent,
        include_published_date: args.includePublishedDate,
        max_results: args.maxResults,
        ...(args.excludeDomains?.length && { exclude_domains: args.excludeDomains }),
        ...(args.includeDomains?.length && { include_domains: args.includeDomains }),
        ...(args.filterByPublishedDate !== undefined && { filter_by_published_date: args.filterByPublishedDate }),
        include_usage: true,
      };
      return post("search", body, SEARCH_MAX_CREDITS, step, SearchResponse);
    },

    async extract(args: ExtractArgs, { step = "extract" }: { step?: string } = {}): Promise<Result<ExtractResponse>> {
      const body = {
        urls: args.urls,
        ...(args.query !== undefined && { query: args.query }),
        format: args.format,
        include_usage: true,
      };
      return post("extract", body, Math.ceil(args.urls.length / URLS_PER_EXTRACT_CREDIT), step, ExtractResponse);
    },
  };
}
