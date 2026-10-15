import { z } from "zod";
import fs from "fs";
import path from "path";

export interface PriceItem {
  gpu_slug: string;
  configuration: string;
  price_usd_per_hour: number;
  billing: string;
  availability: string;
  region: string;
  deal_url: string;
}

export interface PriceFile {
  scraped_at: string;
  scraper_version: string;
  items: PriceItem[];
}

export const PriceItemSchema = z.object({
  gpu_slug: z.string().min(1),
  configuration: z.string().min(1),
  price_usd_per_hour: z.number().positive(),
  billing: z.enum(["per-second", "per-minute", "per-hour"]),
  availability: z.enum(["on-demand", "spot", "reserved"]),
  region: z.string().min(1),
  deal_url: z.string().url(),
});

export const PriceFileSchema = z.object({
  scraped_at: z.string(),
  scraper_version: z.string(),
  items: z.array(PriceItemSchema),
});

export const SCRAPER_VERSION = "1.0.0";
export const THROTTLE_MS = 2000;
export const USER_AGENT = "pricegpu.com/1.0 (+https://pricegpu.com/about)";

export const GPU_SLUG_MAP: Record<string, string> = {
  "H100 SXM5 80GB": "h100-sxm",
  "H100 SXM4 80GB": "h100-sxm",
  "H100 SXM": "h100-sxm",
  "H100 SXM5": "h100-sxm",
  "H100 SXM4": "h100-sxm",
  "H100 80GB SXM": "h100-sxm",
  "H100 80GB SXM5": "h100-sxm",
  "H100 80GB SXM4": "h100-sxm",
  "NVIDIA H100 SXM": "h100-sxm",
  "NVIDIA H100 80GB SXM": "h100-sxm",
  "NVIDIA H100 SXM5 80GB": "h100-sxm",
  "H100-SXM": "h100-sxm",
  "h100-sxm": "h100-sxm",
  "h100-sxm": "h100-sxm",
  "H100 PCIe 80GB": "h100-pcie",
  "H100 PCIe": "h100-pcie",
  "H100 80GB PCIe": "h100-pcie",
  "NVIDIA H100 PCIe": "h100-pcie",
  "NVIDIA H100 80GB PCIe": "h100-pcie",
  "H100-PCIe": "h100-pcie",
  "h100-pcie": "h100-pcie",
  "h100-80gb-pcie": "h100-pcie",
  "H200 SXM 141GB": "h200-sxm",
  "H200 SXM": "h200-sxm",
  "H200 141GB": "h200-sxm",
  "NVIDIA H200": "h200-sxm",
  "NVIDIA H200 SXM": "h200-sxm",
  "NVIDIA H200 141GB SXM": "h200-sxm",
  "H200": "h200-sxm",
  "h200-sxm": "h200-sxm",
  "A100 SXM4 80GB": "a100-80gb-sxm",
  "A100 SXM 80GB": "a100-80gb-sxm",
  "A100 80GB SXM": "a100-80gb-sxm",
  "A100 80GB SXM4": "a100-80gb-sxm",
  "NVIDIA A100 80GB SXM": "a100-80gb-sxm",
  "NVIDIA A100 SXM4 80GB": "a100-80gb-sxm",
  "A100-SXM4-80GB": "a100-80gb-sxm",
  "a100-80gb-sxm": "a100-80gb-sxm",
  "A100 SXM4 40GB": "a100-40gb-sxm",
  "A100 SXM 40GB": "a100-40gb-sxm",
  "A100 40GB SXM": "a100-40gb-sxm",
  "A100 40GB SXM4": "a100-40gb-sxm",
  "NVIDIA A100 40GB SXM": "a100-40gb-sxm",
  "a100-40gb-sxm": "a100-40gb-sxm",
  "A100 PCIe 40GB": "a100-40gb-pcie",
  "A100 40GB PCIe": "a100-40gb-pcie",
  "A100 40GB": "a100-40gb-pcie",
  "NVIDIA A100 40GB PCIe": "a100-40gb-pcie",
  "A100-PCIE-40GB": "a100-40gb-pcie",
  "a100-40gb-pcie": "a100-40gb-pcie",
  "A100 PCIe 80GB": "a100-80gb-pcie",
  "A100 80GB PCIe": "a100-80gb-pcie",
  "NVIDIA A100 80GB PCIe": "a100-80gb-pcie",
  "A100-PCIE-80GB": "a100-80gb-pcie",
  "a100-80gb-pcie": "a100-80gb-pcie",
  "L40S 48GB": "l40s",
  "L40S": "l40s",
  "NVIDIA L40S": "l40s",
  "NVIDIA L40S 48GB": "l40s",
  "l40s": "l40s",
  "L40 48GB": "l40",
  "L40": "l40",
  "NVIDIA L40": "l40",
  "NVIDIA L40 48GB": "l40",
  "l40": "l40",
  "L4 24GB": "l4",
  "L4": "l4",
  "NVIDIA L4": "l4",
  "NVIDIA L4 24GB": "l4",
  "l4": "l4",
  "RTX 6000 Ada 48GB": "rtx-6000-ada",
  "RTX 6000 Ada": "rtx-6000-ada",
  "RTX 6000 Ada Generation": "rtx-6000-ada",
  "NVIDIA RTX 6000 Ada": "rtx-6000-ada",
  "rtx-6000-ada": "rtx-6000-ada",
  "RTX A6000 48GB": "a6000",
  "RTX A6000": "a6000",
  "A6000 48GB": "a6000",
  "A6000": "a6000",
  "NVIDIA RTX A6000": "a6000",
  "NVIDIA A6000": "a6000",
  "a6000": "a6000",
  "A40 48GB": "a40",
  "A40": "a40",
  "NVIDIA A40": "a40",
  "NVIDIA A40 48GB": "a40",
  "a40": "a40",
  "RTX 4090 24GB": "rtx-4090",
  "RTX 4090": "rtx-4090",
  "GeForce RTX 4090": "rtx-4090",
  "NVIDIA RTX 4090": "rtx-4090",
  "NVIDIA GeForce RTX 4090": "rtx-4090",
  "rtx-4090": "rtx-4090",
  "4090": "rtx-4090",
  "RTX 4080 16GB": "rtx-4080",
  "RTX 4080": "rtx-4080",
  "GeForce RTX 4080": "rtx-4080",
  "NVIDIA RTX 4080": "rtx-4080",
  "rtx-4080": "rtx-4080",
  "RTX 3090 24GB": "rtx-3090",
  "RTX 3090": "rtx-3090",
  "GeForce RTX 3090": "rtx-3090",
  "NVIDIA RTX 3090": "rtx-3090",
  "rtx-3090": "rtx-3090",
  "3090": "rtx-3090",
  "RTX 5090 32GB": "rtx-5090",
  "RTX 5090": "rtx-5090",
  "GeForce RTX 5090": "rtx-5090",
  "NVIDIA RTX 5090": "rtx-5090",
  "rtx-5090": "rtx-5090",
  "A10 24GB": "a10",
  "A10": "a10",
  "NVIDIA A10": "a10",
  "a10": "a10",
  "A10G 24GB": "a10g",
  "A10G": "a10g",
  "NVIDIA A10G": "a10g",
  "a10g": "a10g",
  "T4 16GB": "t4",
  "T4": "t4",
  "Tesla T4": "t4",
  "NVIDIA T4": "t4",
  "NVIDIA Tesla T4": "t4",
  "t4": "t4",
  "V100 16GB": "v100-16gb",
  "V100 SXM2 16GB": "v100-16gb",
  "V100 SXM2": "v100-16gb",
  "V100": "v100-16gb",
  "Tesla V100": "v100-16gb",
  "NVIDIA V100": "v100-16gb",
  "v100-16gb": "v100-16gb",
  "v100": "v100-16gb",
  "MI300X 192GB": "mi300x",
  "MI300X": "mi300x",
  "AMD MI300X": "mi300x",
  "AMD Instinct MI300X": "mi300x",
  "Instinct MI300X": "mi300x",
  "mi300x": "mi300x",
  "B100 192GB": "b100",
  "B100": "b100",
  "NVIDIA B100": "b100",
  "b100": "b100",
  "B200 192GB": "b200",
  "B200": "b200",
  "NVIDIA B200": "b200",
  "b200": "b200",
  "Gaudi 3": "gaudi-3",
  "Intel Gaudi 3": "gaudi-3",
  "Gaudi3": "gaudi-3",
  "gaudi-3": "gaudi-3",
};

