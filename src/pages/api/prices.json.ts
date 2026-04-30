import type { APIRoute } from 'astro';
import { getGPUs, getProviders, getAllPrices } from '../../lib/pricing.ts';

export const GET: APIRoute = () => {
  const payload = {
    generated_at: new Date().toISOString(),
    license: 'CC-BY-4.0',
    source: 'https://pricegpu.com',
    api_docs: 'https://pricegpu.com/methodology',
    providers: getProviders().map(({ slug, name, url, billing, regions, features }) => ({
      slug, name, url, billing, regions, features,
    })),
    gpus: getGPUs().map(({ slug, name, vram_gb, fp16_tflops, architecture }) => ({
      slug, name, vram_gb, fp16_tflops, architecture,
    })),
    prices: getAllPrices(),
  };

  return new Response(JSON.stringify(payload, null, 2), {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=3600',
      'Access-Control-Allow-Origin': '*',
    },
  });
};