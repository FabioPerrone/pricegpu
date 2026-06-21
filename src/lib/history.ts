import fs from 'node:fs';
import path from 'node:path';

const DATA_DIR = path.resolve(process.cwd(), 'data');

export interface PricePoint {
  date: string;
  price: number;
  provider: string;
}

export function getHistory(gpuSlug: string): PricePoint[] {
  const historyPath = path.join(DATA_DIR, 'history', `${gpuSlug}.json`);
  try {
    if (!fs.existsSync(historyPath)) return [];
    const raw = fs.readFileSync(historyPath, 'utf-8');
    return JSON.parse(raw) as PricePoint[];
  } catch {
    return [];
  }
}

export function getPriceChange(gpuSlug: string, days: number): { percentage: number; direction: 'up' | 'down' | 'stable' } {
  const history = getHistory(gpuSlug);
  if (history.length < 2) return { percentage: 0, direction: 'stable' };

  const now = new Date();
  const cutoff = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

  const recentHistory = history.filter(p => new Date(p.date) >= cutoff);
  if (recentHistory.length < 2) return { percentage: 0, direction: 'stable' };

  // Sort by date
  const sorted = recentHistory.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  const oldest = sorted[0].price;
  const newest = sorted[sorted.length - 1].price;

  if (oldest === newest) return { percentage: 0, direction: 'stable' };

  const percentage = Math.abs(((newest - oldest) / oldest) * 100);
  const direction = newest < oldest ? 'down' : 'up';

  return { percentage, direction };
}

export function generateSparklineSVG(gpuSlug: string, width = 160, height = 40): string | null {
  const history = getHistory(gpuSlug);
  if (history.length < 2) return null;

  const sorted = history.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  const prices = sorted.map(p => p.price);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const range = max - min || 1;

  const points = prices.map((price, i) => {
    const x = (i / (prices.length - 1)) * width;
    const y = height - ((price - min) / range) * (height - 8) - 4;
    return `${x},${y}`;
  });

  const polylinePoints = points.join(' ');
  const color = sorted[sorted.length - 1].price < sorted[0].price ? '#00D26A' : '#ff6666';

  return `<svg viewBox="0 0 ${width} ${height}" style="width:100%;height:auto;"><polyline points="${polylinePoints}" stroke="${color}" stroke-width="2" fill="none" vector-effect="non-scaling-stroke"/></svg>`;
}
