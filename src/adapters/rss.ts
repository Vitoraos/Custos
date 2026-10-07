// News headlines via RSS. Output is flagged untrusted: true —
// it can never write memories (poisoning guard, §5.E).
import Parser from "rss-parser";
import { TtlCache } from "./http.js";

export interface Headline {
  title: string;
  link?: string;
  publishedAt?: string;
}
const FEED =
  process.env.RSS_FEED_URL ?? "https://feeds.bbci.co.uk/news/rss.xml";
const cache = new TtlCache<{ items: Headline[]; fetchedAt: string }>(600_000);
const parser: Parser<unknown, Headline> = new Parser({ timeout: 8000 });

export async function getHeadlines(
  limit = 5,
): Promise<{ items: Headline[]; fetchedAt: string; source: string }> {
  const hit = cache.get(FEED);
  if (hit) return { ...hit, source: FEED };
  const feed = await parser.parseURL(FEED);
  const items = (feed.items ?? [])
    .slice(0, Math.min(Math.max(limit, 1), 10))
    .map((i) => ({
      title: (i.title ?? "").slice(0, 200),
      link: i.link,
      publishedAt: i.isoDate ?? i.pubDate,
    }));
  const out = { items, fetchedAt: new Date().toISOString(), source: FEED };
  cache.set(FEED, out);
  return out;
}
