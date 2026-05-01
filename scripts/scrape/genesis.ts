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

const PROVIDER_SLUG = "genesis";
const PRICING_URL = "https://www.genesiscloud.com/pricing";
const DEAL_URL = "https://account.genesiscloud.com/";

export async function scrape(): Promise<PriceItem[]> {
  return withRetry(async () => {
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ userAgent: USER_AGENT });
    const page = await context.newPage();
    const items: PriceItem[] = [];

    try {
      await page.goto(PRICING_URL, { waitUntil: "networkidle", timeout: 60000 });

      // Genesis Cloud shows GPU instance types with hourly pricing
      await page.waitForSelector("table, [class*='instance'], [class*='gpu'], [class*='pricing']", {
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
        const priceText = cells.find((c) => /\$[\d.]+|€[\d.]+/.test(c)) ?? "";
        const priceMatch = priceText.match(/\$([\d.]+)/);
        if (!priceMatch) continue;
        const price = parseFloat(priceMatch[1]);
        if (isNaN(price) || price <= 0) continue;

        // Genesis Cloud instance names like "vcpu4_memory12g_gpu1_rtx3080"
        const normalized = rawName.replace(/_/g, " ").replace(/vcpu\d+\s+memory\d+g?\s+gpu\d+\s*/i, "");
        const slug = normalizeGpuSlug(normalized.trim());
        if (!slug) continue;

        items.push({
          gpu_slug: slug,
          configuration: `1x ${normalized.trim()}`,
          price_usd_per_hour: price,
          billing: "per-hour",
          availability: "on-demand",
          region: "eu-central",
          deal_url: DEAL_URL,
        });
      }

      // Fallback: GPU instance cards
      if (items.length === 0) {
        const cards = await page.$$eval(
          "[class*='instance-card'], [class*='gpu-instance'], [class*='plan']",
          (els) => els.map((el) => (el as HTMLElement).innerText)
        );

        for (const text of cards) {
          const gpuMatch = text.match(/((?:RTX|A100|H100|V100|A10|L40|A4000|A5000|A6000|RTX 3080|RTX 3090|RTX 4090)\s*[\w\s]*?)(?:\n|\$)/i);
          const priceMatch = text.match(/\$([\d.]+)\s*(?:\/\s*hr|\/hr|per hour|\/h)?/i);
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
