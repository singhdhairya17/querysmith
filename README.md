# querysmith

Build GraphQL queries by clicking instead of typing. Paste in a GraphQL
endpoint, and querysmith pulls the schema through introspection. You pick
fields from a tree, fill in arguments, and it writes the query or mutation for
you. Hit Test to run it and see the response.

Live demo: https://singhdhairya17.github.io/querysmith/

## What it does

- Loads the schema from any GraphQL HTTP endpoint
- Lets you expand nested fields one level at a time, so cyclic schemas don't blow up
- Shows a dropdown for enum arguments and a text box for everything else
- Handles queries and mutations, and types `$variables` from the schema
- Keeps the generated query editable, so you can tweak it by hand
- Sends custom headers like `Authorization` for APIs that need a token

## Running it locally

You need Node.js 18 or newer.

```bash
npm install
npm start
```

Then open http://localhost:4200.

`npm start` runs the Angular dev server and a small proxy
(`scripts/graphql-proxy-server.mjs`) side by side. The proxy forwards GraphQL
requests from your machine, which gets around APIs that block requests coming
straight from a browser (CORS).

Two public endpoints to try:

| Endpoint | Supports |
| --- | --- |
| `https://countries.trevorblades.com/graphql` | Queries |
| `https://graphqlplaceholder.vercel.app/graphql` | Queries and mutations |

## Project layout

The builder itself lives in
[`src/app/graphql-query-builder`](src/app/graphql-query-builder) as standalone
Angular components and services. Everything else is a thin demo page around it.

```
src/app/graphql-query-builder/
  components/   builder UI, field tree, argument editor
  services/     schema loading, query generation, test/execute requests
  models/       metadata and payload types
  public-api.ts
```

To drop the builder into your own Angular app, see its
[README](src/app/graphql-query-builder/README.md).

## Production build

```bash
npm run build
```

The production build skips the dev proxy (see
`src/environments/environment.prod.ts`), so the browser talks to the GraphQL
endpoint directly. Public APIs that allow cross-origin requests work fine. If
yours doesn't, put your own server-side proxy in front of it and pass its path
through the `GRAPHQL_HTTP_GATEWAY` token.

## Deployment

Pushing to `main` builds the app and publishes it to GitHub Pages using
[`.github/workflows/deploy.yml`](.github/workflows/deploy.yml).

## Built with

Angular 19, TypeScript, RxJS and SCSS.
