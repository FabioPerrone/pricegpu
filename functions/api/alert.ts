interface Env {
  ALERTS_KV?: KVNamespace;
  ALERT_EMAIL_SERVICE?: string;
  ALERT_EMAIL_API_KEY?: string;
}

interface PriceAlert {
  email: string;
  gpu_slug: string;
  gpu_name: string;
  price_threshold: number;
  subscribed_at: string;
}

export async function onRequest(context: any): Promise<Response> {
  const { request, env } = context as { request: Request; env: Env };

  // Only POST allowed
  if (request.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  try {
    const formData = await request.formData();
    const email = formData.get('email') as string | null;
    const gpu_slug = formData.get('gpu_slug') as string | null;
    const gpu_name = formData.get('gpu_name') as string | null;
    const price_threshold_str = formData.get('price_threshold') as string | null;

    // Validate input
    if (!email || !gpu_slug || !gpu_name || !price_threshold_str) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return new Response(JSON.stringify({ error: 'Invalid email address' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const price_threshold = parseFloat(price_threshold_str);
    if (isNaN(price_threshold) || price_threshold < 0) {
      return new Response(JSON.stringify({ error: 'Invalid price threshold' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Create alert object
    const alert: PriceAlert = {
      email,
      gpu_slug,
      gpu_name,
      price_threshold,
      subscribed_at: new Date().toISOString(),
    };

    // Store in KV (if available)
    if (env.ALERTS_KV) {
      const key = `alert:${email}:${gpu_slug}`;
      await env.ALERTS_KV.put(key, JSON.stringify(alert), { expirationTtl: 7776000 }); // 90 days
    }

    // TODO: Forward to email service (Buttondown, ConvertKit, etc.)
    // Example: await sendToEmailService(email, alert, env);

    const message = price_threshold > 0
      ? `Subscribed. We'll email ${email} when the ${gpu_name} drops below $${price_threshold.toFixed(2)}/hr.`
      : `Subscribed. We'll email ${email} when the ${gpu_name} becomes available.`;

    // The form posts over fetch and asks for JSON. Without JavaScript the
    // browser navigates to whatever comes back, so a plain submit must not be
    // answered with a JSON body — that leaves the visitor staring at source.
    if (!request.headers.get('Accept')?.includes('application/json')) {
      const back = request.headers.get('Referer') ?? '/';
      return new Response(null, { status: 303, headers: { Location: `${back}#subscribed` } });
    }

    return new Response(JSON.stringify({ success: true, message }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('Alert subscription error:', err);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
