# Google News Compliance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make pricegpu.com news articles fully compliant with Google News requirements by adding OG images, fixing og:type, adding image to NewsArticle JSON-LD, and enriching article content with a price comparison table.

**Architecture:** (1) `generate-news.ts` generates a per-article PNG using `@resvg/resvg-js` + raw SVG, saves to `public/og/`, and embeds the path + a markdown price table in the MDX. (2) `content.config.ts` adds the `image` field. (3) `Layout.astro` accepts `ogImage`/`ogType` props and emits the correct meta tags. (4) `[slug].astro` passes article data to Layout and injects `image` into the NewsArticle JSON-LD.

**Tech Stack:** Astro 6 (static), MDX, TypeScript, `@resvg/resvg-js` (WASM, no native bindings), GitHub Actions (ubuntu-latest)

---

## File Map

| File | Action | What changes |
|------|--------|--------------|
| `scripts/generate-news.ts` | Modify | Add OG image generation + price table in MDX body + `image` frontmatter field |
| `src/content.config.ts` | Modify | Add `image: z.string().optional()` to blog schema |
| `src/layouts/Layout.astro` | Modify | Accept `ogImage` and `ogType` props; emit `og:image`, `og:type` meta |
| `src/pages/blog/[slug].astro` | Modify | Pass `ogImage`/`ogType` to Layout; add `image` to NewsArticle JSON-LD |
| `.github/workflows/generate-news.yml` | Modify | `git add` must include `public/og/` |

---

### Task 1: Add `image` field to blog content schema

**Files:**
- Modify: `src/content.config.ts`

- [ ] **Step 1: Add optional image field to schema**

Edit `src/content.config.ts` — replace the existing `schema` object with:

```typescript
import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const blog = defineCollection({
  loader: glob({ pattern: ['**/*.md', '**/*.mdx'], base: './src/content/blog' }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    pubDate: z.coerce.date(),
    slug: z.string(),
    author: z.string().default('Alex Torres'),
    canonical_url: z.string().url().optional(),
    tags: z.array(z.string()).default([]),
    draft: z.boolean().default(false),
    isNews: z.boolean().default(false),
    image: z.string().optional(),
  }),
});

export const collections = { blog };
```

- [ ] **Step 2: Verify build still works**

```bash
npm run build 2>&1 | tail -20
```

Expected: no TypeScript errors, build completes.

- [ ] **Step 3: Commit**

```bash
git add src/content.config.ts
git commit -m "feat: add optional image field to blog content schema"
```

---

### Task 2: Add ogImage and ogType props to Layout

**Files:**
- Modify: `src/layouts/Layout.astro:1-15`

- [ ] **Step 1: Update Layout Props interface and meta tags**

In `src/layouts/Layout.astro`, replace the Props interface and head section:

```astro
---
import '../styles/global.css';
import { AFFILIATE_DISCLAIMER } from '../lib/affiliate.ts';

interface Props {
  title: string;
  description: string;
  canonical: string;
  schemas?: object[];
  noindex?: boolean;
  ogType?: string;
  ogImage?: string;
}

const { title, description, canonical, schemas = [], noindex = false, ogType = 'website', ogImage } = Astro.props;
const ownerName = import.meta.env.OWNER_NAME || 'the editorial team';
---
```

Then in the `<head>`, find the existing OG meta block and replace it with:

```html
<meta property="og:title" content={title} />
<meta property="og:description" content={description} />
<meta property="og:url" content={canonical} />
<meta property="og:type" content={ogType} />
<meta property="og:site_name" content="PriceGPU" />
{ogImage && <meta property="og:image" content={ogImage} />}
{ogImage && <meta property="og:image:width" content="1200" />}
{ogImage && <meta property="og:image:height" content="630" />}
{ogImage && <meta name="twitter:card" content="summary_large_image" />}
{ogImage && <meta name="twitter:image" content={ogImage} />}
```

- [ ] **Step 2: Verify build**

```bash
npm run build 2>&1 | tail -20
```

Expected: build completes without errors.

- [ ] **Step 3: Commit**

```bash
git add src/layouts/Layout.astro
git commit -m "feat: add ogImage and ogType props to Layout for news articles"
```

---

### Task 3: Fix [slug].astro — og:type article + image in JSON-LD

**Files:**
- Modify: `src/pages/blog/[slug].astro`

- [ ] **Step 1: Pass ogImage and ogType to Layout, add image to JSON-LD**

Replace the entire `[slug].astro` with:

