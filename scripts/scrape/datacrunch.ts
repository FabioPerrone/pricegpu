import { saveProviderPrices, PriceItem, withRetry } from "./_shared.js";
const PROVIDER_SLUG = "datacrunch";
export async function scrape(): Promise<PriceItem[]> {
  return withRetry(async () => {
    console.log(`[${PROVIDER_SLUG}] Scraper stub`);
    return [];
  });
}
if (import.meta.main) scrape().then(items => saveProviderPrices(PROVIDER_SLUG, items)).catch(console.error);
