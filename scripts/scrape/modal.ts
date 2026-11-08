
import {
  fetchPage,
  htmlSegments,
  keepPlausiblePrices,
  normalizeGpuSlug,
  saveProviderPrices,
  withRetry,
} from "./_shared.js";
import type { PriceItem } from "./_shared.js";

const PROVIDER_SLUG = "modal";
const PRICING_URL = "https://modal.com/pricing";
const DEAL_URL = "https://modal.com/";

/**
 * Rows render as `Nvidia H100 SXM5 | $ | 0.001097 | <odometer digits> | / sec`.
 * The per-hour/per-second toggle defaults to seconds, so the unit is read from
 * the row rather than assumed.
 */
export function parseGpuRows(segments: string[]): PriceItem[] {
  const items: PriceItem[] = [];
  for (let i = 0; i < segments.length; i++) {
    if (!/^nvidia\s/i.test(segments[i]) || segments[i + 1] !== "$") continue;
    const value = parseFloat(segments[i + 2]);
    const unit = segments.slice(i + 3, i + 20).find((s) => /^\/\s*(sec|hr|hour)/i.test(s));
    const slug = normalizeGpuSlug(segments[i]);
    if (!slug || !unit || !Number.isFinite(value)) continue;

    const hourly = /sec/i.test(unit) ? value * 3600 : value;
    items.push({
      gpu_slug: slug,
      configuration: `1x ${segments[i]}`,
      price_usd_per_hour: Number(hourly.toFixed(4)),
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
