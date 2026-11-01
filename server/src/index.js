// Starts the server: the HTTP API and the Socket.IO chat on the same port, plus the
// background forecast job.   npm run dev -w server   (or npm run dev at the repo root)
import http from 'node:http';
import { config } from './config.js';
import { app } from './app.js';
import { startChatSocket } from './socket/chatSocket.js';
import { startForecastJob } from './jobs/forecastJob.js';
import { ensureUploadsFolder } from './services/chatService.js';

// Make sure the folder for chat images exists
ensureUploadsFolder();

// One HTTP server for both the API (Express) and the live chat (Socket.IO)
const server = http.createServer(app);
startChatSocket(server);

server.listen(config.port, () => {
  console.log(`API server listening on http://localhost:${config.port}`);
  console.log(`Socket.IO chat available on the same port`);
  startForecastJob();
});
