import { normalizeGpuSlug, saveProviderPrices, PriceItem, withRetry, USER_AGENT } from "./_shared.js";

const PROVIDER_SLUG = "lambda";
const PRICING_URL = "https://lambdalabs.com/service/gpu-cloud";
const DEAL_URL = "https://lambdalabs.com/?utm_source=pricegpu";

export async function scrape(): Promise<PriceItem[]> {
  return withRetry(async () => {
    const items: PriceItem[] = [];
    console.log(`[${PROVIDER_SLUG}] Scraper stub - configure with API`);
    return items;
  });
}

if (import.meta.main) {
  scrape().then(items => saveProviderPrices(PROVIDER_SLUG, items)).catch(console.error);
}
