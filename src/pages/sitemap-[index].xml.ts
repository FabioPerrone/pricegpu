import type { GetStaticPaths, APIRoute } from 'astro';
import {
  getGPUs, getProviders, getUseCases, getValidCheapestPairs,
} from '../lib/pricing.ts';
import { getLastmod } from '../lib/seo.ts';

const CHUNK_SIZE = 45000;

function getAllUrls(): Array<{ loc: string; lastmod: string; priority: string }> {
  const gpus = getGPUs();
  const providers = getProviders();
  const useCases = getUseCases();
  const today = new Date().toISOString().slice(0, 10);

  const urls: Array<{ loc: string; lastmod: string; priority: string }> = [];

  urls.push({ loc: 'https://pricegpu.com/', lastmod: today, priority: '1.0' });
  urls.push({ loc: 'https://pricegpu.com/about', lastmod: today, priority: '0.5' });
  urls.push({ loc: 'https://pricegpu.com/methodology', lastmod: today, priority: '0.5' });
  urls.push({ loc: 'https://pricegpu.com/disclosure', lastmod: today, priority: '0.3' });

  for (const gpu of gpus) {
    const lm = getLastmod(providers.map((p) => p.slug));
    urls.push({ loc: `https://pricegpu.com/gpu/${gpu.slug}`, lastmod: lm, priority: '0.9' });
  }

  for (const p of providers) {
    const lm = getLastmod([p.slug]);
    urls.push({ loc: `https://pricegpu.com/provider/${p.slug}`, lastmod: lm, priority: '0.8' });
    urls.push({ loc: `https://pricegpu.com/${p.slug}/alternatives`, lastmod: today, priority: '0.7' });
  }

  for (let i = 0; i < providers.length; i++) {
    for (let j = i + 1; j < providers.length; j++) {
      const lm = getLastmod([providers[i].slug, providers[j].slug]);
      urls.push({
        loc: `https://pricegpu.com/compare/${providers[i].slug}-vs-${providers[j].slug}`,
        lastmod: lm,
        priority: '0.7',
      });
    }
  }

  for (const uc of useCases) {
    urls.push({ loc: `https://pricegpu.com/use-case/${uc.slug}`, lastmod: today, priority: '0.8' });
  }

  const cheapestPairs = getValidCheapestPairs();
  for (const { gpu, useCase } of cheapestPairs) {
    urls.push({
      loc: `https://pricegpu.com/cheapest/${gpu.slug}-for-${useCase.slug}`,
      lastmod: getLastmod(providers.map((p) => p.slug)),
      priority: '0.6',
    });
  }

  return urls;
}

export const getStaticPaths: GetStaticPaths = () => {
  const urls = getAllUrls();
  const totalChunks = Math.ceil(urls.length / CHUNK_SIZE);
  return Array.from({ length: totalChunks }, (_, i) => ({
    params: { index: i.toString() },
  }));
};

export const GET: APIRoute = ({ params }) => {
  const index = parseInt(params.index ?? '0', 10);
  const urls = getAllUrls();
  const chunk = urls.slice(index * CHUNK_SIZE, (index + 1) * CHUNK_SIZE);

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${chunk.map((u) => `  <url>
    <loc>${u.loc}</loc>
    <lastmod>${u.lastmod}</lastmod>
    <priority>${u.priority}</priority>
  </url>`).join('\n')}
</urlset>`;

  return new Response(xml, {
    headers: { 'Content-Type': 'application/xml' },
  });
};