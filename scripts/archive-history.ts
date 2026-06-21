import fs from 'node:fs';
import path from 'node:path';

const DATA_DIR = path.resolve(process.cwd(), 'data');
const PRICES_DIR = path.join(DATA_DIR, 'prices');
const HISTORY_DIR = path.join(DATA_DIR, 'history');

// Ensure history directory exists
if (!fs.existsSync(HISTORY_DIR)) {
  fs.mkdirSync(HISTORY_DIR, { recursive: true });
}

// Archive today's cheapest prices per GPU
interface ProviderPrices {
  scraped_at: string;
  scraper_version: string;
  items: Array<{ gpu_slug: string; price_usd_per_hour: number; provider_slug: string }>;
}

interface PricePoint {
  date: string;
  price: number;
  provider: string;
}

const today = new Date().toISOString().split('T')[0];
const cheapestByGPU = new Map<string, { price: number; provider: string }>();

// Find cheapest price per GPU across all providers
const pricesFiles = fs.readdirSync(PRICES_DIR).filter(f => f.endsWith('.json'));
for (const file of pricesFiles) {
  try {
    const data = JSON.parse(
      fs.readFileSync(path.join(PRICES_DIR, file), 'utf-8')
    ) as ProviderPrices;

    for (const item of data.items) {
      const key = item.gpu_slug;
      if (!cheapestByGPU.has(key) || item.price_usd_per_hour < cheapestByGPU.get(key)!.price) {
        cheapestByGPU.set(key, {
          price: item.price_usd_per_hour,
          provider: file.replace('.json', ''),
        });
      }
    }
  } catch (err) {
    console.warn(`Failed to parse ${file}:`, err);
  }
}

// Archive to history files
let archived = 0;
for (const [gpuSlug, { price, provider }] of cheapestByGPU.entries()) {
  const historyPath = path.join(HISTORY_DIR, `${gpuSlug}.json`);

  let history: PricePoint[] = [];
  if (fs.existsSync(historyPath)) {
    try {
      history = JSON.parse(fs.readFileSync(historyPath, 'utf-8'));
    } catch {
      history = [];
    }
  }

  // Add today's point (skip if already exists)
  if (!history.some(p => p.date === today)) {
    history.push({ date: today, price, provider });
    // Keep last 365 days
    if (history.length > 365) {
      history = history.slice(-365);
    }
    fs.writeFileSync(historyPath, JSON.stringify(history, null, 2));
    archived++;
  }
}

console.log(`✅ Archived ${archived} GPU price points for ${today}`);
