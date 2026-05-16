import { existsSync, writeFileSync, readFileSync, readdirSync, mkdirSync } from 'fs';
import { execSync } from 'child_process';
import path from 'path';

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const PRICES_DIR = 'data/prices';
const BLOG_DIR = 'src/content/blog';
const AUTHOR = 'Alex Torres';
const OG_DIR = 'public/og';

// ── OG image ──────────────────────────────────────────────────────────────────

interface PricePoint { gpu: string; price: number; provider: string }

function escXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function wrapWords(text: string, maxChars: number): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length <= maxChars) { current = next; }
    else { if (current) lines.push(current); current = word; }
  }
  if (current) lines.push(current);
  return lines;
}

async function generateOgImage(headline: string, prices: PricePoint[]): Promise<Buffer> {
  const { Resvg } = await import('@resvg/resvg-js');

  const lines = wrapWords(headline, 38);
  const fontSize = lines.length > 2 ? 44 : 52;
  const headlineSvg = lines.slice(0, 3).map((line, i) =>
    `<text x="60" y="${200 + i * (fontSize + 14)}" font-size="${fontSize}" fill="#f1f5f9" font-family="DejaVu Sans,Liberation Sans,Arial,sans-serif" font-weight="bold">${escXml(line)}</text>`
  ).join('\n  ');

  const BOX_Y = 430;
  const BOX_W = 255;
  const pricesSvg = prices.slice(0, 4).map((p, i) => {
    const x = 60 + i * (BOX_W + 20);
    const gpuLabel = p.gpu.replace(/-/g, ' ').replace(/\b(sxm|pcie|gb)\b/gi, s => s.toUpperCase());
    return `
  <rect x="${x}" y="${BOX_Y}" width="${BOX_W}" height="100" rx="10" fill="#1e293b"/>
  <text x="${x + 20}" y="${BOX_Y + 25}" font-size="12" fill="#94a3b8" font-family="DejaVu Sans,Liberation Sans,Arial,sans-serif">${escXml(gpuLabel)}</text>
  <text x="${x + 20}" y="${BOX_Y + 62}" font-size="28" fill="#34d399" font-family="DejaVu Sans,Liberation Sans,Arial,sans-serif" font-weight="bold">$${p.price.toFixed(2)}/hr</text>
  <text x="${x + 20}" y="${BOX_Y + 85}" font-size="13" fill="#64748b" font-family="DejaVu Sans,Liberation Sans,Arial,sans-serif">${escXml(p.provider)}</text>`;
  }).join('');

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630">
  <rect width="1200" height="630" fill="#0f172a"/>
  <rect width="1200" height="5" fill="#3b82f6"/>
  <text x="60" y="90" font-size="15" fill="#60a5fa" font-family="DejaVu Sans,Liberation Sans,Arial,sans-serif" font-weight="bold">GPU MARKET UPDATE · PRICEGPU.COM</text>
  ${headlineSvg}
  ${pricesSvg}
  <text x="60" y="598" font-size="13" fill="#334155" font-family="DejaVu Sans,Liberation Sans,Arial,sans-serif">Live pricing data tracked across 15 cloud providers</text>
</svg>`;

  const resvg = new Resvg(svg, { font: { loadSystemFonts: true } });
  return Buffer.from(resvg.render().asPng());
}

// ── Price table ───────────────────────────────────────────────────────────────

function buildPriceTable(snapshot: Record<string, { price: number; provider: string }>, gpuList: string[]): string {
  const rows = gpuList
    .filter(g => snapshot[g])
    .map(g => {
      const { price, provider } = snapshot[g];
      const label = g.replace(/-/g, ' ').replace(/\b(sxm|pcie|gb)\b/gi, s => s.toUpperCase());
      return `| ${label} | $${price.toFixed(2)}/hr | ${provider} |`;
    });
  if (!rows.length) return '';
  return `\n\n## Current GPU Prices\n\n| GPU | Best Price | Provider |\n|-----|-----------|----------|\n${rows.join('\n')}\n\n*Data from PriceGPU live tracking across 15 providers.*`;
}

if (!GROQ_API_KEY) {
  console.error('Missing GROQ_API_KEY');
  process.exit(1);
}

const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
const slug = `gpu-market-${today}`;
const outputPath = path.join(BLOG_DIR, `${slug}.mdx`);

if (existsSync(outputPath)) {
  console.log(`Today's article already exists: ${outputPath}`);
  process.exit(0);
}

// ── Price data ────────────────────────────────────────────────────────────────

interface PriceItem {
  gpu_slug: string;
  configuration: string;
  price_usd_per_hour: number;
  availability: string;
  region: string;
}

interface PriceFile {
  scraped_at: string;
  items: PriceItem[];
}

