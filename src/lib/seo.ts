import type { GPU, PriceItem } from './pricing.ts';
import { getLastScrapeDate } from './pricing.ts';

export function buildTitle(parts: string[], suffix?: string): string {
  const base = suffix ? [...parts, suffix] : parts;
  const joined = base.join(' | ');
  if (joined.length <= 60) return joined;
  let truncated = joined.slice(0, 57);
  const lastPipe = truncated.lastIndexOf(' | ');
  if (lastPipe > 20) truncated = truncated.slice(0, lastPipe);
  return truncated + '...';
}

export function buildDescription(text: string): string {
  if (text.length <= 155) return text;
  const truncated = text.slice(0, 152);
  const lastSpace = truncated.lastIndexOf(' ');
  return (lastSpace > 100 ? truncated.slice(0, lastSpace) : truncated) + '...';
}

export function buildCanonical(path: string): string {
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return `https://pricegpu.com${normalized}`;
}

export function buildBreadcrumbs(items: Array<{ name: string; url: string }>): object {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: item.url.startsWith('http') ? item.url : buildCanonical(item.url),
    })),
  };
}

const NVIDIA_ARCHITECTURES = new Set([
  'Ampere', 'Hopper', 'Ada Lovelace', 'Turing', 'Volta', 'Pascal', 'Maxwell',
  'Kepler', 'Fermi', 'Blackwell',
]);

function gpuBrand(gpu: GPU): string {
  if (NVIDIA_ARCHITECTURES.has(gpu.architecture)) return 'NVIDIA';
  const nameLower = gpu.name.toLowerCase();
  if (nameLower.startsWith('rx ') || nameLower.startsWith('radeon') || gpu.architecture.toLowerCase().includes('rdna') || gpu.architecture.toLowerCase().includes('cdna')) return 'AMD';
  return 'NVIDIA';
}

export function buildProductSchema(gpu: GPU, offers: PriceItem[]): object {
  const availableOffers = offers.filter((o) => o.availability === 'available');
  const prices = availableOffers.map((o) => o.price_usd_per_hour);
  const lowPrice = prices.length > 0 ? Math.min(...prices) : undefined;
  const highPrice = prices.length > 0 ? Math.max(...prices) : undefined;

  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: gpu.name,
    description: `${gpu.name} GPU with ${gpu.vram_gb}GB VRAM, ${gpu.fp16_tflops} TFLOPS FP16 — cloud rental pricing across providers.`,
    brand: {
      '@type': 'Brand',
      name: gpuBrand(gpu),
    },
    ...(offers.length > 0 && {
      offers: {
        '@type': 'AggregateOffer',
        priceCurrency: 'USD',
        offerCount: availableOffers.length,
        ...(lowPrice !== undefined && { lowPrice: lowPrice.toFixed(4) }),
        ...(highPrice !== undefined && { highPrice: highPrice.toFixed(4) }),
        availability:
          availableOffers.length > 0
            ? 'https://schema.org/InStock'
            : 'https://schema.org/OutOfStock',
      },
    }),
  };
}

export function buildFAQSchema(faqs: Array<{ q: string; a: string }>): object {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map((faq) => ({
      '@type': 'Question',
      name: faq.q,
      acceptedAnswer: {
        '@type': 'Answer',
        text: faq.a,
      },
    })),
  };
}

export function buildWebSiteSchema(): object {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: 'PriceGPU',
    url: 'https://pricegpu.com',
    description: 'Compare GPU cloud rental prices across providers in real time.',
    potentialAction: {
      '@type': 'SearchAction',
      target: {
        '@type': 'EntryPoint',
        urlTemplate: 'https://pricegpu.com/search?q={search_term_string}',
      },
      'query-input': 'required name=search_term_string',
    },
  };
}

export function slugToTitle(slug: string): string {
  return slug
    .split('-')
    .map((part) => {
      if (/^\d/.test(part)) return part.toUpperCase();
      return part.charAt(0).toUpperCase() + part.slice(1);
    })
    .join(' ');
}

export function getLastmod(providerSlugs: string[]): string {
  const dates = providerSlugs
    .map((slug) => getLastScrapeDate(slug))
    .filter(Boolean)
    .map((d) => new Date(d).getTime())
    .filter((t) => !Number.isNaN(t));

  if (dates.length === 0) return new Date().toISOString().slice(0, 10);
  return new Date(Math.max(...dates)).toISOString().slice(0, 10);
}