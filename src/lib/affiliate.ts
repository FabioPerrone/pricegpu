export function buildAffiliateUrl(providerSlug: string): string {
  return `/go/${providerSlug}`;
}

export function getProviderCTA(
  providerSlug: string,
  providerName: string,
): { url: string; text: string } {
  return {
    url: buildAffiliateUrl(providerSlug),
    text: `Try ${providerName} →`,
  };
}

export const AFFILIATE_DISCLAIMER =
  'Some links are affiliate links — we may earn a commission at no cost to you.';