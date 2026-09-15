/**
 * Server entry point: starts the HTTP API and attaches the WebSocket chat hub
 * to the same port.
 */
const http = require('http');
const app = require('./app');
const env = require('./config/env');
const { attachChatHub } = require('./ws/chatHub');

const server = http.createServer(app);
attachChatHub(server);

server.listen(env.port, () => {
  console.log(`API server listening on http://localhost:${env.port}`);
  console.log(`WebSocket chat available at ws://localhost:${env.port}/ws`);
});