export function normalizeGpuSlug(name: string): string | null {
  const trimmed = name.trim();
  if (GPU_SLUG_MAP[trimmed]) return GPU_SLUG_MAP[trimmed];
  const lower = trimmed.toLowerCase();
  for (const [key, slug] of Object.entries(GPU_SLUG_MAP)) {
    if (key.toLowerCase() === lower) return slug;
  }
  const stripped = trimmed.replace(/^(NVIDIA|AMD|Intel)\s+/i, "").trim();
  if (GPU_SLUG_MAP[stripped]) return GPU_SLUG_MAP[stripped];
  for (const [key, slug] of Object.entries(GPU_SLUG_MAP)) {
    if (key.toLowerCase() === stripped.toLowerCase()) return slug;
  }
  for (const [key, slug] of Object.entries(GPU_SLUG_MAP)) {
    if (key.length > 3 && lower.includes(key.toLowerCase())) return slug;
  }
  for (const [key, slug] of Object.entries(GPU_SLUG_MAP)) {
    if (key.length > 3 && key.toLowerCase().includes(lower)) return slug;
  }
  return null;
}

/**
 * Writes a provider's prices, refusing to record an empty scrape.
 *
 * A selector that stops matching raises no error: the scraper walks zero rows,
 * exits 0, and this function used to write `items: []` with a fresh timestamp
 * and log "Saved 0 items". Eight of fifteen providers were in that state — a
 * failure wearing a success, the same vice as the continue-on-error that hid
 * the original crash.
 *
 * An empty result is therefore a failure: the previous file is left untouched,
 * because yesterday's prices beat no prices, and the freshness check still
 * reports them as stale so the breakage stays visible rather than becoming a
 * silent blanking of the site's entire reason to exist.
 */
