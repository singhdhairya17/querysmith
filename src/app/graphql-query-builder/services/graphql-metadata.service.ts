import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import {
  Observable,
  TimeoutError,
  catchError,
  map,
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
  GraphqlArgument,
  GraphqlField,
  GraphqlFieldNode,
  GraphqlKind,
  GraphqlMetadata,
  GraphqlObjectType,
} from '../models/graphql-metadata.model';

interface RawTypeRef {
  kind: GraphqlKind;
  name: string | null;
  ofType?: RawTypeRef | null;
}

interface RawArg {
  name: string;
  description?: string;
  type: RawTypeRef;
  defaultValue?: string | null;
}

interface RawField {
  name: string;
  description?: string;
  type: RawTypeRef;
  args: RawArg[];
}

interface RawType {
  kind: GraphqlKind;
  name: string;
  description?: string;
  fields?: RawField[] | null;
  enumValues?: { name: string }[] | null;
}

interface IntrospectionResponse {
  data: {
    __schema: {
      queryType: { name: string };
      mutationType?: { name: string } | null;
      subscriptionType?: { name: string } | null;
      types: RawType[];
    };
  };
}

/** Full schema introspection sent as a POST body to any GraphQL HTTP endpoint. */
const INTROSPECTION_QUERY = `
query IntrospectionQuery {
  __schema {
    queryType { name }
    mutationType { name }
    subscriptionType { name }
    types {
      kind
      name
      description
      fields(includeDeprecated: true) {
        name
        description
        args {
          name
          description
          defaultValue
          type {
            ...TypeRef
          }
        }
        type {
          ...TypeRef
        }
      }
      enumValues(includeDeprecated: true) {
        name
      }
    }
  }
}

fragment TypeRef on __Type {
  kind
  name
  ofType {
    kind
    name
    ofType {
      kind
      name
      ofType {
        kind
        name
        ofType {
          kind
          name
          ofType {
            kind
            name
            ofType {
              kind
              name
              ofType {
                kind
                name
              }
            }
          }
        }
      }
    }
  }
}
`;

/** Same introspection shape without fragments — avoids servers that reject multi-doc introspection (some gateways / APIs). */
const INTROSPECTION_QUERY_FALLBACK = `
query IntrospectionFallback {
  __schema {
    queryType { name }
    mutationType { name }
    subscriptionType { name }
    types {
      kind
      name
      description
      fields(includeDeprecated: true) {
        name
        description
        args {
          name
          description
          defaultValue
          type {
            kind
            name
            ofType {
              kind
              name
              ofType {
                kind
                name
                ofType {
                  kind
                  name
                  ofType {
                    kind
                    name
                    ofType {
                      kind
                      name
                      ofType {
                        kind
                        name
                        ofType {
                          kind
                          name
                          ofType {
                            kind
                            name
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
        type {
          kind
          name
          ofType {
            kind
            name
            ofType {
              kind
              name
              ofType {
                kind
                name
                ofType {
                  kind
                  name
                  ofType {
                    kind
                    name
                    ofType {
                      kind
                      name
                      ofType {
                        kind
                        name
                        ofType {
                          kind
                          name
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
      enumValues(includeDeprecated: true) {
        name
      }
    }
  }
}
`;

/**
 * Fetches and normalizes GraphQL metadata so the query builder
 * can render it without dealing with raw introspection.
 */
@Injectable({ providedIn: 'root' })
export class GraphqlMetadataService {
  private readonly http = inject(HttpClient);
  private readonly httpGateway = inject(GRAPHQL_HTTP_GATEWAY);

