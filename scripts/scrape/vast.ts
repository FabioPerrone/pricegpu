
import {
  fetchPage,
  keepPlausiblePrices,
  saveProviderPrices,
  THROTTLE_MS,
  withRetry,
} from "./_shared.js";
import type { PriceItem } from "./_shared.js";

const PROVIDER_SLUG = "vast-ai";
// Vast's public offer search. vast.ai/pricing renders its numbers client-side.
const OFFERS_URL = "https://console.vast.ai/api/v0/bundles/";
const DEAL_URL = "https://cloud.vast.ai/";

interface Offer {
  gpu_name: string;
  gpu_ram: number; // MiB
  num_gpus: number;
  dph_total: number;
}

/** Vast's GPU names, with the VRAM (GiB) needed to tell variants of one name apart. */
const GPU_VARIANTS: Array<{ name: string; slug: string; vramGb?: number }> = [
  { name: "H100 SXM", slug: "h100-sxm" },
  { name: "H100 PCIE", slug: "h100-pcie" },
  { name: "H200", slug: "h200-sxm" },
  { name: "A100 SXM4", slug: "a100-80gb-sxm", vramGb: 80 },
  { name: "A100 SXM4", slug: "a100-40gb-sxm", vramGb: 40 },
  { name: "A100 PCIE", slug: "a100-80gb-pcie", vramGb: 80 },
  { name: "A100 PCIE", slug: "a100-40gb-pcie", vramGb: 40 },
  { name: "B200", slug: "b200" },
  { name: "L40S", slug: "l40s" },
  { name: "L40", slug: "l40" },
  { name: "L4", slug: "l4" },
  { name: "A40", slug: "a40" },
  { name: "A10", slug: "a10" },
  { name: "RTX 6000Ada", slug: "rtx-6000-ada" },
  { name: "RTX A6000", slug: "a6000" },
  { name: "RTX 5090", slug: "rtx-5090", vramGb: 32 },
  { name: "RTX 4090", slug: "rtx-4090", vramGb: 24 },
  { name: "RTX 4080", slug: "rtx-4080", vramGb: 16 },
  { name: "RTX 3090", slug: "rtx-3090", vramGb: 24 },
  { name: "Tesla T4", slug: "t4" },
  { name: "Tesla V100", slug: "v100-16gb", vramGb: 16 },
];

async function searchOffers(gpuName: string): Promise<Offer[]> {
  const q = JSON.stringify({
    gpu_name: { eq: gpuName },
    rentable: { eq: true },
    rented: { eq: false },
    verified: { eq: true },
    reliability2: { gte: 0.9 },
    order: [["dph_total", "asc"]],
    limit: 64,
    type: "on-demand",
  });
  const body = await fetchPage(`${OFFERS_URL}?q=${encodeURIComponent(q)}`, "application/json");
  return (JSON.parse(body) as { offers?: Offer[] }).offers ?? [];
}

export async function scrape(): Promise<PriceItem[]> {
  const items: PriceItem[] = [];
  const offersByName = new Map<string, Offer[]>();

  for (const { name, slug, vramGb } of GPU_VARIANTS) {
    if (!offersByName.has(name)) {
      offersByName.set(name, await withRetry(() => searchOffers(name)));
      await new Promise((r) => setTimeout(r, THROTTLE_MS));
    }
    const matching = offersByName.get(name)!.filter(
      (o) => o.num_gpus >= 1 && (vramGb === undefined || Math.abs(o.gpu_ram / 1024 - vramGb) <= vramGb * 0.1)
    );
    if (!matching.length) continue;

    // A marketplace has no list price; the cheapest verified offer is what a
    // renter can actually get. dph_total includes the default storage charge.
    const cheapest = matching.reduce((a, b) => (b.dph_total / b.num_gpus < a.dph_total / a.num_gpus ? b : a));
    items.push({
      gpu_slug: slug,
      configuration: `${cheapest.num_gpus}x ${name}`,
      price_usd_per_hour: Number((cheapest.dph_total / cheapest.num_gpus).toFixed(4)),
      billing: "per-hour",
      availability: "on-demand",
      region: "global-p2p",
      deal_url: DEAL_URL,
    });
  }

  return keepPlausiblePrices(PROVIDER_SLUG, items);
}

const items = await scrape();
saveProviderPrices(PROVIDER_SLUG, items);
