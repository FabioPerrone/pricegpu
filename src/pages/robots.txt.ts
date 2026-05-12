import type { APIRoute } from 'astro';

export const GET: APIRoute = () => {
  const content = `User-agent: *
Allow: /
Disallow: /admin/

Sitemap: https://pricegpu.com/sitemap.xml
Sitemap: https://pricegpu.com/sitemap-news.xml
`;
  return new Response(content, { headers: { 'Content-Type': 'text/plain' } });
};