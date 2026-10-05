/**
 * Dev-only forwarder: Angular POSTs same-origin /__graphql-proxy → ng serve
 * rewrites to this server. We strip __graphqlProxyTarget and POST the rest
 * (query / variables) to the real GraphQL HTTP endpoint (no browser CORS).
 * Incoming Authorization / Cookie / X-* headers are forwarded upstream.
 */
import http from 'node:http';

const PORT = Number(process.env.GRAPHQL_PROXY_PORT || 45921);
const FIELD = '__graphqlProxyTarget';

const HOP_BY_HOP = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
  'host',
  'content-length',
]);

/** @param {import('node:http').IncomingMessage} req */
function upstreamHeadersFromRequest(req) {
  /** @type {Record<string, string>} */
  const out = {};
  for (const [key, val] of Object.entries(req.headers)) {
    const lk = key.toLowerCase();
    if (HOP_BY_HOP.has(lk)) continue;
    if (val === undefined) continue;
    const value = Array.isArray(val) ? val.join(', ') : val;
    if (!value) continue;
    out[lk] = value;
  }
  out['content-type'] = 'application/json';
  out['accept'] = 'application/json';
  return out;
}

const server = http.createServer(async (req, res) => {
  if (req.url !== '/proxy' || req.method !== 'POST') {
    res.statusCode = 404;
    res.end();
    return;
  }

  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }

  let body;
  try {
    body = JSON.parse(
      Buffer.concat(chunks).toString('utf8') || '{}',
    );
  } catch {
    res.statusCode = 400;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ errors: [{ message: 'Invalid JSON body' }] }));
    return;
  }

  const target = body[FIELD];
  if (!target || typeof target !== 'string') {
    res.statusCode = 400;
    res.setHeader('content-type', 'application/json');
    res.end(
      JSON.stringify({
        errors: [{ message: `Missing ${FIELD} in proxied request body` }],
      }),
    );
    return;
  }

  delete body[FIELD];

  try {
    const upstream = await fetch(target.trim(), {
      method: 'POST',
      headers: upstreamHeadersFromRequest(req),
      body: JSON.stringify(body),
    });

    const buffer = Buffer.from(await upstream.arrayBuffer());
    const ct =
      upstream.headers.get('content-type') ?? 'application/json';

    res.statusCode = upstream.status;
    res.setHeader('content-type', ct);
    res.end(buffer);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : String(err);
    res.statusCode = 502;
    res.setHeader('content-type', 'application/json');
    res.end(
      JSON.stringify({
        errors: [{ message: `Proxy fetch failed: ${message}` }],
      }),
    );
  }
});

server.listen(PORT, '127.0.0.1', () => {
  // eslint-disable-next-line no-console
  console.log(
    `[graphql-proxy] http://127.0.0.1:${PORT}/proxy (forward GraphQL POSTs)`,
  );
});
