/**
 * Pulls the funnel out of D1 and writes data/metrics.json for the dashboard.
 *
 *   npx tsx scripts/metrics.ts [--days 30] [--json]
 *
 * Needs CF_API_TOKEN (D1 read), CF_ACCOUNT_ID and CF_D1_DATABASE_ID. Without
 * them it exits reporting that tracking is not wired yet, rather than
 * inventing numbers — a dashboard showing confident zeros is worse than one
 * that admits it cannot see.
 */
import { writeFileSync } from 'node:fs';

const CF_API_TOKEN = process.env.CF_API_TOKEN;
const CF_ACCOUNT_ID = process.env.CF_ACCOUNT_ID;
const CF_D1_DATABASE_ID = process.env.CF_D1_DATABASE_ID;
const OUTPUT = 'data/metrics.json';

const days = Number(process.argv[process.argv.indexOf('--days') + 1]) || 30;
const asJson = process.argv.includes('--json');

if (!CF_API_TOKEN || !CF_ACCOUNT_ID || !CF_D1_DATABASE_ID) {
  console.error(
    'Analytics not configured. Set CF_API_TOKEN, CF_ACCOUNT_ID and CF_D1_DATABASE_ID.\n' +
      'First-time setup:\n' +
      '  npx wrangler d1 create pricegpu-analytics\n' +
      '  npx wrangler d1 execute pricegpu-analytics --remote --file=schema.sql\n' +
      '  bind it as ANALYTICS on the Pages project'
  );
  process.exit(1);
}

async function query<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/d1/database/${CF_D1_DATABASE_ID}/query`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${CF_API_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ sql, params }),
    }
  );
  const json = (await res.json()) as {
    success: boolean;
    errors?: { message: string }[];
    result?: { results: T[] }[];
  };
  if (!json.success) throw new Error(`D1: ${json.errors?.map((e) => e.message).join(', ') ?? 'unknown error'}`);
  return json.result?.[0]?.results ?? [];
}

const since = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);

const [totals, byDay, byProvider, byPage, byGpu, byPosition, byCountry, byDevice, byReferrer, conversions] =
  await Promise.all([
    query<{ views: number; clicks: number }>(
      `SELECT SUM(type = 'view') AS views, SUM(type = 'click') AS clicks FROM event WHERE day >= ?`,
      [since]
    ),
    query(
      `SELECT day, SUM(type = 'view') AS views, SUM(type = 'click') AS clicks
       FROM event WHERE day >= ? GROUP BY day ORDER BY day`,
      [since]
    ),
    query(
      `SELECT provider, COUNT(*) AS clicks, ROUND(AVG(price_usd), 4) AS avg_price
       FROM event WHERE type = 'click' AND day >= ?
       GROUP BY provider ORDER BY clicks DESC`,
      [since]
    ),
    // The funnel that matters: which pages turn views into outbound clicks.
    query(
      `SELECT path,
              SUM(type = 'view')  AS views,
              SUM(type = 'click') AS clicks,
              ROUND(100.0 * SUM(type = 'click') / NULLIF(SUM(type = 'view'), 0), 2) AS ctr
       FROM event WHERE day >= ?
       GROUP BY path HAVING views > 0 ORDER BY views DESC LIMIT 50`,
      [since]
    ),
    query(
      `SELECT gpu,
              SUM(type = 'view')  AS views,
              SUM(type = 'click') AS clicks,
              ROUND(100.0 * SUM(type = 'click') / NULLIF(SUM(type = 'view'), 0), 2) AS ctr
       FROM event WHERE day >= ? AND gpu IS NOT NULL
       GROUP BY gpu ORDER BY views DESC LIMIT 30`,
      [since]
    ),
    // How far down a price table people actually click.
    query(
      `SELECT position, COUNT(*) AS clicks FROM event
       WHERE type = 'click' AND position IS NOT NULL AND day >= ?
       GROUP BY position ORDER BY position LIMIT 20`,
      [since]
    ),
    query(
      `SELECT country, COUNT(*) AS events FROM event
       WHERE day >= ? AND country IS NOT NULL GROUP BY country ORDER BY events DESC LIMIT 15`,
      [since]
    ),
    query(
      `SELECT device, SUM(type = 'view') AS views, SUM(type = 'click') AS clicks
       FROM event WHERE day >= ? AND device IS NOT NULL GROUP BY device`,
      [since]
    ),
    query(
      `SELECT referrer_host, COUNT(*) AS events FROM event
       WHERE day >= ? AND referrer_host IS NOT NULL GROUP BY referrer_host ORDER BY events DESC LIMIT 15`,
      [since]
    ),
    query<{ provider: string; conversions: number; revenue_usd: number }>(
      `SELECT provider, SUM(conversions) AS conversions, SUM(revenue_usd) AS revenue_usd
       FROM conversion WHERE day >= ? GROUP BY provider ORDER BY revenue_usd DESC`,
      [since]
    ),
  ]);

const views = Number(totals[0]?.views ?? 0);
const clicks = Number(totals[0]?.clicks ?? 0);
const revenue = conversions.reduce((sum, c) => sum + Number(c.revenue_usd ?? 0), 0);

const report = {
  generatedAt: new Date().toISOString(),
  periodDays: days,
  since,
  totals: {
    views,
    clicks,
    ctr: views ? Number(((100 * clicks) / views).toFixed(2)) : null,
    revenueUsd: Number(revenue.toFixed(2)),
    /** What a thousand visits are worth — the number to optimise. */
    rpmUsd: views ? Number(((1000 * revenue) / views).toFixed(2)) : null,
    /** Earnings per outbound click, the affiliate-side efficiency. */
    epcUsd: clicks ? Number((revenue / clicks).toFixed(4)) : null,
  },
  byDay,
  byProvider,
  byPage,
  byGpu,
  byPosition,
  byCountry,
  byDevice,
  byReferrer,
  conversions,
};

writeFileSync(OUTPUT, JSON.stringify(report, null, 2) + '\n');

if (asJson) {
  console.log(JSON.stringify(report, null, 2));
} else {
  const { totals: t } = report;
  console.log(`PriceGPU — last ${days} days (since ${since})\n`);
  console.log(`  views    ${views.toLocaleString()}`);
  console.log(`  clicks   ${clicks.toLocaleString()}`);
  console.log(`  CTR      ${t.ctr ?? '—'}%`);
  console.log(`  revenue  $${t.revenueUsd.toFixed(2)}`);
  console.log(`  RPM      ${t.rpmUsd === null ? '—' : `$${t.rpmUsd}`}  (per 1k views)`);
  console.log(`  EPC      ${t.epcUsd === null ? '—' : `$${t.epcUsd}`}  (per click)`);

  if (byPage.length) {
    console.log('\n  Top pages by views');
    for (const p of byPage.slice(0, 10) as Record<string, unknown>[]) {
      console.log(`    ${String(p.ctr ?? 0).padStart(6)}%  ${String(p.views).padStart(6)} views  ${p.path}`);
    }
  }
  if (byProvider.length) {
    console.log('\n  Clicks by provider');
    for (const p of byProvider as Record<string, unknown>[]) {
      console.log(`    ${String(p.clicks).padStart(6)}  ${p.provider}`);
    }
  }
  console.log(`\nWrote ${OUTPUT}`);
}