export function saveProviderPrices(providerSlug: string, items: PriceItem[]): void {
  const outDir = path.resolve("data/prices");
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  if (items.length === 0) {
    const existing = path.join(outDir, `${providerSlug}.json`);
    console.error(
      `[${providerSlug}] Parsed 0 prices — the page loaded but nothing matched. ` +
        (fs.existsSync(existing)
          ? `Keeping the previous ${existing}; it will be reported as stale.`
          : `No previous data to keep.`)
    );
    process.exit(1);
  }

  const priceFile: PriceFile = {
    scraped_at: new Date().toISOString(),
    scraper_version: SCRAPER_VERSION,
    items,
  };
  const parsed = PriceFileSchema.safeParse(priceFile);
  if (!parsed.success) {
    console.error(`[${providerSlug}] Schema validation failed:`, parsed.error.issues);
    process.exit(1);
  }
  const outPath = path.join(outDir, `${providerSlug}.json`);
  fs.writeFileSync(outPath, JSON.stringify(parsed.data, null, 2));
  console.log(`[${providerSlug}] Saved ${items.length} items to ${outPath}`);
}

export async function withRetry<T>(fn: () => Promise<T>, retries = 3): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt < retries) {
        console.warn(`Attempt ${attempt} failed, retrying in 2s...`, err);
        await new Promise((r) => setTimeout(r, 2000));
      }
    }
  }
  throw lastError;
}
/**
 * Launches Chromium, honouring PLAYWRIGHT_EXECUTABLE_PATH.
 *
 * CI installs its own browser, but sandboxes and containers often ship one at
 * a fixed path that Playwright's own resolution misses — which makes a scraper
 * impossible to run locally, and an unrunnable scraper is one nobody notices
 * has broken.
 */
export async function launchBrowser() {
  const { chromium } = await import("playwright");
  const executablePath = process.env.PLAYWRIGHT_EXECUTABLE_PATH;
  return chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
}

/**
 * Captures why a parse found nothing.
 *
 * Eight scrapers return zero rows against pages that load fine, which means
 * their selectors no longer match markup that has moved on. That cannot be
 * diagnosed from a row count, and the provider sites are not reachable from
 * every environment — so the run that fails is the run that has to collect the
 * evidence. Written to a directory CI uploads as an artifact.
 */
