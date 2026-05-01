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

const PROVIDER_SLUG = "hyperstack";
const PRICING_URL = "https://www.hyperstack.cloud/pricing";
const DEAL_URL = "https://infrahub.hyperstack.cloud/";

export async function scrape(): Promise<PriceItem[]> {
  return withRetry(async () => {
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ userAgent: USER_AGENT });
    const page = await context.newPage();
    const items: PriceItem[] = [];

    try {
      await page.goto(PRICING_URL, { waitUntil: "networkidle", timeout: 60000 });

      // Hyperstack shows GPU flavors with per-hour pricing across regions
      await page.waitForSelector("table, [class*='flavor'], [class*='gpu'], [class*='pricing']", {
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

        // Hyperstack flavor names: "n3-A100x1", "n1-RTX6000x2", etc.
        const gpuMatch = rawName.match(/[a-z]\d+-(.+?)x(\d+)/i);
        const gpuName = gpuMatch ? gpuMatch[1].replace(/-/g, " ") : rawName;
        const count = gpuMatch ? parseInt(gpuMatch[2]) : 1;
        const slug = normalizeGpuSlug(gpuName);
        if (!slug) continue;

        const regionCell = cells.find((c) => /canada|norway|us|uk|eu/i.test(c));
        const region = regionCell
          ? regionCell.toLowerCase().includes("canada")
            ? "ca-east"
            : regionCell.toLowerCase().includes("norway")
            ? "eu-north"
            : "us-east"
          : "us-east";

        items.push({
          gpu_slug: slug,
          configuration: `${count}x ${gpuName}`,
          price_usd_per_hour: price,
          billing: "per-hour",
          availability: "on-demand",
          region,
          deal_url: DEAL_URL,
        });
      }

      // Fallback: flavor cards
      if (items.length === 0) {
        const cards = await page.$$eval(
          "[class*='flavor'], [class*='gpu-card'], [class*='instance']",
          (els) => els.map((el) => (el as HTMLElement).innerText)
        );

        for (const text of cards) {
          const gpuMatch = text.match(/((?:A100|H100|RTX|L40|A10|V100)\s*[\w\s]*?)(?:\n|\$)/i);
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
            billing: "per-hour",
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
