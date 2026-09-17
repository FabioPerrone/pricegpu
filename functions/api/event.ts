/**
 * Pageview beacon.
 *
 * Outbound clicks are only half a funnel — a click count means nothing without
 * the views it converted from. Cloudflare's own analytics report pageviews but
 * cannot be joined to click rows, so views land in the same D1 table as clicks
 * and per-page click-through rate becomes one query.
 *
 * Stores no IP, no identifier and no cookie, so it measures pages rather than
 * people and stays outside consent-gated tracking.
 */
interface Env {
  ANALYTICS?: D1Database;
}

interface CfRequest extends Request {
  cf?: { country?: string };
}

/** Beacons are unauthenticated, so treat every field as hostile. */
function sanitizePath(raw: unknown): string | null {
  if (typeof raw !== 'string' || !raw.startsWith('/') || raw.length > 256) return null;
  return raw.split('?')[0].split('#')[0];
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env } = context;

  // Same-origin only: a beacon endpoint open to the web is an open write.
  const origin = request.headers.get('Origin');
  if (origin && new URL(origin).host !== new URL(request.url).host) {
    return new Response(null, { status: 403 });
  }

  let body: { path?: unknown; gpu?: unknown; ref?: unknown };
  try {
    body = await request.json();
  } catch {
    return new Response(null, { status: 400 });
  }

  const path = sanitizePath(body.path);
  if (!path) return new Response(null, { status: 400 });

  if (!env.ANALYTICS) return new Response(null, { status: 204 });

  const now = new Date();
  const gpu = typeof body.gpu === 'string' && body.gpu.length <= 64 ? body.gpu : null;

  let referrerHost: string | null = null;
  if (typeof body.ref === 'string' && body.ref) {
    try {
      const host = new URL(body.ref).host;
      referrerHost = host === new URL(request.url).host ? null : host.slice(0, 128);
    } catch {
      /* not a usable referrer */
    }
  }

  context.waitUntil(
    env.ANALYTICS.prepare(
      `INSERT INTO event (ts, day, type, path, gpu, referrer_host, country, device)
       VALUES (?, ?, 'view', ?, ?, ?, ?, ?)`
    )
      .bind(
        Math.floor(now.getTime() / 1000),
        now.toISOString().slice(0, 10),
        path,
        gpu,
        referrerHost,
        (request as CfRequest).cf?.country ?? null,
        /Mobi|Android|iPhone/i.test(request.headers.get('User-Agent') ?? '') ? 'mobile' : 'desktop'
      )
      .run()
      .catch(() => {})
  );

  return new Response(null, { status: 204 });
};
