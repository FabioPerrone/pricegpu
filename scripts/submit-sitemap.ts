import { createSign } from 'crypto';

const SA_JSON = process.env.GOOGLE_SEARCH_CONSOLE_SA_JSON;
const BING_API_KEY = process.env.BING_WEBMASTER_API_KEY;
const SITE_URL = 'sc-domain:pricegpu.com';
const SITEMAP_URL = 'https://pricegpu.com/sitemap.xml';

if (!SA_JSON) {
  console.error('Missing GOOGLE_SEARCH_CONSOLE_SA_JSON');
  process.exit(1);
}

const sa = JSON.parse(SA_JSON);

function b64url(obj: object | string): string {
  const str = typeof obj === 'string' ? obj : JSON.stringify(obj);
  return Buffer.from(str).toString('base64url');
}

async function getAccessToken(): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url({ alg: 'RS256', typ: 'JWT' });
  const payload = b64url({
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/webmasters',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  });

  const sign = createSign('RSA-SHA256');
  sign.update(`${header}.${payload}`);
  const sig = sign.sign(sa.private_key, 'base64url');
  const jwt = `${header}.${payload}.${sig}`;

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });

  const json = await res.json() as { access_token?: string; error?: string };
  if (!json.access_token) throw new Error(`Token error: ${json.error}`);
  return json.access_token;
}

const token = await getAccessToken();

const encodedSite = encodeURIComponent(SITE_URL);
const encodedSitemap = encodeURIComponent(SITEMAP_URL);
const url = `https://www.googleapis.com/webmasters/v3/sites/${encodedSite}/sitemaps/${encodedSitemap}`;

const res = await fetch(url, {
  method: 'PUT',
  headers: { Authorization: `Bearer ${token}` },
});

if (res.status === 204 || res.status === 200) {
  console.log(`GSC: sitemap submitted (${res.status})`);
} else {
  const body = await res.text();
  console.error(`GSC error ${res.status}: ${body}`);
  process.exit(1);
}

// Bing Webmaster
if (BING_API_KEY) {
  const bingRes = await fetch(
    `https://ssl.bing.com/webmaster/api.svc/json/SubmitSitemap?apikey=${BING_API_KEY}&siteUrl=${encodeURIComponent(SITE_URL)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ sitemap: SITEMAP_URL }),
    }
  );
  if (bingRes.status === 200) {
    console.log('Bing: sitemap submitted (200)');
  } else {
    const body = await bingRes.text();
    console.error(`Bing error ${bingRes.status}: ${body}`);
    process.exit(1);
  }
} else {
  console.log('Bing: skipped (no BING_WEBMASTER_API_KEY)');
}
