/**
 * Affiliate redirect with first-party click logging.
 *
 * Replaces a static interstitial that shipped a full HTML page and bounced the
 * visitor with a meta-refresh. That cost roughly a page load on the way to the
 * merchant and, being static, could not record that the click happened at all —
 * leaving outbound clicks, the one metric that maps to revenue, unmeasured.
 *
 * This answers with a 302 and writes one row to D1. Logging never blocks the
 * redirect: if D1 is unbound or the insert fails, the visitor still leaves.
 *
 * Attribution comes from the query string, set by buildAffiliateUrl():
 *   /go/runpod?from=/gpu/h100-sxm&gpu=h100-sxm&pos=1&price=2.29
 */
import { PROVIDERS } from '../_generated/providers';

interface Env {
  ANALYTICS?: D1Database;
  [refCode: string]: unknown;
}

/** Cloudflare request properties available on the edge. */
interface CfRequest extends Request {
  cf?: { country?: string };
}

function destinationFor(slug: string, env: Env): string | null {
  const provider = PROVIDERS[slug];
  if (!provider) return null;
  const ref = provider.env ? String(env[provider.env] ?? '') : '';
  return ref && provider.template ? provider.template.replace('{REF}', ref) : provider.url;
}

function logClick(context: EventContext<Env, string, unknown>, slug: string): void {
  const { request, env } = context;
  if (!env.ANALYTICS) return;

  const url = new URL(request.url);
  const params = url.searchParams;
  const now = new Date();

  // Referrer is reduced to its host, and only when it is not our own site.
  let referrerHost: string | null = null;
  try {
    const ref = request.headers.get('Referer');
    if (ref) {
      const host = new URL(ref).host;
      referrerHost = host === url.host ? null : host;
    }
  } catch {
    /* malformed Referer — not worth failing over */
  }

  const num = (key: string): number | null => {
    const raw = params.get(key);
    if (raw === null) return null;
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : null;
  };

  const insert = env.ANALYTICS.prepare(
    `INSERT INTO event (ts, day, type, path, provider, gpu, position, price_usd, referrer_host, country, device)
     VALUES (?, ?, 'click', ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    Math.floor(now.getTime() / 1000),
    now.toISOString().slice(0, 10),
    params.get('from') ?? '/',
    slug,
    params.get('gpu'),
    num('pos'),
    num('price'),
    referrerHost,
    (request as CfRequest).cf?.country ?? null,
    /Mobi|Android|iPhone/i.test(request.headers.get('User-Agent') ?? '') ? 'mobile' : 'desktop'
  );

  // Fire-and-forget: the visitor is already on their way to the merchant.
  context.waitUntil(insert.run().catch(() => {}));
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const slug = String(context.params.partner ?? '');
  const destination = destinationFor(slug, context.env);

  if (!destination) {
    return Response.redirect(new URL('/404', context.request.url).toString(), 302);
  }

  logClick(context, slug);

  return new Response(null, {
    status: 302,
    headers: {
      Location: destination,
      // Ref codes change without a rebuild, so this must never be cached.
      'Cache-Control': 'no-store',
      'Referrer-Policy': 'no-referrer-when-downgrade',
      'X-Robots-Tag': 'noindex, nofollow',
    },
  });
};
