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

const PROVIDER_SLUG = "lambda-labs";
const PRICING_URL = "https://lambdalabs.com/service/gpu-cloud/pricing";
const DEAL_URL = "https://lambdalabs.com/service/gpu-cloud";

export async function scrape(): Promise<PriceItem[]> {
  return withRetry(async () => {
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ userAgent: USER_AGENT });
    const page = await context.newPage();
    const items: PriceItem[] = [];

    try {
      await page.goto(PRICING_URL, { waitUntil: "networkidle", timeout: 60000 });

      // Lambda Labs has a pricing table with GPU type, VRAM, #GPUs, and price columns
      await page.waitForSelector("table, [class*='pricing-table'], [class*='gpu']", {
        timeout: 30000,
      }).catch(() => null);

      const rows = await page.$$eval("table tbody tr", (trs) =>
        trs.map((tr) => {
          const cells = Array.from(tr.querySelectorAll("td"));
          return cells.map((c) => (c as HTMLElement).innerText.trim());
        })
      );

      for (const cells of rows) {
        if (cells.length < 2) continue;
        const rawName = cells[0];
        const priceText = cells.find((c) => /\$[\d.]+/.test(c)) ?? "";
        const priceMatch = priceText.match(/\$([\d.]+)/);
        if (!priceMatch) continue;
        const price = parseFloat(priceMatch[1]);
        if (isNaN(price) || price <= 0) continue;

        // Lambda shows "1x A100 80GB SXM4" style configurations
        const countMatch = rawName.match(/^(\d+)x?\s+(.+)/i);
        const count = countMatch ? parseInt(countMatch[1]) : 1;
        const gpuName = countMatch ? countMatch[2].trim() : rawName;
        const slug = normalizeGpuSlug(gpuName);
        if (!slug) continue;

        const isReserved = cells.some((c) => /reserved/i.test(c));

        items.push({
          gpu_slug: slug,
          configuration: `${count}x ${gpuName}`,
          price_usd_per_hour: price,
          billing: "per-hour",
          availability: isReserved ? "reserved" : "on-demand",
          region: "us-west-1",
          deal_url: DEAL_URL,
        });
      }

      // Fallback: look for pricing cards
      if (items.length === 0) {
        const cards = await page.$$eval(
          "[class*='instance'], [class*='gpu-card'], [class*='plan']",
          (els) => els.map((el) => (el as HTMLElement).innerText)
        );

        for (const text of cards) {
          const gpuMatch = text.match(/((?:A100|H100|H200|L40|RTX|V100|A10|T4)\s*[\w\s]*?)(?:\n|\$)/i);
          const priceMatch = text.match(/\$([\d.]+)\s*(?:\/\s*hr|per hour)?/i);
          if (!gpuMatch || !priceMatch) continue;
          const price = parseFloat(priceMatch[1]);
          if (isNaN(price) || price <= 0) continue;
          const gpuName = gpuMatch[1].trim();
          const slug = normalizeGpuSlug(gpuName);
          if (!slug) continue;

          items.push({
            gpu_slug: slug,
            configuration: `1x ${gpuName}`,
            price_usd_per_hour: price,
            billing: "per-hour",
            availability: "on-demand",
            region: "us-west-1",
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