  /**
   * Loads schema by POSTing the introspection query to a public or custom
   * GraphQL HTTP endpoint (any server that supports standard introspection).
   */
  loadFromEndpoint(
    endpointUrl: string,
    httpHeaders?: Record<string, string>,
  ): Observable<GraphqlMetadata> {
    const trimmed = endpointUrl.trim();
    const gateway = this.httpGateway?.trim() ?? null;

    const formatFail = (e: unknown) =>
      e instanceof Error ? e.message : introspectionErrorMessage(e);

    const postIntrospectionWithDoc = (
      queryDoc: string,
      useGateway: boolean,
    ): Observable<GraphqlMetadata> => {
      const gw = useGateway && gateway ? gateway : null;
      const { url, body } = resolveGraphqlHttpPost(
        trimmed,
        { query: queryDoc, variables: {} },
        gw,
      );
      const headers = graphqlJsonHttpHeaders(httpHeaders);
      return this.http
        .post<IntrospectionResponse & { errors?: { message: string }[] }>(
          url,
          body,
          { headers },
        )
        .pipe(
          timeout(45_000),
          map(resBody => {
            if (!resBody.data?.__schema) {
              const graphqlMsgs = resBody.errors?.map(e => e.message).join('; ');
              throw new Error(
                graphqlMsgs ??
                  'Invalid introspection response (missing data.__schema).',
              );
            }
            return this.normalize(resBody);
          }),
          catchError((err: unknown) => {
            if (err instanceof TimeoutError) {
              return throwError(
                () =>
                  new Error(
                    'Introspection timed out after 45s — check the URL, or run `npm start` so the dev proxy is up.',
                  ),
              );
            }
            const message = introspectionErrorMessage(err);
            return throwError(() => new Error(message));
          }),
        );
    };

    const postIntrospection = (useGateway: boolean): Observable<GraphqlMetadata> =>
      postIntrospectionWithDoc(INTROSPECTION_QUERY, useGateway).pipe(
        catchError((firstErr: unknown) =>
          postIntrospectionWithDoc(INTROSPECTION_QUERY_FALLBACK, useGateway).pipe(
            catchError((secondErr: unknown) =>
              throwError(
                () =>
                  new Error(
                    `${formatFail(secondErr)}\n\n(Primary introspection also failed: ${formatFail(firstErr)})`,
                  ),
              ),
            ),
          ),
        ),
      );

    if (!gateway) {
      return postIntrospection(false);
    }

    return postIntrospection(true).pipe(
      catchError(err => {
        if (!shouldRetryGraphqlWithoutGateway(err)) {
          return throwError(() =>
            err instanceof Error ? err : new Error(String(err)),
          );
        }
        return postIntrospection(false).pipe(
          catchError(directErr => {
            const directMsg =
              directErr instanceof Error
                ? directErr.message
                : introspectionErrorMessage(directErr);
            const gatewayMsg =
              err instanceof Error ? err.message : introspectionErrorMessage(err);
            return throwError(
              () =>
                new Error(
                  `${directMsg}\n\n(Direct request after gateway failed: ${gatewayMsg})`,
                ),
            );
          }),
        );
      }),
    );
  }

  normalize(raw: IntrospectionResponse): GraphqlMetadata {
    const schema = raw.data.__schema;
    const types = schema.types ?? [];
    const queryRootName = schema.queryType?.name?.trim();

    if (!queryRootName) {
      throw new Error(
        'Introspection response is missing the query root type name.',
      );
    }

    const objects: GraphqlObjectType[] = types
      .filter(
        type =>
          (type.kind === 'OBJECT' || type.kind === 'INTERFACE') &&
          !!type.name &&
          !type.name.startsWith('__'),
      )
      .map(type => ({
        name: type.name.trim(),
        description: type.description,
        fields: (type.fields ?? []).map(field => this.toField(field)),
      }));

    const queryRoot = this.pickQueryRoot(objects, queryRootName);
    if (!queryRoot?.fields?.length) {
      throw new Error(
        `Could not load fields for query root (declared "${queryRootName}"). ` +
          `Confirm the endpoint URL is correct, the auth headers are set, ` +
          `and the credentials are allowed to run introspection. ` +
          `Use DevTools → Network on Refresh schema to inspect the response.`,
      );
    }

    const enums: Record<string, string[]> = {};
    for (const type of types) {
      if (
        type.kind === 'ENUM' &&
        type.name &&
        !type.name.startsWith('__')
      ) {
        enums[type.name.trim()] = (type.enumValues ?? []).map(
          value => value.name,
        );
      }
    }

    return {
      queryType: queryRoot.name,
      mutationType: schema.mutationType?.name?.trim(),
      subscriptionType: schema.subscriptionType?.name?.trim(),
      objects,
      enums,
    };
  }

  private pickQueryRoot(
    objects: GraphqlObjectType[],
    declaredRootName: string,
  ): GraphqlObjectType | undefined {
    const name = declaredRootName.trim();
    if (!name) {
      return undefined;
    }

    const pick = (n: string) => {
      const t = objects.find(o => o.name === n);
      return t && t.fields.length > 0 ? t : undefined;
    };

    return pick(name) ?? pick('QueryRoot') ?? pick('Query');
  }