interface DiagnosablePage {
  title(): Promise<string>;
  url(): string;
  content(): Promise<string>;
  screenshot(o: { path: string; fullPage?: boolean }): Promise<unknown>;
  evaluate?<T>(fn: () => T): Promise<T>;
}

/**
 * Finds the smallest elements on the page whose own text is a price, and
 * reports their tag, classes and surrounding text.
 *
 * The saved HTML is the real evidence, but it lands in a CI artifact, and an
 * artifact is only useful to someone who can download it. Printing the few
 * lines that actually determine the selector puts the fix in the log, where
 * it can be read from anywhere. "No table" says the old selector is dead;
 * this says what to write instead.
 */
async function samplePriceElements(page: DiagnosablePage, providerSlug: string): Promise<void> {
  if (!page.evaluate) return;
  const samples = await page.evaluate(() => {
    const PRICE = /\$\s?\d+(\.\d+)?/;
    const out: { tag: string; cls: string; text: string; parent: string }[] = [];
    for (const el of Array.from(document.querySelectorAll<HTMLElement>("body *"))) {
      if (el.children.length) continue;           // leaf nodes only
      const text = (el.textContent ?? "").trim();
      if (!text || text.length > 40 || !PRICE.test(text)) continue;
      const parent = el.parentElement;
      out.push({
        tag: el.tagName.toLowerCase(),
        cls: (el.className || "").toString().slice(0, 80),
        text,
        parent: parent ? `${parent.tagName.toLowerCase()}.${(parent.className || "").toString().slice(0, 60)}` : "",
      });
      if (out.length >= 8) break;
    }
    return out;
  });

  if (!samples.length) {
    console.error(`[${providerSlug}] no price-shaped text anywhere on the page — it may render prices only after interaction, or behind a paywall or bot check.`);
    return;
  }
  console.error(`[${providerSlug}] price-shaped elements found (write the new selector from these):`);
  for (const s of samples) {
    console.error(`[${providerSlug}]   <${s.tag} class="${s.cls}"> "${s.text}"  inside ${s.parent}`);
  }
}

export async function dumpPageDiagnostics(
  page: DiagnosablePage,
  providerSlug: string,
): Promise<void> {
  const dir = process.env.SCRAPE_DIAGNOSTICS_DIR ?? "scrape-diagnostics";
  try {
    fs.mkdirSync(dir, { recursive: true });
    const html = await page.content();
    fs.writeFileSync(path.join(dir, `${providerSlug}.html`), html);
    await page.screenshot({ path: path.join(dir, `${providerSlug}.png`), fullPage: true });

    const tables = (html.match(/<table/g) ?? []).length;
    const rows = (html.match(/<tr/g) ?? []).length;
    const title = await page.title();
    const url = page.url();

    // Name the kind of breakage. These four need completely different fixes,
    // and a row count alone cannot tell them apart — which is how ten
    // providers sat broken for months looking identical from the outside.
    const kind = url.startsWith("chrome-error")
      ? "UNREACHABLE — the browser could not load the page at all"
      : /404|not found|page not found/i.test(title)
        ? "DEAD URL — the page is gone; the provider moved, renamed or was acquired"
        : tables === 0
          ? "LAYOUT CHANGED — the page loaded but contains no <table> to read"
          : "PARSER — tables are present but no row produced a usable price";

    console.error(
      `[${providerSlug}] ${kind}\n` +
        `[${providerSlug}] diagnostics: "${title}" at ${url} — ` +
        `${html.length} bytes, ${tables} table(s), ${rows} row(s). Saved to ${dir}/${providerSlug}.{html,png}`
    );

    // Only worth sampling when the page actually loaded; a dead URL or an
    // unreachable host needs a new address, not a new selector.
    if (!url.startsWith("chrome-error") && !/404|not found|page not found/i.test(title)) {
      await samplePriceElements(page, providerSlug);
    }
  } catch (err) {
    console.error(`[${providerSlug}] could not capture diagnostics:`, err);
  }
}

/**
 * A price block lifted off a page without knowing its markup: the text of the
 * smallest element that holds both a GPU name and an hourly price.
 */
