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

const PROVIDER_SLUG = "vast-ai";
const PRICING_URL = "https://vast.ai/pricing";
const DEAL_URL = "https://cloud.vast.ai/";

export async function scrape(): Promise<PriceItem[]> {
  return withRetry(async () => {
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ userAgent: USER_AGENT });
    const page = await context.newPage();
    const items: PriceItem[] = [];

    try {
      await page.goto(PRICING_URL, { waitUntil: "networkidle", timeout: 60000 });

      await page.waitForSelector("table, [class*='pricing'], [class*='gpu']", {
        timeout: 30000,
      }).catch(() => null);

      // Vast.ai typically shows a pricing table with GPU type and $/hr columns
      const rows = await page.$$eval("table tbody tr", (trs) =>
        trs.map((tr) => {
          const cells = Array.from(tr.querySelectorAll("td, th"));
          return cells.map((c) => (c as HTMLElement).innerText.trim());
        })
      );

      for (const cells of rows) {
        if (cells.length < 2) continue;
        const gpuName = cells[0];
        const priceText = cells.find((c) => /\$[\d.]+/.test(c)) ?? "";
        const priceMatch = priceText.match(/\$([\d.]+)/);
        if (!priceMatch) continue;
        const price = parseFloat(priceMatch[1]);
        if (isNaN(price) || price <= 0) continue;
        const slug = normalizeGpuSlug(gpuName);
        if (!slug) continue;

        items.push({
          gpu_slug: slug,
          configuration: `1x ${gpuName}`,
          price_usd_per_hour: price,
          billing: "per-hour",
          availability: "spot",
          region: "us-east",
          deal_url: DEAL_URL,
        });
      }

      // Fallback: scan page text for GPU/price pairs
      if (items.length === 0) {
        const priceBlocks = await page.$$eval(
          "[class*='price'], [class*='gpu'], [class*='card']",
          (els) => els.map((el) => (el as HTMLElement).innerText)
        );

        for (const block of priceBlocks) {
          const gpuMatch = block.match(/((?:RTX|A100|H100|L40|T4|V100|A10)\s*\w*)/i);
          const priceMatch = block.match(/\$([\d.]+)\s*\/\s*hr/i);
          if (!gpuMatch || !priceMatch) continue;
          const price = parseFloat(priceMatch[1]);
          if (isNaN(price) || price <= 0) continue;
          const slug = normalizeGpuSlug(gpuMatch[1].trim());
          if (!slug) continue;

          items.push({
            gpu_slug: slug,
            configuration: `1x ${gpuMatch[1].trim()}`,
            price_usd_per_hour: price,
            billing: "per-hour",
            availability: "spot",
            region: "us-east",
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
