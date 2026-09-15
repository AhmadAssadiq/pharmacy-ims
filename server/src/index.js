/**
 * Server entry point: starts the HTTP API, attaches the WebSocket chat hub to
 * the same port and schedules the background forecast job.
 */
const http = require('http');
const app = require('./app');
const env = require('./config/env');
const { attachChatHub } = require('./ws/chatHub');
const { scheduleForecastJob } = require('./jobs/forecastJob');

const server = http.createServer(app);
attachChatHub(server);

server.listen(env.port, () => {
  console.log(`API server listening on http://localhost:${env.port}`);
  console.log(`WebSocket chat available at ws://localhost:${env.port}/ws`);
  scheduleForecastJob();
});