  toFieldNode(
    field: GraphqlField,
    metadata: GraphqlMetadata,
  ): GraphqlFieldNode {
    const node: GraphqlFieldNode = {
      name: field.name,
      typeName: field.typeName,
      kind: field.kind,
      isList: field.isList,
      isScalar: field.isScalar,
      description: field.description,
      args: field.args,
      argumentValues: {},
      selected: false,
      expanded: false,
      children: [],
      childrenLoaded: false,
    };

    // Children load lazily when the user expands a row (see graphql-field-tree).
    // Eager buildChildren here overflows the stack on cyclic schema graphs.

    return node;
  }

  buildChildren(
    typeName: string,
    metadata: GraphqlMetadata,
  ): GraphqlFieldNode[] {
    const type = metadata.objects.find(object => object.name === typeName);
    if (!type) {
      return [];
    }
    return type.fields.map(field => this.toFieldNode(field, metadata));
  }

  /** Lazy-loads {@link GraphqlFieldNode.children} once for non-scalar nodes. */
  loadChildrenIfNeeded(
    node: GraphqlFieldNode,
    metadata: GraphqlMetadata | null,
  ): void {
    if (!metadata || node.isScalar || node.childrenLoaded) {
      return;
    }
    node.children = this.buildChildren(node.typeName, metadata);
    node.childrenLoaded = true;
  }

  private toField(raw: RawField): GraphqlField {
    const unwrapped = this.unwrap(raw.type);
    return {
      name: raw.name,
      description: raw.description,
      typeName: unwrapped.typeName,
      kind: unwrapped.kind,
      isList: unwrapped.isList,
      isScalar: unwrapped.kind === 'SCALAR' || unwrapped.kind === 'ENUM',
      args: (raw.args ?? []).map(arg => this.toArgument(arg)),
    };
  }

  private toArgument(raw: RawArg): GraphqlArgument {
    const unwrapped = this.unwrap(raw.type);
    return {
      name: raw.name,
      description: raw.description,
      typeName: unwrapped.typeName,
      kind: unwrapped.kind,
      required: unwrapped.required,
      defaultValue: raw.defaultValue ?? null,
    };
  }

  /**
   * Walks a `Type ! [ ofType ]` chain and returns the inner named type
   * along with whether it was a list and whether it was non-null.
   */
  private unwrap(type: RawTypeRef): {
    typeName: string;
    kind: GraphqlKind;
    required: boolean;
    isList: boolean;
  } {
    let required = false;
    let isList = false;
    let cursor: RawTypeRef | null | undefined = type;

    while (cursor) {
      if (cursor.kind === 'NON_NULL') {
        required = true;
        cursor = cursor.ofType;
        continue;
      }
      if (cursor.kind === 'LIST') {
        isList = true;
        cursor = cursor.ofType;
        continue;
      }
      break;
    }

    return {
      typeName: cursor?.name ?? 'Unknown',
      kind: (cursor?.kind ?? 'SCALAR') as GraphqlKind,
      required,
      isList,
    };
  }
}

function introspectionErrorMessage(err: unknown): string {
  if (err instanceof HttpErrorResponse) {
    if (typeof err.error === 'string') {
      const t = err.error.trim();
      if (/^<!DOCTYPE/i.test(t) || /^<html/i.test(t)) {
        return (
          `HTTP ${err.status}: response was HTML, not JSON — wrong URL or an auth/login redirect. ` +
            `Check that the URL points at the GraphQL endpoint and the auth headers are valid.`
        );
      }
    }
    const body = err.error as
      | { errors?: { message: string }[]; message?: string }
      | undefined;
    const fromGraphql = body?.errors?.map(e => e.message).join('; ');
    if (fromGraphql) {
      return fromGraphql;
    }
    if (typeof body?.message === 'string') {
      return body.message;
    }
    if (err.status === 401 || err.status === 403) {
      return (
        `${err.message || `HTTP ${err.status}`} — ` +
          `check auth headers (e.g. Authorization: Bearer <token> or an API key header).`
      );
    }
    if (err.status === 0) {
      return 'Network or CORS error — the endpoint may block browser requests.';
    }
    if (err.status === 502 || err.status === 503 || err.status === 504) {
      return (
        `${err.message || `HTTP ${err.status}`} — ` +
        `If you use the demo proxy path /__graphql-proxy, run \`npm start\` (proxy + ng serve), not \`ng serve\` alone.`
      );
    }
    return err.message || `HTTP ${err.status}`;
  }
  if (err instanceof Error) {
    return err.message;
  }
  return 'Failed to load schema from endpoint.';
}
