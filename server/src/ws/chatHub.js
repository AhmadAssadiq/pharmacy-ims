/**
 * WebSocket hub for real-time chat delivery (FR 5.1, NFR 1.2).
 *
 * - Clients connect to ws://<host>/ws?token=<jwt>; the token is verified
 *   before the socket is accepted (FR 1).
 * - Incoming `{ type: 'message', sessionId, content }` frames are persisted via
 *   chatService and then pushed to the session's patient and to every
 *   connected staff member, so the staff inbox updates without a refresh.
 * - `publish()` is also called by the REST controller so messages sent over
 *   HTTP are delivered in real time too.
 */
const { WebSocketServer } = require('ws');
const { verifyToken } = require('../services/tokenService');
const chatService = require('../services/chatService');
const { ROLES } = require('../../../shared/constants.json');

const HEARTBEAT_INTERVAL_MS = 30_000;

// userId -> Set<WebSocket>
const socketsByUser = new Map();

function addSocket(user, ws) {
  if (!socketsByUser.has(user.id)) socketsByUser.set(user.id, new Set());
  socketsByUser.get(user.id).add(ws);
}

function removeSocket(user, ws) {
  const set = socketsByUser.get(user.id);
  if (!set) return;
  set.delete(ws);
  if (set.size === 0) socketsByUser.delete(user.id);
}

function send(ws, payload) {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(payload));
}

function sendToUser(userId, payload) {
  const set = socketsByUser.get(userId);
  if (!set) return;
  for (const ws of set) send(ws, payload);
}

function sendToRole(role, payload) {
  for (const set of socketsByUser.values()) {
    for (const ws of set) if (ws.user.role === role) send(ws, payload);
  }
}

/** Pushes a persisted message to the patient of the session and to all staff. */
function publish({ message, session }) {
  const payload = { type: 'message', message, session };
  sendToUser(session.patient_id, payload);
  sendToRole(ROLES.STAFF, payload);
}

function authenticateUpgrade(req) {
  const url = new URL(req.url, 'http://localhost');
  const token = url.searchParams.get('token');
  if (!token) return null;
  try {
    return verifyToken(token);
  } catch {
    return null;
  }
}

async function handleFrame(ws, raw) {
  let frame;
  try {
    frame = JSON.parse(raw);
  } catch {
    return send(ws, { type: 'error', error: 'Malformed frame' });
  }

  if (frame.type !== 'message') return send(ws, { type: 'error', error: 'Unknown frame type' });

  try {
    const result = await chatService.sendMessage({
      sessionId: Number(frame.sessionId),
      sender: ws.user,
      content: frame.content,
    });
    publish(result);
    send(ws, { type: 'ack', clientId: frame.clientId, messageId: result.message.id });
  } catch (err) {
    send(ws, { type: 'error', clientId: frame.clientId, error: err.message });
  }
}

/** Attaches the WebSocket server to an existing http.Server. */
function attachChatHub(httpServer) {
  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });

  wss.on('connection', (ws, req) => {
    const user = authenticateUpgrade(req);
    if (!user) {
      ws.close(4401, 'Authentication required');
      return;
    }

    ws.user = user;
    ws.isAlive = true;
    addSocket(user, ws);
    send(ws, { type: 'ready', user });

    ws.on('pong', () => {
      ws.isAlive = true;
    });
    ws.on('message', (raw) => handleFrame(ws, raw.toString()));
    ws.on('close', () => removeSocket(user, ws));
    ws.on('error', () => removeSocket(user, ws));
  });

  // Drop connections that stopped answering pings (closed laptops, lost networks).
  const heartbeat = setInterval(() => {
    for (const ws of wss.clients) {
      if (!ws.isAlive) {
        ws.terminate();
        continue;
      }
      ws.isAlive = false;
      ws.ping();
    }
  }, HEARTBEAT_INTERVAL_MS);
  wss.on('close', () => clearInterval(heartbeat));

  return wss;
}

module.exports = { attachChatHub, publish };
