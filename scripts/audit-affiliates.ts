import fs from 'node:fs';
import path from 'node:path';

const DATA_DIR = path.resolve(process.cwd(), 'data');

interface Provider {
  slug: string;
  affiliate_param_env: string | null;
  affiliate_url_template: string;
}

const providers = JSON.parse(
  fs.readFileSync(path.join(DATA_DIR, 'providers.json'), 'utf-8')
) as Provider[];

// Load ENV_REFS from src/pages/go/[partner].astro
const goPageContent = fs.readFileSync(
  path.join(process.cwd(), 'src/pages/go/[partner].astro'),
  'utf-8'
);

// Extract ENV_REFS keys using regex
const envRefsMatch = goPageContent.match(/const ENV_REFS: Record<string, string> = \{([\s\S]*?)\};/);
const definedEnvs = new Set<string>();
if (envRefsMatch) {
  const envBlock = envRefsMatch[1];
  const keyMatches = envBlock.match(/(\w+):/g);
  if (keyMatches) {
    keyMatches.forEach((match) => {
      const key = match.replace(':', '').trim();
      definedEnvs.add(key);
    });
  }
}

let issues = 0;

// Check each provider
for (const provider of providers) {
  if (provider.affiliate_param_env) {
    // Has a param env set
    if (!definedEnvs.has(provider.affiliate_param_env)) {
      console.error(
        `❌ ${provider.slug}: affiliate_param_env="${provider.affiliate_param_env}" not found in ENV_REFS`
      );
      issues++;
    }

    // Check if env var is empty
    const envValue = process.env[provider.affiliate_param_env];
    if (!envValue) {
      console.warn(
        `⚠️  ${provider.slug}: env var ${provider.affiliate_param_env} is empty or missing`
      );
    }
  }
}

if (issues > 0) {
  console.error(`\n❌ Found ${issues} affiliate issues. Fix before deploying.`);
  process.exit(1);
} else {
  console.log(`✅ All affiliate params are properly configured.`);
}
