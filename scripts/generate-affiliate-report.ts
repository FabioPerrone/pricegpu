import { writeFileSync } from 'fs';

const CF_API_TOKEN = process.env.CF_API_TOKEN;
const CF_ACCOUNT_ID = process.env.CF_ACCOUNT_ID;
const ZONE_NAME = 'pricegpu.com';
const OUTPUT = 'data/affiliate-report.json';
const DAYS = 30;

if (!CF_API_TOKEN || !CF_ACCOUNT_ID) {
  console.error('Missing CF_API_TOKEN or CF_ACCOUNT_ID');
  process.exit(1);
}

const end = new Date();
const start = new Date();
start.setDate(start.getDate() - DAYS);
const fmt = (d: Date) => d.toISOString().split('T')[0];

async function getZoneId(): Promise<string> {
  const res = await fetch(
    `https://api.cloudflare.com/client/v4/zones?name=${ZONE_NAME}&account.id=${CF_ACCOUNT_ID}`,
    { headers: { Authorization: `Bearer ${CF_API_TOKEN}` } }
  );
  const json = await res.json() as { success: boolean; result: { id: string }[] };
  if (!json.success || !json.result.length) throw new Error(`Zone not found: ${ZONE_NAME}`);
  return json.result[0].id;
}

async function getGoClicks(zoneId: string): Promise<{ path: string; clicks: number }[]> {
  const query = `{
    viewer {
      zones(filter: { zoneTag: "${zoneId}" }) {
        httpRequestsAdaptiveGroups(
          limit: 500
          filter: {
            date_geq: "${fmt(start)}"
            date_leq: "${fmt(end)}"
            clientRequestPath_like: "/go/%"
          }
          orderBy: [count_DESC]
        ) {
          count
          dimensions {
            clientRequestPath
          }
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
    data?: {
      viewer: {
        zones: {
          httpRequestsAdaptiveGroups: { count: number; dimensions: { clientRequestPath: string } }[];
        }[];
      };
    };
  };

  if (json.errors?.length) throw new Error(`CF GraphQL: ${json.errors.map(e => e.message).join(', ')}`);

  const groups = json.data?.viewer?.zones?.[0]?.httpRequestsAdaptiveGroups ?? [];
  return groups
    .filter(g => g.dimensions.clientRequestPath.startsWith('/go/'))
    .map(g => ({ path: g.dimensions.clientRequestPath, clicks: g.count }))
    .sort((a, b) => b.clicks - a.clicks);
}

const zoneId = await getZoneId();
const clicks = await getGoClicks(zoneId);

const totalClicks = clicks.reduce((sum, r) => sum + r.clicks, 0);

const byProvider = clicks.map(r => ({
  slug: r.path.replace('/go/', '').split('?')[0],
  clicks: r.clicks,
}));

const report = {
  generatedAt: new Date().toISOString(),
  periodDays: DAYS,
  from: fmt(start),
  to: fmt(end),
  totalClicks,
  byProvider,
};

writeFileSync(OUTPUT, JSON.stringify(report, null, 2) + '\n');
console.log(`Report written: ${totalClicks} total /go/* clicks across ${byProvider.length} providers`);
byProvider.forEach(p => console.log(`  /go/${p.slug}: ${p.clicks}`));