```astro
---
import Layout from '../../layouts/Layout.astro';
import { buildTitle, buildDescription, buildCanonical, buildBreadcrumbs } from '../../lib/seo.ts';
import { getCollection, render } from 'astro:content';

export async function getStaticPaths() {
  const posts = await getCollection('blog');
  return posts.map((post) => ({ params: { slug: post.data.slug }, props: { post } }));
}

const { post } = Astro.props;
const { Content } = await render(post);

const title = buildTitle([post.data.title, 'PriceGPU']);
const description = buildDescription(post.data.description);
const canonical = post.data.canonical_url ?? buildCanonical(`/blog/${post.data.slug}`);
const ogImage = post.data.image
  ? `https://pricegpu.com${post.data.image}`
  : undefined;

const schemas = [
  buildBreadcrumbs([{ name: 'Home', url: '/' }, { name: 'Blog', url: '/blog' }, { name: post.data.title, url: `/blog/${post.data.slug}` }]),
  {
    '@context': 'https://schema.org',
    '@type': post.data.isNews ? 'NewsArticle' : 'Article',
    headline: post.data.title,
    description: post.data.description,
    datePublished: post.data.pubDate.toISOString(),
    dateModified: post.data.pubDate.toISOString(),
    author: { '@type': 'Person', name: post.data.author, url: 'https://pricegpu.com/about' },
    publisher: {
      '@type': 'Organization',
      name: 'PriceGPU',
      url: 'https://pricegpu.com',
      logo: { '@type': 'ImageObject', url: 'https://pricegpu.com/favicon.svg' },
    },
    url: canonical,
    isAccessibleForFree: true,
    inLanguage: 'en-US',
    ...(ogImage && {
      image: {
        '@type': 'ImageObject',
        url: ogImage,
        width: 1200,
        height: 630,
      },
    }),
  },
];
---

