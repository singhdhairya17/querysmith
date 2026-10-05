import { InjectionToken } from '@angular/core';

/**
 * JSON field carrying the real GraphQL endpoint when posting via a dev proxy.
 * Stripped by the proxy before the upstream request body is forwarded.
 */
export const GRAPHQL_PROXY_TARGET_FIELD = '__graphqlProxyTarget' as const;

/**
 * When non-null (e.g. `'/__graphql-proxy'` in local dev), introspection and
 * execute/test POSTs go to this **same-origin** path with a JSON body that
 * includes {@link GRAPHQL_PROXY_TARGET_FIELD}. A small Node proxy (or dev-server
 * rewrite) forwards to the real URL and avoids browser CORS limits.
 *
 * In production, leave unset (`null`) so the client POSTs directly to the URL
 * the user entered (requires CORS or a first-party gateway).
 */
export const GRAPHQL_HTTP_GATEWAY = new InjectionToken<string | null>(
  'GRAPHQL_HTTP_GATEWAY',
  { factory: (): string | null => null },
);
