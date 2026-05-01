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

const PROVIDER_SLUG = "fal";
const PRICING_URL = "https://fal.ai/pricing";
const DEAL_URL = "https://fal.ai/";

export async function scrape(): Promise<PriceItem[]> {
  return withRetry(async () => {
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ userAgent: USER_AGENT });
    const page = await context.newPage();
    const items: PriceItem[] = [];

    try {
      await page.goto(PRICING_URL, { waitUntil: "networkidle", timeout: 60000 });

      // fal.ai shows GPU machine types with per-second or per-millisecond pricing
      await page.waitForSelector("table, [class*='gpu'], [class*='machine'], [class*='pricing']", {
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
        if (/cpu/i.test(rawName) && !/gpu/i.test(rawName)) continue;

        const priceText = cells.find((c) => /\$[\d.]+/.test(c)) ?? "";
        const priceMatch = priceText.match(/\$([\d.]+)\s*\/\s*(ms|millisecond|second|sec|s|hr|hour)/i);

        let price: number;
        let billing: "per-second" | "per-minute" | "per-hour" = "per-second";

        if (priceMatch) {
          price = parseFloat(priceMatch[1]);
          const unit = priceMatch[2].toLowerCase();
          if (unit === "ms" || unit === "millisecond") {
            price = price * 3600 * 1000;
          } else if (unit === "second" || unit === "sec" || unit === "s") {
            price = price * 3600;
          } else {
            billing = "per-hour";
          }
        } else {
          const simpleMatch = priceText.match(/\$([\d.]+)/);
          if (!simpleMatch) continue;
          price = parseFloat(simpleMatch[1]);
          billing = "per-hour";
        }

        if (isNaN(price) || price <= 0) continue;

        const slug = normalizeGpuSlug(rawName);
        if (!slug) continue;

        items.push({
          gpu_slug: slug,
          configuration: `1x ${rawName}`,
          price_usd_per_hour: price,
          billing,
          availability: "on-demand",
          region: "us-east",
          deal_url: DEAL_URL,
        });
      }

      // Fallback: machine type listing blocks
      if (items.length === 0) {
        const blocks = await page.$$eval(
          "[class*='machine'], [class*='gpu-type'], [class*='hardware']",
          (els) => els.map((el) => (el as HTMLElement).innerText)
        );

        for (const text of blocks) {
          const gpuMatch = text.match(/((?:A100|H100|T4|A10|L40|RTX|A40)\s*[\w\s]*?)(?:\n|\$)/i);
          const priceMatch = text.match(/\$([\d.]+)\s*\/\s*(ms|second|s)\b/i);
          if (!gpuMatch || !priceMatch) continue;
          let price = parseFloat(priceMatch[1]);
          const unit = priceMatch[2].toLowerCase();
          if (unit === "ms") price = price * 3600 * 1000;
          else price = price * 3600;
          if (isNaN(price) || price <= 0) continue;
          const gpuName = gpuMatch[1].trim();
          const slug = normalizeGpuSlug(gpuName);
          if (!slug) continue;

          items.push({
            gpu_slug: slug,
            configuration: `1x ${gpuName}`,
            price_usd_per_hour: price,
            billing: "per-second",
            availability: "on-demand",
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
