/**
 * Internal link audit — crawls dist/ and reports links that resolve to nothing.
 *
 * A broken primary CTA is invisible in pageview analytics (the 404 is still a
 * pageview), so this runs in CI and fails the build rather than reporting.
 *
 *   npx tsx scripts/audit-links.ts [--json]
 */
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';

const DIST = 'dist';
const asJson = process.argv.includes('--json');

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (entry.endsWith('.html')) out.push(full);
  }
  return out;
}

/**
 * Paths served by a Pages Function rather than a file on disk. Without this
 * the audit would report every affiliate redirect as broken.
 *
 * Derived from the functions/ directory, since Cloudflare generates the
 * deployed _routes.json at publish time and it is not present in dist/.
 * functions/go/[partner].ts serves /go/*, functions/api/alert.ts serves
 * /api/alert, and so on.
 */
const functionRoutes: string[] = (() => {
  const root = 'functions';
  if (!existsSync(root)) return [];
  const routes: string[] = [];
  const walk = (dir: string, prefix: string) => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) {
        if (entry.startsWith('_')) continue;
        walk(full, `${prefix}/${entry}`);
      } else if (entry.endsWith('.ts') && !entry.startsWith('_')) {
        const name = entry.replace(/\.ts$/, '');
        routes.push(name.startsWith('[') ? `${prefix}/*` : `${prefix}/${name}`);
      }
    }
  };
  walk(root, '');
  return routes;
})();

function servedByFunction(path: string): boolean {
  return functionRoutes.some((route) =>
    route.endsWith('/*') ? path.startsWith(route.slice(0, -1)) : path === route
  );
}

/** Map a site-absolute href to the file or function that would serve it. */
function resolves(href: string): boolean {
  const clean = href.split('#')[0].split('?')[0];
  if (!clean || clean === '/') return true;
  if (servedByFunction(clean)) return true;
  const base = join(DIST, clean);
  return existsSync(base) || existsSync(base + '.html') || existsSync(join(base, 'index.html'));
}

const pages = walk(DIST);
const broken = new Map<string, Set<string>>();
let checked = 0;

for (const page of pages) {
  const html = readFileSync(page, 'utf8');
  const from = '/' + relative(DIST, page).replace(/index\.html$/, '').replace(/\.html$/, '');
  for (const m of html.matchAll(/href="(\/[^"]*)"/g)) {
    const href = m[1];
    if (href.startsWith('//')) continue;
    checked++;
    if (!resolves(href)) {
      if (!broken.has(href)) broken.set(href, new Set());
      broken.get(href)!.add(from);
    }
  }
}

const report = [...broken.entries()]
  .map(([href, sources]) => ({ href, count: sources.size, sample: [...sources].slice(0, 3) }))
  .sort((a, b) => b.count - a.count);

if (asJson) {
  console.log(JSON.stringify({ pages: pages.length, links: checked, broken: report }, null, 2));
} else {
  console.log(`Crawled ${pages.length} pages, ${checked} internal links.`);
  if (!report.length) console.log('✓ No broken internal links.');
  else {
    console.log(`\n✗ ${report.length} broken target(s):\n`);
    for (const r of report) console.log(`  ${r.href}  — linked from ${r.count} page(s), e.g. ${r.sample.join(', ')}`);
  }
}

process.exit(report.length ? 1 : 0);
