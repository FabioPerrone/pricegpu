
import fs from "fs";
import path from "path";
import {
  extractPriceBlocks,
  priceBlockToItem,
  GPU_NAME_HINTS,
  dumpPageDiagnostics,
  launchBrowser,
  normalizeGpuSlug,
  saveProviderPrices,
  withRetry,
  USER_AGENT,
} from "./_shared.js";
import type { PriceItem } from "./_shared.js";

const PROVIDER_SLUG = "runpod";
const PRICING_URL = "https://www.runpod.io/gpu-instance/pricing";
const DEAL_URL = "https://runpod.io/console/gpu-cloud";

export async function scrape(): Promise<PriceItem[]> {
  return withRetry(async () => {
    const browser = await launchBrowser();
    const context = await browser.newContext({ userAgent: USER_AGENT });
    const page = await context.newPage();
    const items: PriceItem[] = [];

    try {
      await page.goto(PRICING_URL, { waitUntil: "domcontentloaded", timeout: 45000 });

      // Wait for GPU pricing table rows to appear
      await page.waitForSelector("table tbody tr, [data-gpu], .gpu-row, .pricing-row", {
        timeout: 30000,
      }).catch(() => null);

      // Try structured table first
      const rows = await page.$$eval(
        "table tbody tr",
        (trs) =>
          trs.map((tr) => {
            const cells = Array.from(tr.querySelectorAll("td"));
            return cells.map((c) => c.innerText.trim());
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
          billing: "per-second",
          availability: "on-demand",
          region: "us-east",
          deal_url: DEAL_URL,
        });
      }

      // Fallback: look for any element containing GPU name + price patterns
      if (items.length === 0) {
        const cards = await page.$$eval(
          "[class*='gpu'], [class*='card'], [class*='instance']",
          (els) =>
            els.map((el) => ({
              text: (el as HTMLElement).innerText,
            }))
        );

        for (const { text } of cards) {
          const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
          const gpuLine = lines[0] ?? "";
          const priceLine = lines.find((l) => /\$[\d.]+/.test(l)) ?? "";
          const priceMatch = priceLine.match(/\$([\d.]+)/);
          if (!priceMatch) continue;
          const price = parseFloat(priceMatch[1]);
          if (isNaN(price) || price <= 0) continue;
          const slug = normalizeGpuSlug(gpuLine);
          if (!slug) continue;

          items.push({
            gpu_slug: slug,
            configuration: `1x ${gpuLine}`,
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
      // The specific parser above is exact when it works. When it does not,
      // read the page by meaning rather than markup before giving up.
      if (items.length === 0) {
        for (const block of await extractPriceBlocks(page, GPU_NAME_HINTS)) {
          const item = priceBlockToItem(block, { billing: "per-second", availability: "on-demand", region: "us-east", dealUrl: DEAL_URL });
          if (item && !items.some((i) => i.gpu_slug === item.gpu_slug)) items.push(item);
        }
        if (items.length) console.error(`[${PROVIDER_SLUG}] specific parser found nothing; recovered ${items.length} price(s) structurally.`);
      }
      if (items.length === 0) await dumpPageDiagnostics(page, PROVIDER_SLUG);
      await browser.close();
    }

    return items;
  });
}

const items = await scrape();
saveProviderPrices(PROVIDER_SLUG, items);
