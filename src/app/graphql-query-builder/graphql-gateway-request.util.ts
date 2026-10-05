import { HttpErrorResponse } from '@angular/common/http';

import { GRAPHQL_PROXY_TARGET_FIELD } from './graphql-http-gateway.token';

/** HTTP statuses where same-origin dev gateway usually failed but direct POST may work (CORS permitting). */
export function shouldRetryGraphqlWithoutGateway(err: unknown): boolean {
  if (!(err instanceof HttpErrorResponse)) {
    return false;
  }
  return [0, 404, 502, 503, 504].includes(err.status);
}

export interface GraphqlPostPayload {
  query: string;
  variables?: Record<string, unknown>;
  operationName?: string;
}

/**
 * Same-origin gateway wraps the payload with the real endpoint URL so a dev
 * proxy can forward without browser CORS.
 */
export function resolveGraphqlHttpPost(
  endpointUrl: string,
  graphqlBody: GraphqlPostPayload,
  httpGateway: string | null,
): { url: string; body: Record<string, unknown> } {
  const trimmed = endpointUrl.trim();
  const gw = httpGateway?.trim();
  const base: Record<string, unknown> = {
    query: graphqlBody.query,
    variables: graphqlBody.variables ?? {},
  };
  if (graphqlBody.operationName != null) {
    base['operationName'] = graphqlBody.operationName;
  }
  if (gw) {
    return {
      url: gw,
      body: {
        [GRAPHQL_PROXY_TARGET_FIELD]: trimmed,
        ...base,
      },
    };
  }
  return { url: trimmed, body: base };
}
