import { z } from "zod";
import fs from "fs";
import path from "path";

export interface PriceItem {
  gpu_slug: string;
  configuration: string;
  price_usd_per_hour: number;
  billing: string;
  availability: string;
  region: string;
  deal_url: string;
}

export interface PriceFile {
  scraped_at: string;
  scraper_version: string;
  items: PriceItem[];
}

export const PriceItemSchema = z.object({
  gpu_slug: z.string().min(1),
  configuration: z.string().min(1),
  price_usd_per_hour: z.number().positive(),
  billing: z.enum(["per-second", "per-minute", "per-hour"]),
  availability: z.enum(["on-demand", "spot", "reserved"]),
  region: z.string().min(1),
  deal_url: z.string().url(),
});

export const PriceFileSchema = z.object({
  scraped_at: z.string(),
  scraper_version: z.string(),
  items: z.array(PriceItemSchema),
});

export const SCRAPER_VERSION = "1.0.0";
export const THROTTLE_MS = 2000;
export const USER_AGENT = "pricegpu.com/1.0 (+https://pricegpu.com/about)";

export function normalizeGpuSlug(name: string): string | null {
  const GPU_SLUG_MAP: Record<string, string> = {
    "H100 SXM5 80GB": "h100-sxm",
    "H100 PCIe 80GB": "h100-pcie",
    "H200 SXM 141GB": "h200-sxm",
    "A100 SXM4 80GB": "a100-80gb-sxm",
    "A100 SXM4 40GB": "a100-40gb-sxm",
    "L40S 48GB": "l40s",
    "L4 24GB": "l4",
    "RTX 4090 24GB": "rtx-4090",
    "RTX 4080 16GB": "rtx-4080",
    "RTX 3090 24GB": "rtx-3090",
    "T4 16GB": "t4",
    "V100 16GB": "v100-16gb",
    "A10 24GB": "a10",
    "A10G 24GB": "a10g",
    "A6000 48GB": "a6000",
    "MI300X 192GB": "mi300x",
  };
  
  const trimmed = name.trim();
  if (GPU_SLUG_MAP[trimmed]) return GPU_SLUG_MAP[trimmed];
  
  for (const [key, slug] of Object.entries(GPU_SLUG_MAP)) {
    if (key.toLowerCase() === trimmed.toLowerCase()) return slug;
  }
  return null;
}

export function saveProviderPrices(providerSlug: string, items: PriceItem[]): void {
  const outDir = path.resolve("data/prices");
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  const priceFile: PriceFile = {
    scraped_at: new Date().toISOString(),
    scraper_version: SCRAPER_VERSION,
    items,
  };

  const parsed = PriceFileSchema.safeParse(priceFile);
  if (!parsed.success) {
    console.error(`[${providerSlug}] Schema validation failed:`, parsed.error.issues);
    process.exit(1);
  }

  const outPath = path.join(outDir, `${providerSlug}.json`);
  fs.writeFileSync(outPath, JSON.stringify(parsed.data, null, 2));
  console.log(`[${providerSlug}] Saved ${items.length} items to ${outPath}`);
}

export async function withRetry<T>(fn: () => Promise<T>, retries = 3): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt < retries) {
        console.warn(`Attempt ${attempt} failed, retrying in 2s...`, err);
        await new Promise((r) => setTimeout(r, 2000));
      }
    }
  }
  throw lastError;
}
