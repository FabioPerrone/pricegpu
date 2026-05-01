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

const PROVIDER_SLUG = "coreweave";
const PRICING_URL = "https://www.coreweave.com/pricing";
const DEAL_URL = "https://cloud.coreweave.com/";

export async function scrape(): Promise<PriceItem[]> {
  return withRetry(async () => {
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ userAgent: USER_AGENT });
    const page = await context.newPage();
    const items: PriceItem[] = [];

    try {
      await page.goto(PRICING_URL, { waitUntil: "networkidle", timeout: 60000 });

      // CoreWeave has a detailed pricing table with GPU type, vCPUs, RAM, storage, and price
      await page.waitForSelector("table, [class*='pricing'], [class*='gpu'], [class*='instance']", {
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

        // CoreWeave instance names: "A100_NVLINK_80GB", "H100_NVLINK_80GB", etc.
        const normalized = rawName
          .replace(/_/g, " ")
          .replace(/NVLINK/i, "SXM")
          .replace(/NVLINK4/i, "SXM");
        const slug = normalizeGpuSlug(normalized);
        if (!slug) continue;

        // Check for region in cells
        const regionCell = cells.find((c) => /us-|eu-|asia/i.test(c));
        const region = regionCell ? regionCell.toLowerCase().trim() : "us-east";

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

      // Fallback: JSON-LD or script data
      if (items.length === 0) {
        const scriptContent = await page.$$eval("script[type='application/json'], script[type='application/ld+json']", (scripts) =>
          scripts.map((s) => s.textContent ?? "")
        );

        for (const content of scriptContent) {
          if (!content.includes("price") && !content.includes("gpu")) continue;
          try {
            const data = JSON.parse(content);
            const entries = Array.isArray(data) ? data : [data];
            for (const entry of entries) {
              if (!entry.name || !entry.price) continue;
              const slug = normalizeGpuSlug(String(entry.name));
              if (!slug) continue;
              const price = parseFloat(String(entry.price));
              if (isNaN(price) || price <= 0) continue;
              items.push({
                gpu_slug: slug,
                configuration: `1x ${entry.name}`,
                price_usd_per_hour: price,
                billing: "per-hour",
                availability: "on-demand",
                region: "us-east",
                deal_url: DEAL_URL,
              });
            }
          } catch {
            // not valid JSON
          }
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
