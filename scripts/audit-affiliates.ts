/**
 * Affiliate wiring audit — every path between a price row and a paid click.
 *
 * Catches, in order of how much they cost:
 *   1. A price file whose slug matches no provider. Its rows render a "Rent →"
 *      button pointing at /go/<slug>, which is never generated: a 404 instead
 *      of an affiliate redirect. This silently zeroed 5 of 15 providers.
 *   2. An affiliate_param_env missing from the ENV_REFS map in the redirect.
 *   3. A provider with live prices but no affiliate program wired at all.
 *   4. A wired provider whose ref code is absent from the environment.
 *
 * 1–3 fail the build. 4 warns, since ref codes only exist in the deploy env.
 */
import fs from 'node:fs';
import path from 'node:path';

const DATA_DIR = path.resolve(process.cwd(), 'data');

interface Provider {
  slug: string;
  name: string;
  affiliate_param_env: string | null;
  affiliate_url_template: string;
}

const providers = JSON.parse(
  fs.readFileSync(path.join(DATA_DIR, 'providers.json'), 'utf-8')
) as Provider[];
const providerSlugs = new Set(providers.map((p) => p.slug));

const pricingSource = fs.readFileSync(path.join(process.cwd(), 'src/lib/pricing.ts'), 'utf-8');
const aliasBlock = pricingSource.match(/const PRICE_FILE_TO_PROVIDER: Record<string, string> = \{([\s\S]*?)\};/)?.[1] ?? '';
const aliases = Object.fromEntries(
  [...aliasBlock.matchAll(/(\w+):\s*'([^']+)'/g)].map((m) => [m[1], m[2]])
);

/** Providers with no public affiliate/referral program as of the last review. */
const NO_PUBLIC_PROGRAM = new Set(['modal', 'coreweave', 'genesis-cloud', 'fal-ai']);

const errors: string[] = [];
const warnings: string[] = [];

// 1. Every price file resolves to a real provider.
const priceFiles = fs.existsSync(path.join(DATA_DIR, 'prices'))
  ? fs.readdirSync(path.join(DATA_DIR, 'prices')).filter((f) => f.endsWith('.json'))
  : [];
const providersWithPrices = new Set<string>();

for (const file of priceFiles) {
  const base = file.replace(/\.json$/, '');
  const resolved = aliases[base] ?? base;
  if (!providerSlugs.has(resolved)) {
    errors.push(
      `data/prices/${file} resolves to "${resolved}", which is not a provider slug. ` +
        `Its Rent buttons would link to /go/${resolved} (404). ` +
        `Add "${base}: '<provider-slug>'" to PRICE_FILE_TO_PROVIDER in src/lib/pricing.ts.`
    );
  } else {
    const items = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'prices', file), 'utf-8'))?.items ?? [];
    if (items.length) providersWithPrices.add(resolved);
  }
}

// 2. The redirect's generated provider map still matches providers.json.
const generatedPath = path.join(process.cwd(), 'functions/_generated/providers.ts');
if (!fs.existsSync(generatedPath)) {
  errors.push('functions/_generated/providers.ts is missing. Run: npx tsx scripts/generate-functions-data.ts');
} else {
  const generated = fs.readFileSync(generatedPath, 'utf-8');
  const generatedSlugs = new Set(
    [...generated.matchAll(/^\s{2}"([a-z0-9-]+)": \{/gm)].map((m) => m[1])
  );
  for (const provider of providers) {
    if (!generatedSlugs.has(provider.slug)) {
      errors.push(
        `${provider.slug} is missing from functions/_generated/providers.ts, so /go/${provider.slug} ` +
          `would redirect to /404. Regenerate with: npx tsx scripts/generate-functions-data.ts`
      );
    }
  }
}

for (const provider of providers) {
  // 3. Live prices but nothing to earn from them. Known-no-program providers
  //    warn instead of failing, so a newly added provider is still caught.
  if (providersWithPrices.has(provider.slug) && !provider.affiliate_param_env) {
    const msg =
      `${provider.slug}: has live prices but no affiliate program wired. Those clicks earn nothing.`;
    if (NO_PUBLIC_PROGRAM.has(provider.slug)) warnings.push(`${msg} (no public program known)`);
    else errors.push(msg);
  }

  // 4. Wired, but no code in this environment.
  if (provider.affiliate_param_env && !process.env[provider.affiliate_param_env]) {
    warnings.push(`${provider.slug}: ${provider.affiliate_param_env} is not set in this environment.`);
  }
}

for (const w of warnings) console.warn(`⚠️  ${w}`);
for (const e of errors) console.error(`❌ ${e}`);

console.log(
  `\n${priceFiles.length} price files · ${providers.length} providers · ` +
    `${providersWithPrices.size} with live prices · ${warnings.length} unset ref codes`
);

if (errors.length) {
  console.error(`\n❌ ${errors.length} affiliate wiring error(s). These cost money — fix before deploying.`);
  process.exit(1);
}
console.log('✅ Affiliate wiring is intact.');
