
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

const PROVIDER_SLUG = "fal";
const PRICING_URL = "https://fal.ai/pricing";
const DEAL_URL = "https://fal.ai/";

/**
 * Cards read `H100 | VRAM | 80 GB | List Price | $4.50/h | As low as | $2.49/h`.
 * The list price is the rate anyone pays; "as low as" depends on a sales
 * agreement, so it is not recorded.
 */
export function parseGpuRows(segments: string[]): PriceItem[] {
  const items: PriceItem[] = [];
  for (let i = 3; i < segments.length; i++) {
    if (segments[i] !== "List Price" || segments[i - 2] !== "VRAM") continue;
    const price = parseDollars(segments[i + 1]);
    const name = segments[i - 3];
    const slug = normalizeGpuSlug(name);
    if (price === null || !slug) continue;
    items.push({
      gpu_slug: slug,
      configuration: `1x ${name}`,
      price_usd_per_hour: price,
      billing: "per-second",
      availability: "on-demand",
      region: "us-east",
      deal_url: DEAL_URL,
    });
  }
  return items;
}

export async function scrape(): Promise<PriceItem[]> {
  const html = await withRetry(() => fetchPage(PRICING_URL));
  const items = keepPlausiblePrices(PROVIDER_SLUG, parseGpuRows(htmlSegments(html)));
  if (!items.length) console.error(`[${PROVIDER_SLUG}] no GPU rows matched in ${html.length} bytes from ${PRICING_URL}`);
  return items;
}

const items = await scrape();
saveProviderPrices(PROVIDER_SLUG, items);
