import type { APIRoute } from 'astro';
import { getGPUs, getProviders } from '../../lib/pricing.ts';

export const GET: APIRoute = () => {
  const gpus = getGPUs().slice(0, 20);
  const providers = getProviders();
  const now = new Date().toUTCString();

  const items = [
    ...gpus.map((gpu) => ({
      title: `${gpu.name} Cloud GPU Pricing`,
      link: `https://pricegpu.com/gpu/${gpu.slug}`,
      description: `Compare ${gpu.name} prices across ${providers.length} cloud providers. ${gpu.vram_gb}GB VRAM, ${gpu.fp16_tflops} TFLOPS FP16.`,
      pubDate: now,
    })),
    ...providers.slice(0, 10).map((p) => ({
      title: `${p.name} GPU Cloud Pricing`,
      link: `https://pricegpu.com/provider/${p.slug}`,
      description: p.description,
      pubDate: now,
    })),
  ];

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>PriceGPU — Live Cloud GPU Pricing</title>
    <link>https://pricegpu.com</link>
    <description>Live cloud GPU pricing across every major provider. Updated weekly.</description>
    <language>en-us</language>
    <lastBuildDate>${now}</lastBuildDate>
    <atom:link href="https://pricegpu.com/api/feed.xml" rel="self" type="application/rss+xml" />
${items.map((item) => `    <item>
      <title><![CDATA[${item.title}]]></title>
      <link>${item.link}</link>
      <description><![CDATA[${item.description}]]></description>
      <pubDate>${item.pubDate}</pubDate>
      <guid>${item.link}</guid>
    </item>`).join('\n')}
  </channel>
</rss>`;

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/rss+xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
};