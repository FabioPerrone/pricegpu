
import fs from "fs";
import path from "path";
import {
  extractPriceBlocks,
  priceBlockToItem,
  GPU_NAME_HINTS,
  dumpPageDiagnostics,
  launchBrowser,
  normalizeGpuSlug,
  saveProviderPrices,
  withRetry,
  USER_AGENT,
} from "./_shared.js";
import type { PriceItem } from "./_shared.js";

const PROVIDER_SLUG = "paperspace";
const PRICING_URL = "https://www.paperspace.com/pricing";
const DEAL_URL = "https://console.paperspace.com/";

export async function scrape(): Promise<PriceItem[]> {
  return withRetry(async () => {
    const browser = await launchBrowser();
    const context = await browser.newContext({ userAgent: USER_AGENT });
    const page = await context.newPage();
    const items: PriceItem[] = [];

    try {
      await page.goto(PRICING_URL, { waitUntil: "domcontentloaded", timeout: 45000 });

      // Paperspace shows GPU machines with type and hourly price
      await page.waitForSelector("table, [class*='machine'], [class*='gpu'], [class*='pricing']", {
        timeout: 30000,
      }).catch(() => null);

      // The page is cards, not tables, and mixes three kinds of price: hourly
      // ("A6000 $ 1.89 / hour"), monthly ("A6000 $ 1219 / month") and starred
      // commitment rates ("A100-80G $ 1.15** / hour", 3-year term). Only an
      // unstarred hourly rate directly after the machine name is on-demand.
      const text = (await page.evaluate(() => document.body.innerText)).replace(/\s+/g, " ");
      for (const match of text.matchAll(/\b(A6000|V100)\s+\$\s*([\d.]+)\s*\/\s*hour\b/gi)) {
        const slug = normalizeGpuSlug(match[1]);
        const price = parseFloat(match[2]);
        if (!slug || isNaN(price) || price <= 0 || items.some((i) => i.gpu_slug === slug)) continue;
        items.push({
          gpu_slug: slug,
          configuration: `1x ${match[1]}`,
          price_usd_per_hour: price,
          billing: "per-hour",
          availability: "on-demand",
          region: "us-east-1",
          deal_url: DEAL_URL,
        });
      }
    } catch (err) {
      const screenshotDir = "/tmp/screenshots";
      if (!fs.existsSync(screenshotDir)) fs.mkdirSync(screenshotDir, { recursive: true });
      const ts = Date.now();
      await page.screenshot({ path: path.join(screenshotDir, `${PROVIDER_SLUG}-${ts}.png`) });
      throw err;
    } finally {
      // The specific parser above is exact when it works. When it does not,
      // read the page by meaning rather than markup before giving up.
      if (items.length === 0) {
        for (const block of await extractPriceBlocks(page, GPU_NAME_HINTS)) {
          const item = priceBlockToItem(block, { billing: "per-hour", availability: "on-demand", region: "us-east-1", dealUrl: DEAL_URL });
          if (item && !items.some((i) => i.gpu_slug === item.gpu_slug)) items.push(item);
        }
        if (items.length) console.error(`[${PROVIDER_SLUG}] specific parser found nothing; recovered ${items.length} price(s) structurally.`);
      }
      if (items.length === 0) await dumpPageDiagnostics(page, PROVIDER_SLUG);
      await browser.close();
    }

    return items;
  });
}

const items = await scrape();
saveProviderPrices(PROVIDER_SLUG, items);
