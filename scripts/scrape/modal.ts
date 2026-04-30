import { normalizeGpuSlug, saveProviderPrices, PriceItem, withRetry, USER_AGENT } from "./_shared.js";

const PROVIDER_SLUG = "modal";
const PRICING_URL = "https://modal.com/pricing";
const DEAL_URL = "https://modal.com/";

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
