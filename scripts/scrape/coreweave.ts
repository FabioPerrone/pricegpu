
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

const PROVIDER_SLUG = "coreweave";
const PRICING_URL = "https://www.coreweave.com/pricing";
const DEAL_URL = "https://cloud.coreweave.com/";

// CoreWeave's plain "NVIDIA A100" is its 80GB NVLink (SXM) node.
const PAGE_LABELS: Record<string, string> = { "NVIDIA A100": "a100-80gb-sxm" };

const REGION_BY_HEADING: Record<string, string> = { "north america": "us-east", europe: "eu-central" };

/**
 * Each row is `name | GPU count | specs… | price | name | On-Demand Price: |
 * $x | / Hour | Spot Price: | $y`. Prices are for the whole node, so they are
 * divided by the GPU count; the page's own "single GPU" column confirms that.
 */
export function parseGpuRows(segments: string[]): PriceItem[] {
  const items: PriceItem[] = [];
  let region: string | undefined;

  for (let i = 0; i < segments.length; i++) {
    const heading = segments[i].match(/^REGION:\s*(.+)$/i);
    if (heading) region = REGION_BY_HEADING[heading[1].trim().toLowerCase()];
    if (segments[i] !== "On-Demand Price:" || !region) continue;

    const name = segments[i - 1];
    const nameAt = segments.slice(Math.max(0, i - 12), i - 1).lastIndexOf(name);
    if (nameAt < 0) continue;
    const gpuCount = Number(segments[Math.max(0, i - 12) + nameAt + 1]);
    const slug = PAGE_LABELS[name] ?? normalizeGpuSlug(name);
    if (!slug || !Number.isInteger(gpuCount) || gpuCount < 1 || gpuCount > 16) continue;

    const spotAt = segments.indexOf("Spot Price:", i);
    const prices: Array<[PriceItem["availability"], number | null]> = [
      ["on-demand", parseDollars(segments[i + 1])],
      ["spot", spotAt > 0 && spotAt < i + 6 ? parseDollars(segments[spotAt + 1]) : null],
    ];
    for (const [availability, nodePrice] of prices) {
      if (nodePrice === null) continue;
      items.push({
        gpu_slug: slug,
        configuration: `${gpuCount}x ${name}`,
        price_usd_per_hour: Number((nodePrice / gpuCount).toFixed(4)),
        billing: "per-hour",
        availability,
        region,
        deal_url: DEAL_URL,
      });
    }
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
