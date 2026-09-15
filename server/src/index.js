/**
 * Server entry point: starts the HTTP API.
 */
const http = require('http');
const app = require('./app');
const env = require('./config/env');

const server = http.createServer(app);

server.listen(env.port, () => {
  console.log(`API server listening on http://localhost:${env.port}`);
});
