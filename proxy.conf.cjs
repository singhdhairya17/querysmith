/**
 * Forwards browser POST /__graphql-proxy → local graphql-proxy-server.mjs,
 * which performs the real outbound GraphQL request without CORS limits.
 */
module.exports = {
  '/__graphql-proxy': {
    target: 'http://127.0.0.1:45921',
    secure: false,
    changeOrigin: true,
    pathRewrite: {
      '^/__graphql-proxy': '/proxy',
    },
  },
};