function loadPrices(): Record<string, PriceItem[]> {
  const result: Record<string, PriceItem[]> = {};
  for (const file of readdirSync(PRICES_DIR).filter(f => f.endsWith('.json'))) {
    const provider = file.replace('.json', '');
    try {
      const data = JSON.parse(readFileSync(path.join(PRICES_DIR, file), 'utf-8')) as PriceFile;
      result[provider] = data.items ?? [];
    } catch { /* skip */ }
  }
  return result;
}

function loadPrevPrices(): Record<string, PriceItem[]> {
  const result: Record<string, PriceItem[]> = {};
  for (const file of readdirSync(PRICES_DIR).filter(f => f.endsWith('.json'))) {
    const provider = file.replace('.json', '');
    try {
      const json = execSync(`git show HEAD~1:${PRICES_DIR}/${file}`, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] });
      const data = JSON.parse(json) as PriceFile;
      result[provider] = data.items ?? [];
    } catch { /* no history */ }
  }
  return result;
}

function lowestPrice(items: PriceItem[], gpuSlug: string): number | null {
  const matches = items.filter(i => i.gpu_slug === gpuSlug && i.price_usd_per_hour > 0);
  if (!matches.length) return null;
  return Math.min(...matches.map(i => i.price_usd_per_hour));
}

// ── Build market context ──────────────────────────────────────────────────────

const KEY_GPUS = ['h100-80gb-sxm', 'h100-80gb-pcie', 'a100-80gb-sxm', 'a100-40gb', 'rtx-4090', 'l40s', 'a10g', 'rtx-3090'];

const current = loadPrices();
const previous = loadPrevPrices();

// Lowest price per GPU across all providers
const marketSnapshot: Record<string, { price: number; provider: string }> = {};
for (const [provider, items] of Object.entries(current)) {
  for (const item of items) {
    if (!item.gpu_slug || item.price_usd_per_hour <= 0) continue;
    const existing = marketSnapshot[item.gpu_slug];
    if (!existing || item.price_usd_per_hour < existing.price) {
      marketSnapshot[item.gpu_slug] = { price: item.price_usd_per_hour, provider };
    }
  }
}

// Week-over-week changes
interface PriceChange { gpu: string; current: number; previous: number; pct: number; provider: string }
const changes: PriceChange[] = [];

for (const gpu of KEY_GPUS) {
  const snap = marketSnapshot[gpu];
  if (!snap) continue;
  // find lowest previous across all providers
  let prevLowest: number | null = null;
  for (const items of Object.values(previous)) {
    const p = lowestPrice(items, gpu);
    if (p !== null && (prevLowest === null || p < prevLowest)) prevLowest = p;
  }
  if (prevLowest !== null && prevLowest > 0) {
    const pct = ((snap.price - prevLowest) / prevLowest) * 100;
    if (Math.abs(pct) >= 1) {
      changes.push({ gpu, current: snap.price, previous: prevLowest, pct, provider: snap.provider });
    }
  }
}

changes.sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct));

// Build readable context for prompt
const snapshotLines = KEY_GPUS
  .filter(g => marketSnapshot[g])
  .map(g => {
    const s = marketSnapshot[g];
    return `  ${g}: $${s.price.toFixed(2)}/hr (cheapest: ${s.provider})`;
  }).join('\n');

const changesLines = changes.length > 0
  ? changes.slice(0, 6).map(c =>
    `  ${c.gpu}: $${c.current.toFixed(2)}/hr now vs $${c.previous.toFixed(2)}/hr before (${c.pct > 0 ? '+' : ''}${c.pct.toFixed(1)}%) on ${c.provider}`
  ).join('\n')
  : '  No significant price changes detected since last scrape.';

const hasChanges = changes.length > 0;
const biggestDrop = changes.filter(c => c.pct < 0)[0];
const biggestRise = changes.filter(c => c.pct > 0)[0];

// ── Groq call ─────────────────────────────────────────────────────────────────

const systemPrompt = `You are Alex Torres, GPU market analyst at PriceGPU — a site that tracks real-time GPU cloud rental prices across 15 providers.

Write news articles in the style of The Register or Ars Technica tech reporting: direct, technical, mildly opinionated, data-driven. Your readers are ML engineers who rent GPUs for training and inference work. They care about actual dollar figures, not vague trends.

STRICT WRITING RULES:
- Active voice throughout. No passive constructions.
- No filler phrases: never write "in the rapidly evolving", "it's worth noting", "delve into", "landscape", "it is important to", "in conclusion", "as we can see", "needless to say"
- No AI-sounding corporate language
- Use specific numbers with two decimal places for prices: "$2.49/hr", not "around $2.50"
- Attribution: cite data as "PriceGPU tracking shows" or "according to PriceGPU data" — not "recent studies show"
- Tone: confident, slightly dry, technically precise
- Headline: max 65 characters, punchy and specific — use numbers, dollar amounts, or percentages. Make engineers want to click. Examples of good style: "RunPod Slashes H100 Prices 18% as Vast.ai Holds Firm", "H100 Hits $1.99/hr — Cheapest Ever on Any Major Cloud", "A100 Glut Drives Prices to 6-Month Low Across Five Providers"
- Write third-person throughout — do NOT refer to yourself as "I"`;

