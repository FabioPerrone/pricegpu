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

const PROVIDER_SLUG = "together";
const PRICING_URL = "https://www.together.ai/pricing";
const DEAL_URL = "https://api.together.ai/";

export async function scrape(): Promise<PriceItem[]> {
  return withRetry(async () => {
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ userAgent: USER_AGENT });
    const page = await context.newPage();
    const items: PriceItem[] = [];

    try {
      await page.goto(PRICING_URL, { waitUntil: "networkidle", timeout: 60000 });

      // Together AI pricing page has dedicated GPU sections and inference pricing
      await page.waitForSelector("table, [class*='gpu'], [class*='pricing'], [class*='dedicated']", {
        timeout: 30000,
      }).catch(() => null);

      // Together AI shows dedicated GPU instances with per-hour pricing
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

        // Together uses names like "1x A100 (80 GB)"
        const countMatch = rawName.match(/^(\d+)x?\s+(.+)/i);
        const count = countMatch ? parseInt(countMatch[1]) : 1;
        const gpuName = countMatch ? countMatch[2].replace(/\s*\([\d\s]+GB\)/i, " 80GB").trim() : rawName;
        const slug = normalizeGpuSlug(gpuName);
        if (!slug) continue;

        items.push({
          gpu_slug: slug,
          configuration: `${count}x ${gpuName}`,
          price_usd_per_hour: price,
          billing: "per-hour",
          availability: "on-demand",
          region: "us-east",
          deal_url: DEAL_URL,
        });
      }

      // Fallback: section-based extraction for dedicated GPU pricing
      if (items.length === 0) {
        const sections = await page.$$eval(
          "[class*='dedicated'], [class*='gpu-tier'], [class*='plan']",
          (els) => els.map((el) => (el as HTMLElement).innerText)
        );

        for (const text of sections) {
          const gpuMatch = text.match(/((?:\d+x\s+)?(?:A100|H100|A10|RTX|V100|L40)\s*[\w\s]*?)(?:\n|\$)/i);
          const priceMatch = text.match(/\$([\d.]+)\s*(?:\/\s*hr|per hour)?/i);
          if (!gpuMatch || !priceMatch) continue;
          const price = parseFloat(priceMatch[1]);
          if (isNaN(price) || price <= 0) continue;
          const rawGpu = gpuMatch[1].trim();
          const countMatch = rawGpu.match(/^(\d+)x\s+(.+)/i);
          const count = countMatch ? parseInt(countMatch[1]) : 1;
          const gpuName = countMatch ? countMatch[2].trim() : rawGpu;
          const slug = normalizeGpuSlug(gpuName);
          if (!slug) continue;

          items.push({
            gpu_slug: slug,
            configuration: `${count}x ${gpuName}`,
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
