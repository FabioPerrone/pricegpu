import { writeFileSync, existsSync, readFileSync } from 'fs';

const CF_API_TOKEN = process.env.CF_API_TOKEN;
const CF_ACCOUNT_ID = process.env.CF_ACCOUNT_ID;
const ZONE_NAME = 'pricegpu.com';
const OUTPUT = 'data/revenue.json';
const DAYS = 30;

if (!CF_API_TOKEN || !CF_ACCOUNT_ID) {
  console.error('Missing CF_API_TOKEN or CF_ACCOUNT_ID');
  process.exit(1);
}

async function getZoneId(): Promise<string> {
  const res = await fetch(
    `https://api.cloudflare.com/client/v4/zones?name=${ZONE_NAME}&account.id=${CF_ACCOUNT_ID}`,
    { headers: { Authorization: `Bearer ${CF_API_TOKEN}` } }
  );
  const json = await res.json() as { success: boolean; result: { id: string }[] };
  if (!json.success || !json.result.length) throw new Error(`Zone not found: ${ZONE_NAME}`);
  return json.result[0].id;
}

async function getPageviews(zoneId: string): Promise<number> {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - DAYS);
  const fmt = (d: Date) => d.toISOString().split('T')[0];

  const query = `{
    viewer {
      zones(filter: { zoneTag: "${zoneId}" }) {
        httpRequests1dGroups(
          limit: ${DAYS}
          filter: { date_geq: "${fmt(start)}", date_leq: "${fmt(end)}" }
        ) {
          sum { pageViews }
        }
      }
    }
  }`;

  const res = await fetch('https://api.cloudflare.com/client/v4/graphql', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${CF_API_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query }),
  });

  const json = await res.json() as {
    errors?: { message: string }[];
    data?: { viewer: { zones: { httpRequests1dGroups: { sum: { pageViews: number } }[] }[] } };
  };

  if (json.errors?.length) throw new Error(`CF GraphQL: ${json.errors.map(e => e.message).join(', ')}`);

  const groups = json.data?.viewer?.zones?.[0]?.httpRequests1dGroups ?? [];
  return groups.reduce((acc, g) => acc + (g.sum.pageViews ?? 0), 0);
}

const zoneId = await getZoneId();
const pageviews = await getPageviews(zoneId);

const existing = existsSync(OUTPUT) ? JSON.parse(readFileSync(OUTPUT, 'utf8')) : {};
writeFileSync(OUTPUT, JSON.stringify({
  ...existing,
  pageviews,
  lastSync: new Date().toISOString(),
  status: 'live',
  note: `Cloudflare Analytics — last ${DAYS} days`,
}, null, 2) + '\n');

console.log(`Synced: ${pageviews.toLocaleString()} pageviews (last ${DAYS} days)`);
