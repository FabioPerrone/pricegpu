import { chromium } from "playwright";
import fs from "fs";
import path from "path";
import {
  PriceItem,
  normalizeGpuSlug,
  saveProviderPrices,
  withRetry,
  USER_AGENT,
} from "./_shared.js";

const PROVIDER_SLUG = "paperspace";
const PRICING_URL = "https://www.paperspace.com/pricing";
const DEAL_URL = "https://console.paperspace.com/";

export async function scrape(): Promise<PriceItem[]> {
  return withRetry(async () => {
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ userAgent: USER_AGENT });
    const page = await context.newPage();
    const items: PriceItem[] = [];

    try {
      await page.goto(PRICING_URL, { waitUntil: "networkidle", timeout: 60000 });

      // Paperspace shows GPU machines with type and hourly price
      await page.waitForSelector("table, [class*='machine'], [class*='gpu'], [class*='pricing']", {
        timeout: 30000,
      }).catch(() => null);

      // Try table rows first
      const rows = await page.$$eval("table tbody tr", (trs) =>
        trs.map((tr) => {
          const cells = Array.from(tr.querySelectorAll("td"));
          return cells.map((c) => (c as HTMLElement).innerText.trim());
        })
      );

      for (const cells of rows) {
        if (cells.length < 2) continue;
        // Paperspace often shows machine name like "A100-80G" and price "$2.30/hr"
        const rawName = cells[0];
        const priceText = cells.find((c) => /\$[\d.]+/.test(c)) ?? "";
        const priceMatch = priceText.match(/\$([\d.]+)/);
        if (!priceMatch) continue;
        const price = parseFloat(priceMatch[1]);
        if (isNaN(price) || price <= 0) continue;

        // Paperspace uses machine names like "A100-80G", "RTX4000", "P5000"
        const slug = normalizeGpuSlug(rawName.replace(/-/g, " ").replace(/(\d+)G\b/, "$1GB"));
        if (!slug) continue;

        const isSpot = cells.some((c) => /spot/i.test(c));

        items.push({
          gpu_slug: slug,
          configuration: `1x ${rawName}`,
          price_usd_per_hour: price,
          billing: "per-hour",
          availability: isSpot ? "spot" : "on-demand",
          region: "us-east-1",
          deal_url: DEAL_URL,
        });
      }

      // Fallback: look for machine cards with GPU names and prices
      if (items.length === 0) {
        const cards = await page.$$eval(
          "[class*='machine-card'], [class*='gpu-card'], [class*='plan-card'], [class*='instance']",
          (els) => els.map((el) => (el as HTMLElement).innerText)
        );

        for (const text of cards) {
          const gpuMatch = text.match(/((?:A100|H100|RTX|V100|P5000|P6000|A4000|A5000|A6000|A40|L40|RTX4000|RTX5000)\s*[\w\s-]*?)(?:\n|\$)/i);
          const priceMatch = text.match(/\$([\d.]+)\s*(?:\/\s*hr|\/hr|per hour)?/i);
          if (!gpuMatch || !priceMatch) continue;
          const price = parseFloat(priceMatch[1]);
          if (isNaN(price) || price <= 0) continue;
          const gpuName = gpuMatch[1].trim();
          const slug = normalizeGpuSlug(gpuName.replace(/-/g, " ").replace(/(\d+)G\b/, "$1GB"));
          if (!slug) continue;

          items.push({
            gpu_slug: slug,
            configuration: `1x ${gpuName}`,
            price_usd_per_hour: price,
            billing: "per-hour",
            availability: "on-demand",
            region: "us-east-1",
            deal_url: DEAL_URL,
          });
        }
      }
    } catch (err) {
      const screenshotDir = "/tmp/screenshots";
      if (!fs.existsSync(screenshotDir)) fs.mkdirSync(screenshotDir, { recursive: true });
      const ts = Date.now();
      await page.screenshot({ path: path.join(screenshotDir, `${PROVIDER_SLUG}-${ts}.png`) });
      throw err;
    } finally {
      await browser.close();
    }

    return items;
  });
}

const items = await scrape();
saveProviderPrices(PROVIDER_SLUG, items);
