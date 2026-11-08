#!/usr/bin/env tsx
/**
 * Weekly GPU market report, computed entirely from the scraped data.
 *
 * Replaces a daily LLM-written "news" post. Those posts had nothing to say on
 * most days, so a model padded the same figures into 500 words and speculated
 * about what was driving them. Every number here comes from data/prices or
 * data/history, and it costs nothing to run.
 *
 *   npx tsx scripts/generate-market-report.ts
 *
 * Exits 0 without writing when the data is too thin, because the freshness
 * gate in scrape-prices is what raises the alarm for that.
 */
import { existsSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { formatPrice, getAllPrices, getGPUs, getProviders, MAX_PRICE_AGE_DAYS } from '../src/lib/pricing.ts';
import { getHistory } from '../src/lib/history.ts';

const MIN_PROVIDERS = 4;
const BLOG_DIR = 'src/content/blog';

const today = new Date().toISOString().slice(0, 10);
const slug = `gpu-cloud-prices-${today}`;
const outputPath = path.join(BLOG_DIR, `${slug}.mdx`);

if (existsSync(outputPath)) {
  console.log(`Already published: ${outputPath}`);
  process.exit(0);
}

const prices = getAllPrices();
const providerNames = new Map(getProviders().map((p) => [p.slug, p.name]));
const nameOf = (providerSlug: string): string => providerNames.get(providerSlug) ?? providerSlug;
const liveProviders = new Set(prices.map((p) => p.provider_slug));

if (liveProviders.size < MIN_PROVIDERS) {
  console.log(`Only ${liveProviders.size} live provider(s), need ${MIN_PROVIDERS}. Skipping this week's report.`);
  process.exit(0);
}

interface Row {
  slug: string;
  name: string;
  low: number;
  high: number;
  lowProvider: string;
  providers: number;
}

const rows: Row[] = getGPUs()
  .map((gpu) => {
    const offers = prices.filter((p) => p.gpu_slug === gpu.slug && p.price_usd_per_hour > 0);
    if (offers.length === 0) return null;
    const cheapest = offers.reduce((a, b) => (b.price_usd_per_hour < a.price_usd_per_hour ? b : a));
    return {
      slug: gpu.slug,
      name: gpu.name,
      low: cheapest.price_usd_per_hour,
      high: Math.max(...offers.map((o) => o.price_usd_per_hour)),
      lowProvider: cheapest.provider_slug,
      providers: new Set(offers.map((o) => o.provider_slug)).size,
    };
  })
  .filter((r): r is Row => r !== null)
  .sort((a, b) => b.low - a.low);

const link = (r: Row): string => `[${r.name}](/gpu/${r.slug})`;
const table = (headers: string[], body: string[][]): string =>
  [`| ${headers.join(' | ')} |`, `| ${headers.map(() => '---').join(' | ')} |`, ...body.map((c) => `| ${c.join(' | ')} |`)].join('\n');

// ── Week over week ──────────────────────────────────────────────────────────
const weekAgo = new Date(Date.now() - 7 * 86_400_000).toISOString().slice(0, 10);
const moves = rows
  .map((r) => {
    const past = getHistory(r.slug).filter((p) => p.date <= weekAgo).at(-1);
    return past ? { row: r, before: past.price, pct: ((r.low - past.price) / past.price) * 100 } : null;
  })
  .filter((m): m is NonNullable<typeof m> => m !== null);
const significant = moves.filter((m) => Math.abs(m.pct) >= 1).sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct));

const movesSection =
  moves.length === 0
    ? 'Week-over-week figures appear here once a full week of price history has been recorded.'
    : significant.length === 0
      ? `None of the ${moves.length} GPUs with a week of history moved by 1% or more at the low end.`
      : table(
          ['GPU', 'Last week', 'Now', 'Change'],
          significant.map((m) => [link(m.row), formatPrice(m.before), formatPrice(m.row.low), `${m.pct > 0 ? '+' : ''}${m.pct.toFixed(1)}%`])
        );

// ── Spread: where shopping around pays ─────────────────────────────────────
const spreads = rows
  .filter((r) => r.providers >= 2 && r.low > 0)
  .map((r) => ({ row: r, ratio: r.high / r.low }))
  .sort((a, b) => b.ratio - a.ratio)
  .slice(0, 8);

// ── Who is cheapest most often ──────────────────────────────────────────────
const wins = new Map<string, number>();
for (const r of rows) wins.set(r.lowProvider, (wins.get(r.lowProvider) ?? 0) + 1);
const leaderboard = [...wins.entries()].sort((a, b) => b[1] - a[1]);

// ── Article ─────────────────────────────────────────────────────────────────
const lead = rows.find((r) => r.slug === 'h100-sxm') ?? rows[0];
const title = `GPU cloud prices for ${today}: ${lead.name} from ${formatPrice(lead.low)}`;
const description = `Cheapest rental price for ${rows.length} GPU models across ${liveProviders.size} cloud providers, with price spreads and week-over-week changes.`;

const body = `This report is generated automatically from PriceGPU's daily price scrape. It covers ${rows.length} GPU models and ${prices.length} listed offers from the ${liveProviders.size} providers whose data refreshed in the last ${MAX_PRICE_AGE_DAYS} days. Check the provider's site before renting, since prices can change at any time.

## Cheapest price by GPU

${table(
  ['GPU', 'From', 'Cheapest at', 'Providers'],
  rows.map((r) => [link(r), formatPrice(r.low), nameOf(r.lowProvider), String(r.providers)])
)}

## Changes since last week

${movesSection}

## Where comparing providers saves the most

The ratio is the highest listed price divided by the lowest for the same GPU. Listings can differ in region, configuration and availability.

${table(
  ['GPU', 'Lowest', 'Highest', 'Ratio'],
  spreads.map((s) => [link(s.row), formatPrice(s.row.low), formatPrice(s.row.high), `${s.ratio.toFixed(1)}x`])
)}

## Most often the cheapest

${table(['Provider', 'GPUs where it has the lowest price'], leaderboard.map(([p, n]) => [`[${nameOf(p)}](/provider/${p})`, String(n)]))}

See [how these prices are collected](/methodology) or download them from the [public JSON API](/api/prices.json).
`;

const esc = (s: string): string => s.replace(/"/g, '\\"');
writeFileSync(
  outputPath,
  `---
title: "${esc(title)}"
description: "${esc(description)}"
pubDate: ${today}
slug: ${slug}
author: "PriceGPU"
tags: ["gpu-pricing", "market-report"]
isNews: false
---

${body}`
);
console.log(`Report written: ${outputPath}`);