<Layout {title} {description} {canonical} {schemas} ogType={post.data.isNews ? 'article' : 'website'} {ogImage}>
  <nav class="breadcrumb">
    <a href="/">Home</a><span>/</span><a href="/blog">Blog</a><span>/</span><span>{post.data.title}</span>
  </nav>
  <article>
    <header style="margin-bottom: 2rem;">
      <h1 style="font-size: 1.75rem; font-weight: 700; margin-bottom: 0.5rem; line-height: 1.3;">{post.data.title}</h1>
      <div style="display: flex; align-items: center; gap: 1rem; flex-wrap: wrap; color: var(--text-muted); font-size: 0.85rem;">
        <span>By <strong style="color:var(--text-muted)">{post.data.author}</strong></span>
        <time datetime={post.data.pubDate.toISOString()}>{post.data.pubDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</time>
        {post.data.tags.length > 0 && <div style="display: flex; gap: 0.4rem; flex-wrap: wrap;">{post.data.tags.map((tag) => <span class="badge badge-gray">{tag}</span>)}</div>}
      </div>
    </header>
    <div class="prose"><Content /></div>
  </article>
  <div style="margin-top: 3rem; padding-top: 2rem; border-top: 1px solid var(--border);">
    <a href="/blog" style="font-size: 0.9rem; color: var(--text-muted);">← All posts</a>
  </div>
</Layout>
```

- [ ] **Step 2: Verify build**

```bash
npm run build 2>&1 | tail -20
```

Expected: build completes without errors.

- [ ] **Step 3: Commit**

```bash
git add src/pages/blog/[slug].astro
git commit -m "feat: set og:type=article and wire NewsArticle image JSON-LD for news posts"
```

---

### Task 4: Add OG image generation + price table to generate-news.ts

**Files:**
- Modify: `scripts/generate-news.ts`

**Background:** `@resvg/resvg-js` is a WASM-based SVG→PNG converter with zero native bindings, safe for any CI environment. We build an SVG string with article headline and top GPU prices, then render it to PNG and save it to `public/og/`.

- [ ] **Step 1: Install @resvg/resvg-js**

```bash
npm install --save-dev @resvg/resvg-js
```

Verify it's in `package.json` devDependencies.

- [ ] **Step 2: Add OG image generation function and price table builder**

In `scripts/generate-news.ts`, add these two functions AFTER the existing imports but BEFORE the `loadPrices` function:

```typescript
import { mkdirSync } from 'fs';

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
    if (next.length <= maxChars) {
      current = next;
    } else {
      if (current) lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

async function generateOgImage(headline: string, prices: PricePoint[]): Promise<Buffer> {
  const { Resvg } = await import('@resvg/resvg-js');

  const lines = wrapWords(headline, 38);
  const fontSize = lines.length > 2 ? 44 : 52;
  const headlineSvg = lines.slice(0, 3).map((line, i) =>
    `<text x="60" y="${200 + i * (fontSize + 12)}" font-size="${fontSize}" fill="#f1f5f9" font-family="DejaVu Sans,Liberation Sans,Arial,sans-serif" font-weight="bold">${escXml(line)}</text>`
  ).join('\n  ');

  const boxY = 430;
  const boxW = 255;
  const pricesSvg = prices.slice(0, 4).map((p, i) => {
    const x = 60 + i * (boxW + 20);
    const gpuLabel = p.gpu.replace(/-/g, ' ').replace(/\b(sxm|pcie|gb)\b/gi, s => s.toUpperCase());
    return `
  <rect x="${x}" y="${boxY}" width="${boxW}" height="100" rx="10" fill="#1e293b"/>
  <text x="${x + 20}" y="${boxY + 25}" font-size="12" fill="#94a3b8" font-family="DejaVu Sans,Liberation Sans,Arial,sans-serif">${escXml(gpuLabel)}</text>
  <text x="${x + 20}" y="${boxY + 60}" font-size="28" fill="#34d399" font-family="DejaVu Sans,Liberation Sans,Arial,sans-serif" font-weight="bold">$${p.price.toFixed(2)}/hr</text>
  <text x="${x + 20}" y="${boxY + 85}" font-size="13" fill="#64748b" font-family="DejaVu Sans,Liberation Sans,Arial,sans-serif">${escXml(p.provider)}</text>`;
  }).join('');

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630">
  <rect width="1200" height="630" fill="#0f172a"/>
  <rect width="1200" height="5" fill="#3b82f6"/>
  <text x="60" y="90" font-size="15" fill="#60a5fa" font-family="DejaVu Sans,Liberation Sans,Arial,sans-serif" font-weight="bold" letter-spacing="2">GPU MARKET UPDATE · PRICEGPU.COM</text>
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
```

- [ ] **Step 3: Wire OG image + price table into the article generation**

In the same file, find the section that declares `const mdx = \`...\`` and replace it with:

```typescript
// ── Generate OG image ─────────────────────────────────────────────────────────

const OG_DIR = 'public/og';
mkdirSync(OG_DIR, { recursive: true });
const ogPath = `${OG_DIR}/${slug}.png`;
const ogUrl = `/og/${slug}.png`;

const topPrices: PricePoint[] = KEY_GPUS
  .filter(g => marketSnapshot[g])
  .slice(0, 4)
  .map(g => ({ gpu: g, price: marketSnapshot[g].price, provider: marketSnapshot[g].provider }));

let ogImageWritten = false;
try {
  const pngBuffer = await generateOgImage(headline, topPrices);
  writeFileSync(ogPath, pngBuffer);
  ogImageWritten = true;
  console.log(`OG image written: ${ogPath}`);
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
```

- [ ] **Step 4: Verify the script runs locally (optional, skip if no GROQ_API_KEY)**

If you have `GROQ_API_KEY` set locally:

```bash
npx tsx scripts/generate-news.ts
```

Expected: article MDX written, PNG written to `public/og/gpu-market-YYYY-MM-DD.png`.

- [ ] **Step 5: Commit**

```bash
git add scripts/generate-news.ts package.json package-lock.json
git commit -m "feat: add per-article OG image generation and price table to daily news"
```

---

### Task 5: Update GitHub Actions workflow to commit OG images

**Files:**
- Modify: `.github/workflows/generate-news.yml`

- [ ] **Step 1: Add public/og/ to the git add command**

In `.github/workflows/generate-news.yml`, find the git add line:

```yaml
git add src/content/blog/
```

Replace with:

```yaml
git add src/content/blog/ public/og/
```

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/generate-news.yml
git commit -m "chore: commit OG images alongside daily news articles in CI"
```

---

### Task 6: Add public/og/ to .gitignore exclusion check

**Files:**
- Check: `.gitignore`

- [ ] **Step 1: Verify public/og/ is NOT in .gitignore**

```bash
cat .gitignore | grep -E "og|public"
```

If `public/og` or `public/*` appears, remove that line. The generated PNG files must be committed to the repo so the static deploy serves them.

- [ ] **Step 2: Commit if changed**

Only commit if `.gitignore` was modified.

---

## Self-Review

**Spec coverage:**
- ✅ `og:image` meta — Task 2 + Task 4
- ✅ `og:type: article` for news — Task 3
- ✅ `image` in NewsArticle JSON-LD — Task 3
- ✅ Price comparison table in article body — Task 4
- ✅ Per-article PNG generated at create time — Task 4
- ✅ CI commits the PNG — Task 5
- ✅ Content schema updated — Task 1

**Type consistency check:**
- `PricePoint` defined in Task 4, used in Task 4 only ✅
- `ogImage` passed from `[slug].astro` to `Layout.astro` — both use `string | undefined` ✅
- `post.data.image` typed as `string | undefined` via schema in Task 1 ✅

**Placeholder scan:** No TBD/TODO in code steps ✅
