/** Local dev: route GraphQL requests through the `npm start` proxy to avoid CORS. */
export const environment = {
  graphqlHttpGateway: '/__graphql-proxy' as string | null,
};
