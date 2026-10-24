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
 *
 * Presence (GP2 addition): ws/presence.js tracks open sockets per user.
 * When a patient's first socket opens or last one closes, staff get
 *   { type: 'presence', scope: 'patient', userId, online }.
 * When the pharmacy goes from no staff online to some, or back, patients get
 *   { type: 'presence', scope: 'pharmacy', online }.
 * A patient never learns about other patients. The `ready` frame carries the
 * current snapshot, so a client that connects mid-session starts correct.
 */
const { WebSocketServer } = require('ws');
const { verifyToken } = require('../services/tokenService');
const userModel = require('../models/userModel');
const chatService = require('../services/chatService');
const { presence } = require('./presence');
const { ROLES } = require('../../../shared/constants.json');

const HEARTBEAT_INTERVAL_MS = 30_000;

function send(ws, payload) {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(payload));
}

function sendToUser(userId, payload) {
  for (const ws of presence.socketsOf(userId)) send(ws, payload);
}

function sendToRole(role, payload) {
  for (const ws of presence.allSockets()) if (ws.user.role === role) send(ws, payload);
}

/** Pushes a persisted message to the patient of the session and to all staff. */
function publish({ message, session }) {
  const payload = { type: 'message', message, session };
  sendToUser(session.patient_id, payload);
  sendToRole(ROLES.STAFF, payload);
}

/** What a newly connected client should know about who else is here. */
function presenceSnapshot(user) {
  if (user.role === ROLES.STAFF) return { patients: presence.onlineIdsByRole(ROLES.PATIENT) };
  return { pharmacyOnline: presence.staffOnlineCount() > 0 };
}

/**
 * Broadcasts a presence edge, scoped so patients only ever hear about the
 * pharmacy as a whole: staff learn which patient came or went, patients learn
 * only that the first staff member arrived or the last one left.
 */
function announce(user, online, pharmacyChanged) {
  if (user.role === ROLES.PATIENT) {
    sendToRole(ROLES.STAFF, { type: 'presence', scope: 'patient', userId: user.id, online });
  } else if (pharmacyChanged) {
    sendToRole(ROLES.PATIENT, { type: 'presence', scope: 'pharmacy', online });
  }
}

function join(ws) {
  const { cameOnline, pharmacyCameOnline } = presence.connect(ws.user, ws);
  if (cameOnline) announce(ws.user, true, pharmacyCameOnline);
}

function leave(ws) {
  const { wentOffline, pharmacyWentOffline } = presence.disconnect(ws.user, ws);
  if (wentOffline) announce(ws.user, false, pharmacyWentOffline);
}

/** Like the HTTP middleware: a valid token for a user who still exists. */
async function authenticateUpgrade(req) {
  const url = new URL(req.url, 'http://localhost');
  const token = url.searchParams.get('token');
  if (!token) return null;
  let claims;
  try {
    claims = verifyToken(token);
  } catch {
    return null;
  }
  const user = await userModel.findById(claims.id);
  return user ? { id: user.id, name: user.name, email: user.email, role: user.role } : null;
}

/** Closes every socket a user holds (their account was deleted). */
function disconnectUser(userId) {
  for (const ws of presence.socketsOf(userId)) {
    leave(ws);
    ws.close(4401, 'Account deleted');
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
    send(ws, { type: 'error', clientId: frame.clientId, error: err.message, code: err.code, params: err.params });
  }
}

/** Attaches the WebSocket server to an existing http.Server. */
function attachChatHub(httpServer) {
  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });

  wss.on('connection', async (ws, req) => {
    // Alive from the start: the heartbeat must not terminate a socket that is
    // still waiting on the user lookup below.
    ws.isAlive = true;
    const user = await authenticateUpgrade(req).catch(() => null);
    if (!user) {
      ws.close(4401, 'Authentication required');
      return;
    }
    // The lookup took a moment: a client that already left must not be marked online.
    if (ws.readyState !== ws.OPEN) return;

    ws.user = user;
    join(ws);
    send(ws, { type: 'ready', user, presence: presenceSnapshot(user) });

    ws.on('pong', () => {
      ws.isAlive = true;
    });
    ws.on('message', (raw) => handleFrame(ws, raw.toString()));
    ws.on('close', () => leave(ws));
    ws.on('error', () => leave(ws));
  });

  // Drop connections that stopped answering pings (closed laptops, lost
  // networks). Leaving first takes the user offline now rather than whenever
  // the close event for the dead socket arrives; leave() is idempotent.
  const heartbeat = setInterval(() => {
    for (const ws of wss.clients) {
      if (!ws.isAlive) {
        if (ws.user) leave(ws);
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

module.exports = { attachChatHub, publish, disconnectUser };
