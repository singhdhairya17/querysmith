# GraphQL Query Builder (Angular)

A reusable, standalone-component GraphQL query builder. Point it at any
GraphQL HTTP endpoint and it loads the schema via introspection, lets you
pick fields and sub-fields from a tree, edit arguments and variables, and
preview, test, and submit the generated query.

## Folder layout

```
graphql-query-builder/
  components/
    graphql-query-builder.component.ts   # main 3-panel UI
    graphql-field-tree.component.ts      # recursive field tree
    graphql-argument-editor.component.ts # arguments / filters
  services/
    graphql-metadata.service.ts          # loads + normalizes schema
    graphql-query-builder.service.ts     # builds GraphQL query string
    graphql-query-validator.service.ts   # test / execute queries
  models/
    graphql-metadata.model.ts
    graphql-query.model.ts
  public-api.ts
```

## Requirements

- Angular 16+ (standalone components).
- `@angular/common/http` configured with `provideHttpClient`.

## Usage

```ts
import { Component } from '@angular/core';
import { GraphqlQueryBuilderComponent } from './graphql-query-builder/public-api';

@Component({
  standalone: true,
  imports: [GraphqlQueryBuilderComponent],
  template: `
    <app-graphql-query-builder
      graphqlEndpointUrl="https://countries.trevorblades.com/graphql"
      (submitted)="onQuery($event)">
    </app-graphql-query-builder>
  `,
})
export class GraphqlPage {
  onQuery(payload: { query: string; variables: Record<string, unknown> }) {
    console.log('Submit GraphQL JSON', payload);
  }
}
```

### Inputs

| Input                    | Description                                                  |
| ------------------------ | ------------------------------------------------------------ |
| `graphqlEndpointUrl`     | Initial GraphQL endpoint URL (editable in the UI).           |
| `graphqlHttpHeadersJson` | Initial JSON object of HTTP headers, e.g. `Authorization`.   |
| `graphqlVariablesJson`   | Initial JSON object of GraphQL variables.                    |

### Output

`submitted` emits a `GraphqlQueryPayload`:

```json
{
  "query": "{\n  country(code: \"US\") {\n    name\n    capital\n  }\n}",
  "variables": {}
}
```

## CORS and the dev proxy

Many GraphQL APIs block direct browser requests. Provide the
`GRAPHQL_HTTP_GATEWAY` token (e.g. `'/__graphql-proxy'`) to route
introspection and test/execute requests through a same-origin proxy that
forwards them to the real endpoint. Leave it unset to POST directly.

## Features and limits

- Queries and mutations (when the schema defines a mutation root).
- Variables via `$name` argument values, with types taken from the schema.
- Single root field per operation; no fragments, aliases, or subscriptions.
- The query editor is a plain textarea and can be swapped for Monaco or
  CodeMirror in `graphql-query-builder.component.ts`.
