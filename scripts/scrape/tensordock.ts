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

const PROVIDER_SLUG = "tensordock";
const PRICING_URL = "https://www.tensordock.com/pricing";
const DEAL_URL = "https://marketplace.tensordock.com/";

export async function scrape(): Promise<PriceItem[]> {
  return withRetry(async () => {
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ userAgent: USER_AGENT });
    const page = await context.newPage();
    const items: PriceItem[] = [];

    try {
      await page.goto(PRICING_URL, { waitUntil: "networkidle", timeout: 60000 });

      // TensorDock shows a marketplace table with GPU model, location, $/hr
      await page.waitForSelector("table, [class*='gpu'], [class*='pricing'], [class*='marketplace']", {
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
        const slug = normalizeGpuSlug(rawName);
        if (!slug) continue;

        const locationCell = cells.find((c) => /us|eu|asia|london|amsterdam|dallas/i.test(c));
        const region = locationCell ? locationCell.toLowerCase().replace(/\s+/g, "-") : "us-east";

        items.push({
          gpu_slug: slug,
          configuration: `1x ${rawName}`,
          price_usd_per_hour: price,
          billing: "per-hour",
          availability: "on-demand",
          region,
          deal_url: DEAL_URL,
        });
      }

      // Fallback: look for GPU listing blocks
      if (items.length === 0) {
        const cards = await page.$$eval(
          "[class*='gpu-card'], [class*='host-card'], [class*='server']",
          (els) => els.map((el) => (el as HTMLElement).innerText)
        );

        for (const text of cards) {
          const gpuMatch = text.match(/((?:RTX|A100|H100|A10|T4|L40|V100|A40|RTX 3090|RTX 4090)\s*[\w\s]*?)(?:\n|\$)/i);
          const priceMatch = text.match(/\$([\d.]+)\s*\/\s*h/i);
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
