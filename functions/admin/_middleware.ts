interface Env {
  ADMIN_PASSWORD: string;
  ADMIN_SESSION_TOKEN: string;
}

const COOKIE_NAME = 'pgpu_admin';
const COOKIE_MAX_AGE = 60 * 60 * 8; // 8 hours

function loginPage(error = ''): Response {
  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>Admin — PriceGPU</title>
  <meta name="robots" content="noindex,nofollow"/>
  <style>
    *{box-sizing:border-box}
    body{background:#0d0d0d;color:#e8e8e8;font-family:monospace;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0}
    form{background:#161616;border:1px solid #2a2a2a;border-radius:8px;padding:2rem;width:100%;max-width:320px}
    h1{font-size:1rem;margin:0 0 1.5rem;color:#aaa}
    input{width:100%;background:#0d0d0d;border:1px solid #2a2a2a;color:#e8e8e8;padding:0.6rem 0.8rem;border-radius:4px;font-family:monospace;font-size:0.9rem;outline:none}
    input:focus{border-color:#00D26A}
    button{margin-top:1rem;width:100%;background:#00D26A;color:#000;border:none;padding:0.6rem;border-radius:4px;font-family:monospace;font-weight:bold;cursor:pointer;font-size:0.9rem}
    .err{color:#ff6666;font-size:0.8rem;margin-top:0.75rem}
  </style>
</head>
<body>
  <form method="POST">
    <h1>PriceGPU Admin</h1>
    <input type="password" name="password" placeholder="Password" autofocus required/>
    <button type="submit">Enter</button>
    ${error ? `<p class="err">${error}</p>` : ''}
  </form>
</body>
</html>`;
  return new Response(html, {
    status: error ? 401 : 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}

function isAuthenticated(request: Request, env: Env): boolean {
  const cookie = request.headers.get('Cookie') ?? '';
  const match = cookie.match(new RegExp(`${COOKIE_NAME}=([^;\\s]+)`));
  return match?.[1] === env.ADMIN_SESSION_TOKEN;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function onRequest(context: any): Promise<Response> {
  const { request, env, next } = context as { request: Request; env: Env; next: () => Promise<Response> };
  if (!env.ADMIN_PASSWORD || !env.ADMIN_SESSION_TOKEN) {
    return new Response('Admin not configured.', { status: 503 });
  }

  if (isAuthenticated(request, env)) {
    return next();
  }

  if (request.method === 'POST') {
    let password: string | null = null;
    try {
      const form = await request.formData();
      password = form.get('password') as string | null;
    } catch {
      return loginPage('Invalid request.');
    }

    if (password === env.ADMIN_PASSWORD) {
      const response = await next();
      const authed = new Response(response.body, response);
      authed.headers.set(
        'Set-Cookie',
        `${COOKIE_NAME}=${env.ADMIN_SESSION_TOKEN}; Path=/admin; HttpOnly; Secure; SameSite=Strict; Max-Age=${COOKIE_MAX_AGE}`
      );
      return authed;
    }

    return loginPage('Wrong password.');
  }

  return loginPage();
}
