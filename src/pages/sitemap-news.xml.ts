import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';

export const GET: APIRoute = async () => {
  const posts = await getCollection('blog');
  const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000); // last 48h only (Google News requirement)

  const news = posts
    .filter((p) => !p.data.draft && p.data.isNews && p.data.pubDate >= cutoff)
    .sort((a, b) => b.data.pubDate.getTime() - a.data.pubDate.getTime());

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:news="http://www.google.com/schemas/sitemap-news/0.9">
${news.map((p) => `  <url>
    <loc>https://pricegpu.com/blog/${p.data.slug}</loc>
    <news:news>
      <news:publication>
        <news:name>PriceGPU</news:name>
        <news:language>en</news:language>
      </news:publication>
      <news:publication_date>${p.data.pubDate.toISOString()}</news:publication_date>
      <news:title>${p.data.title.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</news:title>
    </news:news>
  </url>`).join('\n')}
</urlset>`;

  return new Response(xml, {
    headers: { 'Content-Type': 'application/xml' },
  });
};
