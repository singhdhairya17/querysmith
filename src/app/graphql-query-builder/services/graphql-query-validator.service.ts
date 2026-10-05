import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import {
  Observable,
  TimeoutError,
  catchError,
  map,
  of,
  throwError,
  timeout,
} from 'rxjs';

import { GRAPHQL_HTTP_GATEWAY } from '../graphql-http-gateway.token';
import {
  resolveGraphqlHttpPost,
  shouldRetryGraphqlWithoutGateway,
} from '../graphql-gateway-request.util';
import { graphqlJsonHttpHeaders } from '../graphql-http-headers.util';
import {
  GraphqlQueryPayload,
  GraphqlTestResult,
  GraphqlValidationError,
} from '../models/graphql-query.model';

/**
 * Tests and executes queries against a GraphQL HTTP endpoint. Validation
 * is done by the server itself (parse + validate against its schema).
 */
@Injectable({ providedIn: 'root' })
export class GraphqlQueryValidatorService {
  private readonly http = inject(HttpClient);
  private readonly httpGateway = inject(GRAPHQL_HTTP_GATEWAY);

  /**
   * POSTs `{ query, variables }` to a GraphQL HTTP endpoint and maps the
   * JSON response into {@link GraphqlTestResult}.
   */
  testQueryAtEndpoint(
    endpointUrl: string,
    payload: GraphqlQueryPayload,
    httpHeaders?: Record<string, string>,
  ): Observable<GraphqlTestResult> {
    const trimmed = endpointUrl.trim();
    const gateway = this.httpGateway?.trim() ?? null;
    const headers = graphqlJsonHttpHeaders(httpHeaders);

    const post = (useGateway: boolean): Observable<GraphqlTestResult> => {
      const gw = useGateway && gateway ? gateway : null;
      const { url, body } = resolveGraphqlHttpPost(
        trimmed,
        {
          query: payload.query,
          variables: payload.variables,
          operationName: payload.operationName,
        },
        gw,
      );
      return this.http
        .post<{
          data?: unknown;
          errors?: {
            message: string;
            locations?: { line: number; column: number }[];
            path?: (string | number)[];
          }[];
        }>(url, body, { headers })
        .pipe(
          timeout(45_000),
          map(responseBody => endpointResponseToTestResult(responseBody)),
          catchError((err: unknown) => {
            if (err instanceof TimeoutError) {
              return of({
                ok: false as const,
                errors: [
                  {
                    message:
                      'Request timed out after 45s — check the URL or run `npm start` with the dev proxy.',
                  },
                ],
              });
            }
            if (
              useGateway &&
              gateway &&
              shouldRetryGraphqlWithoutGateway(err)
            ) {
              return post(false);
            }
            return of(endpointHttpErrorToTestResult(err));
          }),
        );
    };

    return gateway ? post(true) : post(false);
  }

  executeQueryAtEndpoint(
    endpointUrl: string,
    payload: GraphqlQueryPayload,
    httpHeaders?: Record<string, string>,
  ): Observable<unknown> {
    const trimmed = endpointUrl.trim();
    const gateway = this.httpGateway?.trim() ?? null;
    const headers = graphqlJsonHttpHeaders(httpHeaders);

    const post = (useGateway: boolean): Observable<unknown> => {
      const gw = useGateway && gateway ? gateway : null;
      const { url, body } = resolveGraphqlHttpPost(
        trimmed,
        {
          query: payload.query,
          variables: payload.variables,
          operationName: payload.operationName,
        },
        gw,
      );
      return this.http.post(url, body, { headers }).pipe(
        timeout(45_000),
        catchError((err: unknown) => {
          if (err instanceof TimeoutError) {
            return throwError(
              () => new Error('Execute timed out after 45s.'),
            );
          }
          if (
            useGateway &&
            gateway &&
            shouldRetryGraphqlWithoutGateway(err)
          ) {
            return post(false);
          }
          return throwError(() =>
            err instanceof Error ? err : new Error(String(err)),
          );
        }),
      );
    };

    return gateway ? post(true) : post(false);
  }
}

function endpointResponseToTestResult(body: {
  data?: unknown;
  errors?: {
    message: string;
    locations?: { line: number; column: number }[];
    path?: (string | number)[];
  }[];
}): GraphqlTestResult {
  if (body.errors?.length) {
    const errors: GraphqlValidationError[] = body.errors.map(e => ({
      message: e.message,
      line: e.locations?.[0]?.line,
      column: e.locations?.[0]?.column,
      path: e.path,
    }));
    return { ok: false, errors, data: body.data };
  }
  return { ok: true, data: body.data };
}

function endpointHttpErrorToTestResult(err: unknown): GraphqlTestResult {
  if (err instanceof HttpErrorResponse) {
    const body = err.error as
      | { errors?: { message: string }[]; message?: string }
      | undefined;
    const msg =
      body?.errors?.map(e => e.message).join('; ') ??
      (typeof body?.message === 'string' ? body.message : null) ??
      (err.status === 0
        ? 'Network or CORS error — the endpoint may block browser requests.'
        : err.message || `HTTP ${err.status}`);
    return { ok: false, errors: [{ message: msg }] };
  }
  return {
    ok: false,
    errors: [{ message: err instanceof Error ? err.message : 'Request failed.' }],
  };
}
