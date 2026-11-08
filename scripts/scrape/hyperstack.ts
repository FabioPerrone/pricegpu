
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

const PROVIDER_SLUG = "hyperstack";
const PRICING_URL = "https://www.hyperstack.cloud/gpu-pricing";
const DEAL_URL = "https://infrahub.hyperstack.cloud/";

// The page lists SXM and NVLink models separately, so its unqualified names
// are the PCIe cards (its own spot table calls the same card "H100 PCIe").
const PAGE_LABELS: Record<string, string> = {
  "NVIDIA H100": "h100-pcie",
  "NVIDIA A100": "a100-80gb-pcie",
  "NVIDIA A100 SXM": "a100-80gb-sxm",
};

function parseSection(
  segments: string[],
  start: number,
  end: number,
  availability: PriceItem["availability"],
): PriceItem[] {
  const items: PriceItem[] = [];
  for (let i = start; i < end; i++) {
    if (!/^NVIDIA\s/.test(segments[i])) continue;
    // A row's price follows its name after at most the three spec columns.
    const priceAt = segments.slice(i + 1, i + 6).findIndex((s) => parseDollars(s) !== null);
    if (priceAt < 0) continue;
    const price = parseDollars(segments[i + 1 + priceAt])!;
    const slug = PAGE_LABELS[segments[i]] ?? normalizeGpuSlug(segments[i]);
    if (!slug) continue;
    items.push({
      gpu_slug: slug,
      configuration: `1x ${segments[i]}`,
      price_usd_per_hour: price,
      billing: "per-minute",
      availability,
      region: "us-east",
      deal_url: DEAL_URL,
    });
  }
  return items;
}

export function parseGpuRows(segments: string[]): PriceItem[] {
  const onDemand = segments.indexOf("On-Demand GPU");
  const reservation = segments.indexOf("Reservation", onDemand);
  const spot = segments.indexOf("Spot VM", reservation);
  const cpu = segments.indexOf("On-Demand CPU", spot);
  if (onDemand < 0 || reservation < 0) return [];

  return [
    ...parseSection(segments, onDemand, reservation, "on-demand"),
    // "Starting from" reservation prices need a term commitment and are not
    // comparable to hourly rates, so that section is skipped.
    ...(spot > 0 && cpu > spot ? parseSection(segments, spot, cpu, "spot") : []),
  ];
}

export async function scrape(): Promise<PriceItem[]> {
  const html = await withRetry(() => fetchPage(PRICING_URL));
  const items = keepPlausiblePrices(PROVIDER_SLUG, parseGpuRows(htmlSegments(html)));
  if (!items.length) console.error(`[${PROVIDER_SLUG}] no GPU rows matched in ${html.length} bytes from ${PRICING_URL}`);
  return items;
}

const items = await scrape();
saveProviderPrices(PROVIDER_SLUG, items);
