
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

// DataCrunch rebranded as Verda; datacrunch.io now redirects to verda.com.
const PROVIDER_SLUG = "datacrunch";
const PRICING_URL = "https://verda.com/pricing";
const DEAL_URL = "https://console.verda.com/";

/**
 * Rows read `1x H100 SXM5 80GB | CPUs | RAM | VRAM | $4.938/h | $2.469/h`, the
 * last two being on-demand and spot. Only 1x rows are read: larger instances
 * are linear multiples. Confidential-computing (CC) variants are skipped
 * because gpus.json has no such product.
 */
export function parseGpuRows(segments: string[]): PriceItem[] {
  const start = segments.indexOf("GPU instances");
  if (start < 0) return [];

  const best = new Map<string, PriceItem>();
  for (let i = start; i < segments.length; i++) {
    const m = segments[i].match(/^1x\s+(.+)$/);
    if (!m || /\bCC\b/.test(m[1])) continue;
    const slug = normalizeGpuSlug(m[1]);
    if (!slug) continue;

    const priceAt = segments.slice(i + 1, i + 8).findIndex((s) => parseDollars(s) !== null);
    if (priceAt < 0) continue;
    const prices: Array<[PriceItem["availability"], number | null]> = [
      ["on-demand", parseDollars(segments[i + 1 + priceAt])],
      ["spot", parseDollars(segments[i + 2 + priceAt])],
    ];
    for (const [availability, price] of prices) {
      if (price === null) continue;
      const key = `${slug}|${availability}`;
      const existing = best.get(key);
      if (existing && existing.price_usd_per_hour <= price) continue;
      best.set(key, {
        gpu_slug: slug,
        configuration: `1x ${m[1]}`,
        price_usd_per_hour: price,
        billing: "per-hour",
        availability,
        region: "eu-central",
        deal_url: DEAL_URL,
      });
    }
  }
  return [...best.values()];
}

export async function scrape(): Promise<PriceItem[]> {
  const html = await withRetry(() => fetchPage(PRICING_URL));
  const items = keepPlausiblePrices(PROVIDER_SLUG, parseGpuRows(htmlSegments(html)));
  if (!items.length) console.error(`[${PROVIDER_SLUG}] no GPU rows matched in ${html.length} bytes from ${PRICING_URL}`);
  return items;
}

const items = await scrape();
saveProviderPrices(PROVIDER_SLUG, items);
