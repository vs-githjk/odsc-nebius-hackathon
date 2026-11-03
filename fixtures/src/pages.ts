import type { DateInfo } from "../../packages/pz/src/schema/index.ts";

// Invented pages for one invented claim. Every domain is *.example; no real outlet, study or person.
export type Page = { url: string; title: string; date: string; dateKind: DateInfo["kind"]; pageType: string; span: string };

export const PAGES: Record<string, Page> = {
  "keeper-log": {
    url: "https://harborzoo.example/keeper-log-2019", title: "Harbor Zoo keeper log, spring 2019", date: "2019-04-30", dateKind: "published",
    pageType: "dataset", span: "The adult penguins napped a median of 14 times a day during daylight hours.",
  },
  "zoo-faq": {
    url: "https://harborzoo.example/faq", title: "Harbor Zoo visitor questions", date: "2019-05-02", dateKind: "existed_by",
    pageType: "other", span: "Harbor Zoo penguins nap 41 times a day, so you will often see them resting.",
  },
  "zoo-report": {
    url: "https://harborzoo.example/annual-report-2019", title: "Harbor Zoo annual report 2019", date: "2019-12-15", dateKind: "published",
    pageType: "report", span: "Daylight observations found that our adult penguins nap about 14 times a day.",
  },
  "coast-news": {
    url: "https://coastgazette.example/2020/02/penguin-naps", title: "Harbor Zoo penguins nap 14 times a day", date: "2020-02-10", dateKind: "published",
    pageType: "news", span: "Harbor Zoo penguins nap 14 times a day, according to the zoo's annual report.",
  },
  "coast-news-v2": {
    url: "https://coastgazette.example/2020/02/penguin-naps?v=2", title: "Harbor Zoo penguins nap 14 times a day", date: "2020-02-12", dateKind: "published",
    pageType: "news", span: "Harbor Zoo penguins nap 14 times a day, twice as often as the zoo's seals, the zoo said.",
  },
  "trivia-blog": {
    url: "https://funfactsdaily.example/penguin-naps", title: "Fun Facts Daily: penguin naps", date: "2021-06-01", dateKind: "existed_by",
    pageType: "blog", span: "Penguins nap 14 times a day, twice as often as seals, says a marine study.",
  },
  "social-post": {
    url: "https://chirp.example/status/1001", title: "Post on Chirp", date: "2022-08-20", dateKind: "published",
    pageType: "social", span: "penguins nap 14 times a day, twice as often as the zoo's seals!!",
  },
  "myth-page": {
    url: "https://checkdesk.example/penguin-nap-myth", title: "Check Desk: penguin naps", date: "2023-03-01", dateKind: "published",
    pageType: "news", span: "It is a myth that all penguins nap 14 times a day.",
  },
};
