/**
 * Attribution carried through the /go redirect.
 *
 * Without it a click is just "someone left for RunPod". With it, every click
 * records the page that produced it, the GPU in context, the row position and
 * the price on screen — which is what turns raw clicks into a per-page
 * click-through rate and a per-provider earnings-per-click.
 */
export interface ClickContext {
  /** Path of the page holding the link, e.g. Astro.url.pathname. */
  from?: string;
  /** GPU slug the link is about, when the page is about one GPU. */
  gpu?: string;
  /** 1-based row position in a price table. Reveals how far people scan. */
  position?: number;
  /** Price shown at click time, so later conversions can be priced. */
  price?: number;
}

export function buildAffiliateUrl(providerSlug: string, context: ClickContext = {}): string {
  const params = new URLSearchParams();
  if (context.from) params.set('from', context.from);
  if (context.gpu) params.set('gpu', context.gpu);
  if (context.position !== undefined) params.set('pos', String(context.position));
  if (context.price !== undefined) params.set('price', context.price.toFixed(4));
  const query = params.toString();
  return `/go/${providerSlug}${query ? `?${query}` : ''}`;
}

export function getProviderCTA(
  providerSlug: string,
  providerName: string,
  context: ClickContext = {},
): { url: string; text: string } {
  return {
    url: buildAffiliateUrl(providerSlug, context),
    text: `Try ${providerName} →`,
  };
}

export const AFFILIATE_DISCLAIMER =
  'Some links are affiliate links — we may earn a commission at no cost to you.';
