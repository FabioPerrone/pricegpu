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

export const GPU_SLUG_MAP: Record<string, string> = {
  "H100 SXM5 80GB": "h100-sxm",
  "H100 SXM4 80GB": "h100-sxm",
  "H100 SXM": "h100-sxm",
  "H100 SXM5": "h100-sxm",
  "H100 SXM4": "h100-sxm",
  "H100 80GB SXM": "h100-sxm",
  "H100 80GB SXM5": "h100-sxm",
  "H100 80GB SXM4": "h100-sxm",
  "NVIDIA H100 SXM": "h100-sxm",
  "NVIDIA H100 80GB SXM": "h100-sxm",
  "NVIDIA H100 SXM5 80GB": "h100-sxm",
  "H100-SXM": "h100-sxm",
  "h100-sxm": "h100-sxm",
  "h100-80gb-sxm": "h100-sxm",
  "H100 PCIe 80GB": "h100-pcie",
  "H100 PCIe": "h100-pcie",
  "H100 80GB PCIe": "h100-pcie",
  "NVIDIA H100 PCIe": "h100-pcie",
  "NVIDIA H100 80GB PCIe": "h100-pcie",
  "H100-PCIe": "h100-pcie",
  "h100-pcie": "h100-pcie",
  "h100-80gb-pcie": "h100-pcie",
  "H200 SXM 141GB": "h200-sxm",
  "H200 SXM": "h200-sxm",
  "H200 141GB": "h200-sxm",
  "NVIDIA H200": "h200-sxm",
  "NVIDIA H200 SXM": "h200-sxm",
  "NVIDIA H200 141GB SXM": "h200-sxm",
  "H200": "h200-sxm",
  "h200-sxm": "h200-sxm",
  "A100 SXM4 80GB": "a100-80gb-sxm",
  "A100 SXM 80GB": "a100-80gb-sxm",
  "A100 80GB SXM": "a100-80gb-sxm",
  "A100 80GB SXM4": "a100-80gb-sxm",
  "NVIDIA A100 80GB SXM": "a100-80gb-sxm",
  "NVIDIA A100 SXM4 80GB": "a100-80gb-sxm",
  "A100-SXM4-80GB": "a100-80gb-sxm",
  "a100-80gb-sxm": "a100-80gb-sxm",
  "A100 SXM4 40GB": "a100-40gb-sxm",
  "A100 SXM 40GB": "a100-40gb-sxm",
  "A100 40GB SXM": "a100-40gb-sxm",
  "A100 40GB SXM4": "a100-40gb-sxm",
  "NVIDIA A100 40GB SXM": "a100-40gb-sxm",
  "a100-40gb-sxm": "a100-40gb-sxm",
  "A100 PCIe 40GB": "a100-40gb-pcie",
  "A100 40GB PCIe": "a100-40gb-pcie",
  "A100 40GB": "a100-40gb-pcie",
  "NVIDIA A100 40GB PCIe": "a100-40gb-pcie",
  "A100-PCIE-40GB": "a100-40gb-pcie",
  "a100-40gb-pcie": "a100-40gb-pcie",
  "A100 PCIe 80GB": "a100-80gb-pcie",
  "A100 80GB PCIe": "a100-80gb-pcie",
  "NVIDIA A100 80GB PCIe": "a100-80gb-pcie",
  "A100-PCIE-80GB": "a100-80gb-pcie",
  "a100-80gb-pcie": "a100-80gb-pcie",
  "L40S 48GB": "l40s",
  "L40S": "l40s",
  "NVIDIA L40S": "l40s",
  "NVIDIA L40S 48GB": "l40s",
  "l40s": "l40s",
  "L40 48GB": "l40",
  "L40": "l40",
  "NVIDIA L40": "l40",
  "NVIDIA L40 48GB": "l40",
  "l40": "l40",
  "L4 24GB": "l4",
  "L4": "l4",
  "NVIDIA L4": "l4",
  "NVIDIA L4 24GB": "l4",
  "l4": "l4",
  "RTX 6000 Ada 48GB": "rtx-6000-ada",
  "RTX 6000 Ada": "rtx-6000-ada",
  "RTX 6000 Ada Generation": "rtx-6000-ada",
  "NVIDIA RTX 6000 Ada": "rtx-6000-ada",
  "rtx-6000-ada": "rtx-6000-ada",
  "RTX A6000 48GB": "a6000",
  "RTX A6000": "a6000",
  "A6000 48GB": "a6000",
  "A6000": "a6000",
  "NVIDIA RTX A6000": "a6000",
  "NVIDIA A6000": "a6000",
  "a6000": "a6000",
  "A40 48GB": "a40",
  "A40": "a40",
  "NVIDIA A40": "a40",
  "NVIDIA A40 48GB": "a40",
  "a40": "a40",
  "RTX 4090 24GB": "rtx-4090",
  "RTX 4090": "rtx-4090",
  "GeForce RTX 4090": "rtx-4090",
  "NVIDIA RTX 4090": "rtx-4090",
  "NVIDIA GeForce RTX 4090": "rtx-4090",
  "rtx-4090": "rtx-4090",
  "4090": "rtx-4090",
  "RTX 4080 16GB": "rtx-4080",
  "RTX 4080": "rtx-4080",
  "GeForce RTX 4080": "rtx-4080",
  "NVIDIA RTX 4080": "rtx-4080",
  "rtx-4080": "rtx-4080",
  "RTX 3090 24GB": "rtx-3090",
  "RTX 3090": "rtx-3090",
  "GeForce RTX 3090": "rtx-3090",
  "NVIDIA RTX 3090": "rtx-3090",
  "rtx-3090": "rtx-3090",
  "3090": "rtx-3090",
  "RTX 5090 32GB": "rtx-5090",
  "RTX 5090": "rtx-5090",
  "GeForce RTX 5090": "rtx-5090",
  "NVIDIA RTX 5090": "rtx-5090",
  "rtx-5090": "rtx-5090",
  "A10 24GB": "a10",
  "A10": "a10",
  "NVIDIA A10": "a10",
  "a10": "a10",
  "A10G 24GB": "a10g",
  "A10G": "a10g",
  "NVIDIA A10G": "a10g",
  "a10g": "a10g",
  "T4 16GB": "t4",
  "T4": "t4",
  "Tesla T4": "t4",
  "NVIDIA T4": "t4",
  "NVIDIA Tesla T4": "t4",
  "t4": "t4",
  "V100 16GB": "v100-16gb",
  "V100 SXM2 16GB": "v100-16gb",
  "V100 SXM2": "v100-16gb",
  "V100": "v100-16gb",
  "Tesla V100": "v100-16gb",
  "NVIDIA V100": "v100-16gb",
  "v100-16gb": "v100-16gb",
  "v100": "v100-16gb",
  "MI300X 192GB": "mi300x",
  "MI300X": "mi300x",
  "AMD MI300X": "mi300x",
  "AMD Instinct MI300X": "mi300x",
  "Instinct MI300X": "mi300x",
  "mi300x": "mi300x",
  "B100 192GB": "b100",
  "B100": "b100",
  "NVIDIA B100": "b100",
  "b100": "b100",
  "B200 192GB": "b200",
  "B200": "b200",
  "NVIDIA B200": "b200",
  "b200": "b200",
  "Gaudi 3": "gaudi-3",
  "Intel Gaudi 3": "gaudi-3",
  "Gaudi3": "gaudi-3",
  "gaudi-3": "gaudi-3",
};

export function normalizeGpuSlug(name: string): string | null {
  const trimmed = name.trim();
  if (GPU_SLUG_MAP[trimmed]) return GPU_SLUG_MAP[trimmed];
  const lower = trimmed.toLowerCase();
  for (const [key, slug] of Object.entries(GPU_SLUG_MAP)) {
    if (key.toLowerCase() === lower) return slug;
  }
  const stripped = trimmed.replace(/^(NVIDIA|AMD|Intel)\s+/i, "").trim();
  if (GPU_SLUG_MAP[stripped]) return GPU_SLUG_MAP[stripped];
  for (const [key, slug] of Object.entries(GPU_SLUG_MAP)) {
    if (key.toLowerCase() === stripped.toLowerCase()) return slug;
  }
  for (const [key, slug] of Object.entries(GPU_SLUG_MAP)) {
    if (key.length > 3 && lower.includes(key.toLowerCase())) return slug;
  }
  for (const [key, slug] of Object.entries(GPU_SLUG_MAP)) {
    if (key.length > 3 && key.toLowerCase().includes(lower)) return slug;
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