const userPrompt = `Write a GPU cloud market news article for ${today}.

CURRENT MARKET DATA (from PriceGPU live tracking across 15 providers):
${snapshotLines}

PRICE CHANGES vs LAST SCRAPE:
${changesLines}

ARTICLE REQUIREMENTS:
- Headline: under 65 chars, specific, contains a price or percentage${hasChanges ? ', reference the biggest move' : ''}
- Length: 480–560 words
- Structure:
  1. Headline (no "##", just the text)
  2. Dateline: "SAN FRANCISCO, ${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }).toUpperCase()} —"
  3. Lede: one sentence, the single most important fact
  4. Context paragraph: what's driving this / what it means for engineers
  5. Data paragraph: 2–3 specific price comparisons with provider names and figures
  6. ${hasChanges ? `Change analysis: detail the ${biggestDrop ? `${Math.abs(biggestDrop.pct).toFixed(1)}% drop on ${biggestDrop.gpu}` : ''}${biggestDrop && biggestRise ? ' and ' : ''}${biggestRise ? `${biggestRise.pct.toFixed(1)}% rise on ${biggestRise.gpu}` : ''} with practical implications` : 'Market stability note: what staying flat means for budget planning'}
  7. Practical close: one actionable sentence for an engineer deciding what to rent today

OUTPUT FORMAT: Return ONLY the article text. No markdown headers. No meta-commentary. Start directly with the headline on the first line.`;

const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${GROQ_API_KEY}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    model: 'llama-3.3-70b-versatile',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    temperature: 0.7,
    max_tokens: 1200,
  }),
});

const json = await res.json() as { choices?: { message: { content: string } }[]; error?: { message: string } };
if (json.error) { console.error('Groq error:', json.error.message); process.exit(1); }

const raw = json.choices?.[0]?.message?.content?.trim() ?? '';
if (!raw) { console.error('Empty response from Groq'); process.exit(1); }

// Extract headline (first line) and body
const lines = raw.split('\n').filter(l => l.trim());
const headline = lines[0].replace(/^#+\s*/, '').replace(/\*\*/g, '').trim();
const body = lines.slice(1).join('\n\n').trim();

// Build description from lede (first non-empty line after headline)
const lede = lines.slice(1).find(l => l.trim().length > 40) ?? '';
const description = lede.replace(/^SAN FRANCISCO.*?—\s*/i, '').slice(0, 160).trim();

// Tags from GPUs mentioned
const tags = ['gpu-pricing', 'cloud-gpu', 'market-update'];
for (const gpu of KEY_GPUS) {
  if (raw.toLowerCase().includes(gpu.replace(/-/g, ' ').split(' ').slice(0,2).join(' '))) {
    tags.push(gpu.split('-').slice(0, 2).join('-'));
  }
}
const uniqueTags = [...new Set(tags)].slice(0, 6);

// ── Generate OG image ─────────────────────────────────────────────────────────

mkdirSync(OG_DIR, { recursive: true });
const ogRelPath = `${OG_DIR}/${slug}.png`;
const ogUrl = `/og/${slug}.png`;

const topPrices: PricePoint[] = KEY_GPUS
  .filter(g => marketSnapshot[g])
  .slice(0, 4)
  .map(g => ({ gpu: g, price: marketSnapshot[g].price, provider: marketSnapshot[g].provider }));

let ogImageWritten = false;
try {
  const pngBuffer = await generateOgImage(headline, topPrices);
  writeFileSync(ogRelPath, pngBuffer);
  ogImageWritten = true;
  console.log(`OG image written: ${ogRelPath}`);
} catch (err) {
  console.warn('OG image generation failed (non-fatal):', err);
}

// ── Price table ───────────────────────────────────────────────────────────────

const priceTable = buildPriceTable(marketSnapshot, KEY_GPUS);

// ── Write MDX ─────────────────────────────────────────────────────────────────

const mdx = `---
title: "${headline.replace(/"/g, '\\"')}"
description: "${description.replace(/"/g, '\\"')}"
pubDate: ${today}
slug: ${slug}
author: "${AUTHOR}"
tags: [${uniqueTags.map(t => `"${t}"`).join(', ')}]
isNews: true
${ogImageWritten ? `image: "${ogUrl}"` : ''}
---

${body}
${priceTable}
`;

writeFileSync(outputPath, mdx);
console.log(`Article written: ${outputPath}`);
console.log(`Headline: ${headline}`);
