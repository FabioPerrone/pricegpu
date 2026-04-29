import fs from 'node:fs';
import path from 'node:path';

export interface Provider {
  slug: string;
  name: string;
  url: string;
  affiliate_url_template: string;
  affiliate_param_env: string;
  billing: string[];
  regions: string[];
  features: string[];
  trust_score: number;
  founded: number;
  scrape_url: string;
  scrape_strategy: string;
  description: string;
}

export interface GPU {
  slug: string;
  name: string;
  vram_gb: number;
  memory_bandwidth_gbps: number;
  fp16_tflops: number;
  fp8_tflops?: number;
  architecture: string;
  released: number;
  msrp_usd: number;
  good_for: string[];
  tdp_watts?: number;
}

export interface UseCase {
  slug: string;
  name: string;
  min_vram_gb: number;
  recommended_vram_gb: number;
  ideal_gpus: string[];
  typical_runtime: string;
  billing_pattern: string;
  category: string;
  description: string;
}

export interface PriceItem {
  gpu_slug: string;
  configuration: string;
  price_usd_per_hour: number;
  billing: string;
  availability: string;
  region: string;
  deal_url: string;
}

export interface ProviderPrices {
  scraped_at: string;
  scraper_version: string;
  items: PriceItem[];
}

const DATA_DIR = path.resolve(process.cwd(), 'data');

function readJSON<T>(filePath: string): T | null {
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function getProviders(): Provider[] {
  return readJSON<Provider[]>(path.join(DATA_DIR, 'providers.json')) ?? [];
}

export function getGPUs(): GPU[] {
  return readJSON<GPU[]>(path.join(DATA_DIR, 'gpus.json')) ?? [];
}

export function getUseCases(): UseCase[] {
  return readJSON<UseCase[]>(path.join(DATA_DIR, 'use-cases.json')) ?? [];
}

export function getProviderPrices(slug: string): ProviderPrices | null {
  return readJSON<ProviderPrices>(path.join(DATA_DIR, `prices/${slug}.json`));
}

export function getAllPrices(): Array<PriceItem & { provider_slug: string }> {
  const pricesDir = path.join(DATA_DIR, 'prices');
  let files: string[] = [];
  try {
    files = fs.readdirSync(pricesDir).filter((f: string) => f.endsWith('.json'));
  } catch {
    return [];
  }

  const result: Array<PriceItem & { provider_slug: string }> = [];
  for (const file of files) {
    const slug = file.replace(/\.json$/, '');
    const data = readJSON<ProviderPrices>(path.join(pricesDir, file));
    if (!data) continue;
    for (const item of data.items) {
      result.push({ ...item, provider_slug: slug });
    }
  }
  return result;
}

export function getPricesForGPU(gpuSlug: string): Array<PriceItem & { provider_slug: string }> {
  return getAllPrices().filter((item) => item.gpu_slug === gpuSlug);
}

export function getCheapestForGPU(
  gpuSlug: string,
): (PriceItem & { provider_slug: string }) | null {
  const prices = getPricesForGPU(gpuSlug);
  if (prices.length === 0) return null;
  return prices.reduce((best, item) =>
    item.price_usd_per_hour < best.price_usd_per_hour ? item : best,
  );
}

export function getPricesForGPUAndProvider(
  gpuSlug: string,
  providerSlug: string,
): PriceItem[] {
  const data = getProviderPrices(providerSlug);
  if (!data) return [];
  return data.items.filter((item) => item.gpu_slug === gpuSlug);
}

export function getRelatedGPUs(gpu: GPU, limit = 4): GPU[] {
  const all = getGPUs().filter((g) => g.slug !== gpu.slug);
  return all
    .map((g) => {
      let score = 0;
      if (g.architecture === gpu.architecture) score += 3;
      const vramDiff = Math.abs(g.vram_gb - gpu.vram_gb);
      score += Math.max(0, 3 - vramDiff / 16);
      const tflDiff = Math.abs(g.fp16_tflops - gpu.fp16_tflops);
      score += Math.max(0, 2 - tflDiff / 100);
      const sharedTags = g.good_for.filter((t) => gpu.good_for.includes(t)).length;
      score += sharedTags;
      return { gpu: g, score };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ gpu: g }) => g);
}

export function getRelatedProviders(provider: Provider, limit = 4): Provider[] {
  const all = getProviders().filter((p) => p.slug !== provider.slug);
  return all
    .map((p) => {
      let score = 0;
      const sharedBilling = p.billing.filter((b) => provider.billing.includes(b)).length;
      score += sharedBilling * 2;
      const sharedRegions = p.regions.filter((r) => provider.regions.includes(r)).length;
      score += sharedRegions;
      const sharedFeatures = p.features.filter((f) => provider.features.includes(f)).length;
      score += sharedFeatures;
      score += Math.max(0, 5 - Math.abs(p.trust_score - provider.trust_score));
      return { provider: p, score };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ provider: p }) => p);
}

export function getValidCheapestPairs(): Array<{ gpu: GPU; useCase: UseCase }> {
  const gpus = getGPUs();
  const useCases = getUseCases();
  const result: Array<{ gpu: GPU; useCase: UseCase }> = [];

  for (const gpu of gpus) {
    const cheapest = getCheapestForGPU(gpu.slug);
    if (!cheapest) continue;
    for (const uc of useCases) {
      if (gpu.vram_gb >= uc.min_vram_gb) {
        result.push({ gpu, useCase: uc });
      }
    }
  }
  return result;
}

export function formatPrice(price: number): string {
  if (price < 0.01) return `$${price.toFixed(4)}/hr`;
  if (price < 1) return `$${price.toFixed(3)}/hr`;
  return `$${price.toFixed(2)}/hr`;
}

export function getLastScrapeDate(providerSlug: string): string {
  const data = getProviderPrices(providerSlug);
  return data?.scraped_at ?? '';
}
