#!/usr/bin/env tsx
/**
 * Submits all priority URLs to IndexNow after a successful deploy.
 * IndexNow notifies Bing, Yandex, and other participating engines simultaneously.
 *
 * Requires: INDEXNOW_KEY env var (set as GitHub Secret)
 * Key file must exist at: https://pricegpu.com/<INDEXNOW_KEY>.txt
 */

const KEY = process.env.INDEXNOW_KEY;
const HOST = 'pricegpu.com';
const SITE = `https://${HOST}`;

if (!KEY) {
  console.error('INDEXNOW_KEY env var not set — skipping IndexNow ping');
  process.exit(0);
}

// IndexNow endpoint (Bing is the canonical one — it shares with all partners)
const ENDPOINT = 'https://www.bing.com/indexnow';

async function getUrlsToSubmit(): Promise<string[]> {
  const urls: string[] = [];

  // Homepage and top-level pages
  urls.push(
    SITE,
    `${SITE}/blog`,
    `${SITE}/compare`,
    `${SITE}/cheapest`,
  );

  // Blog posts — fetch from sitemap or hardcode recent ones
  const blogSlugs = [
    'llm-inference-gpu-guide',
    'rtx-4090-cloud-vs-buy',
    'spot-vs-on-demand-gpu',
    'h100-vs-a100-cloud-price',
    'stable-diffusion-gpu-comparison',
  ];
  for (const slug of blogSlugs) {
    urls.push(`${SITE}/blog/${slug}`);
  }

  // Provider pages — fetch live sitemap to get current list
  try {
    const res = await fetch(`${SITE}/sitemap.xml`, { signal: AbortSignal.timeout(10_000) });
    if (res.ok) {
      const xml = await res.text();
      // Extract sitemapindex entries, then fetch provider sitemap
      const sitemapUrls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]);
      for (const sitemapUrl of sitemapUrls.slice(0, 3)) {
        // Only fetch first few sitemap chunks to stay under the 10k URL limit
        const sRes = await fetch(sitemapUrl, { signal: AbortSignal.timeout(10_000) });
        if (sRes.ok) {
          const sXml = await sRes.text();
          const pageUrls = [...sXml.matchAll(/<loc>([^<]+)<\/loc>/g)]
            .map(m => m[1])
            .filter(u => {
              // Prioritise GPU pages and provider pages
              return (
                u.includes('/gpu/') ||
                u.includes('/provider/') ||
                u.includes('/compare/') ||
                u.includes('/cheapest/')
              );
            })
            .slice(0, 500);
          urls.push(...pageUrls);
        }
      }
    }
  } catch (err) {
    console.warn('Could not fetch sitemap, submitting static URL list only:', (err as Error).message);
  }

  // Deduplicate
  return [...new Set(urls)];
}

async function submitBatch(urls: string[]): Promise<void> {
  const payload = {
    host: HOST,
    key: KEY,
    keyLocation: `${SITE}/${KEY}.txt`,
    urlList: urls,
  };

  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(30_000),
  });

  if (res.status === 200) {
    console.log(`IndexNow: submitted ${urls.length} URLs — OK`);
  } else if (res.status === 202) {
    console.log(`IndexNow: submitted ${urls.length} URLs — accepted (202)`);
  } else {
    const body = await res.text().catch(() => '');
    throw new Error(`IndexNow returned ${res.status}: ${body}`);
  }
}

async function main() {
  console.log('Collecting URLs for IndexNow submission...');
  const urls = await getUrlsToSubmit();
  console.log(`Total URLs collected: ${urls.length}`);

  // IndexNow accepts up to 10,000 URLs per request
  const BATCH_SIZE = 10_000;
  for (let i = 0; i < urls.length; i += BATCH_SIZE) {
    const batch = urls.slice(i, i + BATCH_SIZE);
    await submitBatch(batch);
  }

  console.log('IndexNow ping complete.');
}

main().catch(err => {
  console.error('IndexNow ping failed:', err);
  process.exit(1);
});
