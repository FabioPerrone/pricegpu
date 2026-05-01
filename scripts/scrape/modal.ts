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

const PROVIDER_SLUG = "modal";
const PRICING_URL = "https://modal.com/pricing";
const DEAL_URL = "https://modal.com/";

export async function scrape(): Promise<PriceItem[]> {
  return withRetry(async () => {
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ userAgent: USER_AGENT });
    const page = await context.newPage();
    const items: PriceItem[] = [];

    try {
      await page.goto(PRICING_URL, { waitUntil: "networkidle", timeout: 60000 });

      // Modal uses a table with GPU type, VRAM, and price per GPU-hour/second
      await page.waitForSelector("table, [class*='pricing'], [class*='gpu']", {
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
        // Modal pricing is per second; we extract $/hr equivalent
        const priceText = cells.find((c) => /\$[\d.]+/.test(c)) ?? "";
        const priceMatch = priceText.match(/\$([\d.]+)\s*\/\s*(s|sec|second|hr|hour)/i);
        if (!priceMatch) {
          const simpleMatch = priceText.match(/\$([\d.]+)/);
          if (!simpleMatch) continue;
          const price = parseFloat(simpleMatch[1]);
          if (isNaN(price) || price <= 0) continue;
          const slug = normalizeGpuSlug(rawName);
          if (!slug) continue;

          items.push({
            gpu_slug: slug,
            configuration: `1x ${rawName}`,
            price_usd_per_hour: price,
            billing: "per-second",
            availability: "on-demand",
            region: "us-east",
            deal_url: DEAL_URL,
          });
          continue;
        }

        let price = parseFloat(priceMatch[1]);
        const unit = priceMatch[2].toLowerCase();
        if (unit === "s" || unit === "sec" || unit === "second") {
          price = price * 3600;
        }
        if (isNaN(price) || price <= 0) continue;
        const slug = normalizeGpuSlug(rawName);
        if (!slug) continue;

        items.push({
          gpu_slug: slug,
          configuration: `1x ${rawName}`,
          price_usd_per_hour: price,
          billing: "per-second",
          availability: "on-demand",
          region: "us-east",
          deal_url: DEAL_URL,
        });
      }

      // Fallback: look for GPU pricing blocks
      if (items.length === 0) {
        const blocks = await page.$$eval(
          "[class*='gpu'], [class*='hardware'], [class*='compute']",
          (els) => els.map((el) => (el as HTMLElement).innerText)
        );

        for (const text of blocks) {
          const gpuMatch = text.match(/((?:A100|H100|A10|T4|L4|A6000|RTX)\s*[\w\s]*?)(?:\n|\$)/i);
          const priceMatch = text.match(/\$([\d.]+)/);
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
