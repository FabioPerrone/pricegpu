/**
 * Content health — the checks that catch a site quietly rotting.
 *
 *   npx tsx scripts/health.ts [--json] [--strict]
 *
 * A price comparison site fails slowly and invisibly: a scraper breaks and its
 * prices freeze, a catalogue GPU never gets a price and its page renders empty,
 * a provider's traffic earns nothing. None of that shows up in pageviews.
 * --strict exits non-zero when something is actually broken, for CI.
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';

const DATA = path.resolve('data');
const asJson = process.argv.includes('--json');
const strict = process.argv.includes('--strict');

/** Prices older than this are stale enough to mislead a buyer. */
const STALE_AFTER_DAYS = Number(process.argv[process.argv.indexOf('--max-stale-days') + 1]) || 10;

interface Provider { slug: string; name: string; affiliate_param_env: string | null }
interface GPU { slug: string; name: string }

const providers = JSON.parse(readFileSync(path.join(DATA, 'providers.json'), 'utf-8')) as Provider[];
const gpus = JSON.parse(readFileSync(path.join(DATA, 'gpus.json'), 'utf-8')) as GPU[];

const pricingSource = readFileSync(path.resolve('src/lib/pricing.ts'), 'utf-8');
const aliasBlock = pricingSource.match(/const PRICE_FILE_TO_PROVIDER: Record<string, string> = \{([\s\S]*?)\};/)?.[1] ?? '';
const aliases = Object.fromEntries([...aliasBlock.matchAll(/(\w+):\s*'([^']+)'/g)].map((m) => [m[1], m[2]]));

const now = Date.now();
const ageInDays = (iso: string): number => (now - new Date(iso).getTime()) / 86_400_000;

const feeds = readdirSync(path.join(DATA, 'prices'))
  .filter((f) => f.endsWith('.json'))
  .map((file) => {
    const base = file.replace(/\.json$/, '');
    const slug = aliases[base] ?? base;
    const data = JSON.parse(readFileSync(path.join(DATA, 'prices', file), 'utf-8'));
    const age = data.scraped_at ? ageInDays(data.scraped_at) : Infinity;
    return {
      provider: slug,
      name: providers.find((p) => p.slug === slug)?.name ?? slug,
      rows: data.items?.length ?? 0,
      scrapedAt: data.scraped_at ?? null,
      ageDays: Number.isFinite(age) ? Number(age.toFixed(1)) : null,
      stale: age > STALE_AFTER_DAYS,
      monetized: Boolean(providers.find((p) => p.slug === slug)?.affiliate_param_env),
    };
  })
  .sort((a, b) => b.rows - a.rows);

const pricedGpus = new Set<string>();
for (const file of readdirSync(path.join(DATA, 'prices')).filter((f) => f.endsWith('.json'))) {
  for (const item of JSON.parse(readFileSync(path.join(DATA, 'prices', file), 'utf-8')).items ?? []) {
    pricedGpus.add(item.gpu_slug);
  }
}

// A GPU page with no prices is an empty page that still gets indexed.
const emptyGpuPages = gpus.filter((g) => !pricedGpus.has(g.slug));
// A price row whose GPU is not in the catalogue never reaches a page.
const orphanedRows = [...pricedGpus].filter((s) => !gpus.some((g) => g.slug === s));

const report = {
  generatedAt: new Date().toISOString(),
  feeds,
  summary: {
    providers: providers.length,
    priceRows: feeds.reduce((n, f) => n + f.rows, 0),
    staleFeeds: feeds.filter((f) => f.stale).map((f) => f.provider),
    emptyFeeds: feeds.filter((f) => f.rows === 0).map((f) => f.provider),
    unmonetizedWithPrices: feeds.filter((f) => f.rows > 0 && !f.monetized).map((f) => f.provider),
    gpusInCatalogue: gpus.length,
    gpusWithPrices: gpus.length - emptyGpuPages.length,
    emptyGpuPages: emptyGpuPages.map((g) => g.slug),
    orphanedGpuSlugs: orphanedRows,
  },
};

if (asJson) {
  console.log(JSON.stringify(report, null, 2));
} else {
  const s = report.summary;
  console.log('PriceGPU health\n');
  console.log(`  price rows        ${s.priceRows}`);
  console.log(`  GPUs with prices  ${s.gpusWithPrices}/${s.gpusInCatalogue}`);
  console.log(`  stale feeds       ${s.staleFeeds.length ? s.staleFeeds.join(', ') : 'none'}`);
  console.log(`  empty feeds       ${s.emptyFeeds.length ? s.emptyFeeds.join(', ') : 'none'}`);
  console.log(`  unmonetized       ${s.unmonetizedWithPrices.length ? s.unmonetizedWithPrices.join(', ') : 'none'}`);

  console.log('\n  Feed freshness');
  for (const f of feeds) {
    const age = f.ageDays === null ? 'never' : `${f.ageDays}d`;
    const flags = [f.stale ? 'STALE' : '', f.rows === 0 ? 'EMPTY' : '', f.monetized ? '' : 'no-program']
      .filter(Boolean)
      .join(' ');
    console.log(`    ${String(f.rows).padStart(3)} rows  ${age.padStart(7)}  ${f.provider.padEnd(16)} ${flags}`);
  }

  if (s.emptyGpuPages.length) {
    console.log(`\n  GPU pages with no prices (${s.emptyGpuPages.length}): ${s.emptyGpuPages.join(', ')}`);
  }
  if (s.orphanedGpuSlugs.length) {
    console.log(`\n  ⚠️  Price rows for unknown GPUs: ${s.orphanedGpuSlugs.join(', ')}`);
  }
}

if (strict) {
  const failures = [
    report.summary.orphanedGpuSlugs.length && `${report.summary.orphanedGpuSlugs.length} orphaned GPU slug(s)`,
    report.summary.emptyFeeds.length && `${report.summary.emptyFeeds.length} empty price feed(s)`,
    report.summary.staleFeeds.length &&
      `${report.summary.staleFeeds.length} feed(s) older than ${STALE_AFTER_DAYS}d: ${report.summary.staleFeeds.join(', ')}`,
  ].filter(Boolean);
  if (failures.length) {
    console.error(`\n❌ ${failures.join('; ')}`);
    process.exit(1);
  }
}
