
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

const PROVIDER_SLUG = "lambda-labs";
const PRICING_URL = "https://lambda.com/pricing";
const DEAL_URL = "https://lambdalabs.com/service/gpu-cloud";

function lambdaSlug(plan: string, vramGb: number): string | null {
  const name = plan.toUpperCase();
  if (name.includes("H100")) return "h100-sxm";
  if (name.includes("B200")) return "b200";
  if (name.includes("V100")) return "v100-16gb";
  if (name.includes("A6000")) return "a6000";
  if (name.includes("A100")) {
    const size = vramGb >= 80 ? "80gb" : "40gb";
    return `a100-${size}-${name.includes("PCIE") ? "pcie" : "sxm"}`;
  }
  return null;
}

export async function scrape(): Promise<PriceItem[]> {
  return withRetry(async () => {
    const browser = await launchBrowser();
    const context = await browser.newContext({ userAgent: USER_AGENT });
    const page = await context.newPage();
    const items: PriceItem[] = [];

    try {
      await page.goto(PRICING_URL, { waitUntil: "domcontentloaded", timeout: 45000 });

      // Lambda Labs has a pricing table with GPU type, VRAM, #GPUs, and price columns
      await page.waitForSelector("table, [class*='pricing-table'], [class*='gpu']", {
        timeout: 30000,
      }).catch(() => null);

      // The instance tables are the ones with a VRAM/GPU column; the others are
      // reserved-cluster quotes. The plan name is a <th>, so reading only <td>
      // shifts every column by one and the VRAM figure gets parsed as the GPU.
      const rows = await page.$$eval("table", (tables) =>
        tables
          .filter((t) => /VRAM\/GPU/i.test((t as HTMLElement).innerText))
          .flatMap((t) =>
            Array.from(t.querySelectorAll("tbody tr")).map((tr) =>
              Array.from(tr.querySelectorAll("td, th")).map((c) => (c as HTMLElement).innerText.trim())
            )
          )
      );

      for (const cells of rows) {
        if (cells.length < 6) continue;
        const [plan, vram] = cells;
        const priceMatch = cells[cells.length - 1].match(/\$([\d.]+)/);
        if (!priceMatch) continue;
        const price = parseFloat(priceMatch[1]);
        const slug = lambdaSlug(plan, parseInt(vram, 10));
        if (!slug || isNaN(price) || price <= 0) continue;
        if (items.some((i) => i.gpu_slug === slug && i.price_usd_per_hour === price)) continue;

        items.push({
          gpu_slug: slug,
          configuration: `1x ${plan}`,
          price_usd_per_hour: price,
          billing: "per-hour",
          availability: "on-demand",
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
      // The specific parser above is exact when it works. When it does not,
      // read the page by meaning rather than markup before giving up.
      if (items.length === 0) {
        for (const block of await extractPriceBlocks(page, GPU_NAME_HINTS)) {
          const item = priceBlockToItem(block, { billing: "per-hour", availability: "on-demand", region: "us-west-1", dealUrl: DEAL_URL });
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
