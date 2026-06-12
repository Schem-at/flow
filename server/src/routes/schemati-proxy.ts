/**
 * Standalone-mode passthrough to the schemati platform API.
 *
 * In coupled mode (flow served behind the schemati proxy) the browser hits
 * Laravel same-origin and this router is never reached. In standalone dev the
 * Vite client proxies /api to THIS server, so the Schemati ambient's
 * same-origin requests land here — forward them when SCHEMATI_URL is set.
 */

import { Hono } from 'hono';

const SCHEMATI_URL = (process.env.SCHEMATI_URL ?? '').replace(/\/$/, '');
if (process.env.SCHEMATI_TLS_INSECURE === '1') {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
}

const schematiProxy = new Hono();

schematiProxy.all('*', async (c) => {
  if (!SCHEMATI_URL) {
    return c.json(
      {
        success: false,
        error:
          'Schemati passthrough is not configured — set SCHEMATI_URL on the flow server (e.g. https://schemati.test).',
      },
      503
    );
  }

  const url = new URL(c.req.url);
  const target = `${SCHEMATI_URL}${url.pathname}${url.search}`;
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (process.env.SCHEMATI_API_TOKEN) {
    headers.Authorization = `Bearer ${process.env.SCHEMATI_API_TOKEN}`;
  }

  const upstream = await fetch(target, { method: c.req.method, headers });
  // Stream the body through with the upstream's content type (JSON or bytes).
  const resHeaders = new Headers();
  for (const name of ['content-type', 'content-disposition', 'content-length']) {
    const value = upstream.headers.get(name);
    if (value) resHeaders.set(name, value);
  }
  return new Response(upstream.body, { status: upstream.status, headers: resHeaders });
});

export default schematiProxy;
