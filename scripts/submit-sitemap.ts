const BING_API_KEY = process.env.BING_WEBMASTER_API_KEY;
const SITE_URL = 'https://pricegpu.com/';
const SITEMAP_URL = 'https://pricegpu.com/sitemap.xml';

if (!BING_API_KEY) {
  console.error('Missing BING_WEBMASTER_API_KEY');
  process.exit(1);
}

const res = await fetch(
  `https://ssl.bing.com/webmaster/api.svc/json/SubmitSitemap?apikey=${BING_API_KEY}&siteUrl=${encodeURIComponent(SITE_URL)}`,
  {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ sitemap: SITEMAP_URL }),
  }
);

if (res.status === 200) {
  console.log('Bing: sitemap submitted (200)');
} else {
  const body = await res.text();
  console.error(`Bing error ${res.status}: ${body}`);
  process.exit(1);
}