export interface PriceBlock {
  text: string;
  prices: number[];
}

/**
 * Extracts price blocks without depending on the page's structure.
 *
 * Every scraper here targets a layout, and layouts move: nine of fifteen
 * providers broke at once, four of them because their pricing stopped being a
 * <table>. The replacements are no sturdier — Vast.ai's price sits under
 * `text-[24px] text-white`, Hyperstack's under `page-price_card_row_item_col5`.
 * Writing those selectors down just schedules the next outage.
 *
 * So this looks for meaning instead of markup: the smallest elements whose own
 * text contains both something that reads as a price and something that reads
 * as a GPU. Table row, flex card or grid cell, it does not care. Callers use
 * it as a fallback when their specific selector yields nothing, which keeps a
 * working scraper exact and a broken one alive.
 */
export async function extractPriceBlocks(
  page: { evaluate?<T>(fn: () => T): Promise<T> },
  gpuHints: string[],
): Promise<PriceBlock[]> {
  if (!page.evaluate) return [];
  return page.evaluate(new Function("hints", `
    const PRICE = /\\$\\s?(\\d+(?:[.,]\\d+)?)/g;
    const hintRe = new RegExp("(" + hints.join("|") + ")", "i");
    const holds = (el) => {
      const t = (el.textContent || "").trim();
      return t.length > 0 && t.length < 400 && /\\$\\s?\\d/.test(t) && hintRe.test(t);
    };
    const out = [];
    const seen = new Set();
    for (const el of Array.from(document.querySelectorAll("body *"))) {
      if (!holds(el)) continue;
      // Keep only the smallest such element: if a descendant also qualifies,
      // this one is a container and its text would merge several offers.
      if (Array.from(el.children).some(holds)) continue;
      const text = (el.textContent || "").replace(/\\s+/g, " ").trim();
      if (seen.has(text)) continue;
      seen.add(text);
      const prices = [];
      let m;
      PRICE.lastIndex = 0;
      while ((m = PRICE.exec(text)) !== null) prices.push(parseFloat(m[1].replace(",", ".")));
      if (prices.length) out.push({ text, prices });
      if (out.length >= 200) break;
    }
    return out;
  `) as unknown as () => PriceBlock[]);
}

/**
 * Turns a price block's text into a priced GPU row.
 *
 * Kept separate from the browser so it can be tested directly: the matching
 * rules are where this is most likely to be wrong, and a provider page is not
 * reachable from every environment.
 */
export function priceBlockToItem(
  block: PriceBlock,
  opts: { billing: PriceItem["billing"]; availability: PriceItem["availability"]; region: string; dealUrl: string },
): PriceItem | null {
  const slug = normalizeGpuSlug(block.text);
  if (!slug) return null;

  // Hourly rates only. A page mixes them with monthly plans and credits, and
  // the smallest plausible rate in the block is the per-hour one far more
  // often than not; anything above $200 is a node, a month or a promotion.
  const hourly = block.prices.filter((p) => p > 0 && p < 200);
  if (!hourly.length) return null;
  const price = Math.min(...hourly);

  // Multi-GPU nodes quote the whole box. "8x H100" at $42 is $5.25 a GPU, and
  // listing it at $42 against a single-GPU rate would be a false comparison.
  const count = Number(block.text.match(/\b(\d+)\s*[x×]\s*(?=[A-Za-z])/i)?.[1] ?? 1);
  const perGpu = count > 1 && count <= 16 ? price / count : price;

  return {
    gpu_slug: slug,
    configuration: count > 1 ? `${count}x ${slug}` : `1x ${slug}`,
    price_usd_per_hour: Number(perGpu.toFixed(4)),
    billing: opts.billing,
    availability: opts.availability,
    region: opts.region,
    deal_url: opts.dealUrl,
  };
}

/**
 * Distinctive fragments of GPU names, used to pre-filter page text cheaply
 * before normalizeGpuSlug does the real matching. Two characters or fewer
 * match everything, so they are left out.
 */
export const GPU_NAME_HINTS: string[] = Array.from(
  new Set(
    Object.keys(GPU_SLUG_MAP)
      .filter((k) => k.length >= 3)
      .map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
  )
);
