import type { APIRoute } from 'astro';
import { getGPUs, getProviders, getUseCases, getValidCheapestPairs } from '../lib/pricing.ts';

const CHUNK_SIZE = 45000;

function getTotalPages(): number {
  const gpus = getGPUs();
  const providers = getProviders();
  const useCases = getUseCases();
  const pairs = getValidCheapestPairs();
  const comparePairs = (providers.length * (providers.length - 1)) / 2;
  const total = 4 + gpus.length + providers.length * 2 + comparePairs + useCases.length + pairs.length;
  return Math.ceil(total / CHUNK_SIZE);
}

export const GET: APIRoute = () => {
  const totalChunks = getTotalPages();

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${Array.from({ length: totalChunks }, (_, i) => `  <sitemap>
    <loc>https://pricegpu.com/sitemap-${i}.xml</loc>
  </sitemap>`).join('\n')}
</sitemapindex>`;

  return new Response(xml, {
    headers: { 'Content-Type': 'application/xml' },
  });
};