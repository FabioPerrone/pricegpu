/**
 * Single source of truth for which comparison pages exist.
 *
 * Comparison routes are generated for one ordering of each pair, but link
 * builders across the site used to emit whatever order they happened to hold,
 * producing thousands of 404s. Every internal link to a comparison page must
 * go through this module.
 */
import { getProviders, getGPUs } from './pricing.ts';

/** GPU pairs with a real /gpu-compare page. Both orderings are generated. */
export const GPU_COMPARE_PAIRS: ReadonlyArray<readonly [string, string]> = [
  ['h100-sxm', 'a100-80gb-sxm'],
  ['h100-sxm', 'h100-pcie'],
  ['h100-sxm', 'h200-sxm'],
  ['a100-80gb-sxm', 'a100-40gb-sxm'],
  ['a100-80gb-sxm', 'l40s'],
  ['l40s', 'a6000'],
  ['l40s', 'rtx-4090'],
  ['rtx-4090', 'rtx-4080'],
  ['rtx-4090', 'a10'],
  ['rtx-4090', 'rtx-3090'],
  ['a10', 'a10g'],
  ['a10', 'l4'],
  ['l4', 't4'],
  ['v100-16gb', 'a100-40gb-sxm'],
  ['mi300x', 'h100-sxm'],
  ['rtx-5090', 'rtx-4090'],
  ['b100', 'h100-sxm'],
  ['b200', 'h100-sxm'],
  ['a40', 'a6000'],
  ['a40', 'l40'],
];

/** Provider comparison pages exist only for index order i < j. */
export function comparePath(slugA: string, slugB: string): string {
  const order = getProviders().map((p) => p.slug);
  const [a, b] = order.indexOf(slugA) <= order.indexOf(slugB) ? [slugA, slugB] : [slugB, slugA];
  return `/compare/${a}-vs-${b}`;
}

/** GPU slugs that have a real comparison page paired with `slug`. */
export function gpuComparePartners(slug: string): string[] {
  return GPU_COMPARE_PAIRS.flatMap(([a, b]) => (a === slug ? [b] : b === slug ? [a] : []));
}

export function gpuComparePath(slugA: string, slugB: string): string {
  return `/gpu-compare/${slugA}-vs-${slugB}`;
}

/** The comparison links worth showing on a GPU page — real pages only. */
export function relatedGpuComparisons(slug: string, limit = 6) {
  const gpus = getGPUs();
  return gpuComparePartners(slug)
    .map((partner) => gpus.find((g) => g.slug === partner))
    .filter((g): g is NonNullable<typeof g> => Boolean(g))
    .slice(0, limit);
}
