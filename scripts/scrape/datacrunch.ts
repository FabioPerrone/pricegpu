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

const PROVIDER_SLUG = "datacrunch";
const PRICING_URL = "https://datacrunch.io/products";
const DEAL_URL = "https://cloud.datacrunch.io/";

export async function scrape(): Promise<PriceItem[]> {
  return withRetry(async () => {
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ userAgent: USER_AGENT });
    const page = await context.newPage();
    const items: PriceItem[] = [];

    try {
      await page.goto(PRICING_URL, { waitUntil: "networkidle", timeout: 60000 });

      // DataCrunch shows GPU instance products with on-demand and spot pricing
      await page.waitForSelector("table, [class*='instance'], [class*='gpu'], [class*='product']", {
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

        // DataCrunch instance names: "1V100.6V.80G", "8A100.80G.SXM", etc.
        // Try to decode the pattern: count+GPU.vCPUs.RAM
        const dcMatch = rawName.match(/^(\d+)(V100|A100|H100|A10|RTX\d+|L40)/i);
        let gpuName: string;
        let count: number;
        if (dcMatch) {
          count = parseInt(dcMatch[1]);
          gpuName = dcMatch[2].toUpperCase();
          // Check for SXM in rest
          if (/SXM/i.test(rawName)) gpuName += " SXM";
          if (/80G/i.test(rawName) && /A100/i.test(gpuName)) gpuName = "A100 80GB SXM";
          if (/40G/i.test(rawName) && /A100/i.test(gpuName)) gpuName = "A100 40GB";
        } else {
          count = 1;
          gpuName = rawName;
        }
        const slug = normalizeGpuSlug(gpuName);
        if (!slug) continue;

        const isSpot = cells.some((c) => /spot/i.test(c));

        items.push({
          gpu_slug: slug,
          configuration: `${count}x ${gpuName}`,
          price_usd_per_hour: price,
          billing: "per-hour",
          availability: isSpot ? "spot" : "on-demand",
          region: "eu-central",
          deal_url: DEAL_URL,
        });
      }

      // Fallback: product card extraction
      if (items.length === 0) {
        const cards = await page.$$eval(
          "[class*='product-card'], [class*='gpu-card'], [class*='instance-card']",
          (els) => els.map((el) => (el as HTMLElement).innerText)
        );

        for (const text of cards) {
          const gpuMatch = text.match(/((?:V100|A100|H100|A10|RTX)\s*[\w\s]*?)(?:\n|\$)/i);
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
            region: "eu-central",
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
