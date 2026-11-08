
import {
  fetchPage,
  htmlSegments,
  keepPlausiblePrices,
  normalizeGpuSlug,
  parseDollars,
  saveProviderPrices,
  withRetry,
} from "./_shared.js";
import type { PriceItem } from "./_shared.js";

const PROVIDER_SLUG = "tensordock";
const PRICING_URL = "https://www.tensordock.com/cloud-gpus.html";
const DEAL_URL = "https://dashboard.tensordock.com/deploy";

/**
 * The page stamps its table with a "Last Updated" date. Copying a table the
 * provider itself dates years back under today's scraped_at would present old
 * numbers as fresh and defeat the staleness check, so it counts as no data.
 */
const MAX_PAGE_AGE_DAYS = Number(process.env.TENSORDOCK_MAX_PAGE_AGE_DAYS ?? 365);

export function pageAgeDays(segments: string[], now = Date.now()): number | null {
  const m = segments.join(" ").match(/Last Updated:\s*([A-Z][a-z]+ \d{1,2}, \d{4})/);
  const updated = m ? Date.parse(m[1]) : NaN;
  return Number.isNaN(updated) ? null : Math.floor((now - updated) / 86_400_000);
}

/** Rows are `GPU name | $price`, directly after the "Typical hourly price" header. */
export function parseGpuRows(segments: string[]): PriceItem[] {
  const start = segments.findIndex((s) => /^Typical hourly price/i.test(s));
  if (start < 0) return [];

  const items: PriceItem[] = [];
  for (let i = start + 1; i + 1 < segments.length; i += 2) {
    const price = parseDollars(segments[i + 1]);
    if (price === null) break;
    const slug = normalizeGpuSlug(segments[i]);
    if (!slug) continue;
    items.push({
      gpu_slug: slug,
      configuration: `1x ${segments[i]}`,
      price_usd_per_hour: price,
      billing: "per-hour",
      availability: "on-demand",
      region: "us-east",
      deal_url: DEAL_URL,
    });
  }
  return items;
}

export async function scrape(): Promise<PriceItem[]> {
  const html = await withRetry(() => fetchPage(PRICING_URL));
  const segments = htmlSegments(html);

  const age = pageAgeDays(segments);
  if (age === null || age > MAX_PAGE_AGE_DAYS) {
    console.error(
      `[${PROVIDER_SLUG}] price table is ${age ?? "of unknown age"}${age === null ? "" : " days old"} ` +
        `(limit ${MAX_PAGE_AGE_DAYS}); refusing to record it as current.`
    );
    return [];
  }

  const items = keepPlausiblePrices(PROVIDER_SLUG, parseGpuRows(segments));
  if (!items.length) console.error(`[${PROVIDER_SLUG}] no GPU rows matched in ${html.length} bytes from ${PRICING_URL}`);
  return items;
}

const items = await scrape();
saveProviderPrices(PROVIDER_SLUG, items);
