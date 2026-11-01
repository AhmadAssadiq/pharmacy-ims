// Live chat with Socket.IO (FR 5.1, NFR 1.2) and online status (GP2 addition).
//
// The browser keeps one Socket.IO connection open while the user is logged in.
// Socket.IO reconnects by itself if the connection drops, and notices dead connections.
//
// Rooms: every connection joins
//   - "user:<id>"   all connections of one user (several open tabs count once)
//   - "staff" or "patients", depending on the user's role
// so we can send to one user (io.to('user:5')) or to every staff member (io.to('staff')).
//
// Events the server SENDS:
//   'ready'    { user, presence }            right after connecting
//   'message'  { message, session }          a new chat message
//   'presence' { scope: 'patient', userId, online }   to staff: a patient came online / went offline
//   'presence' { scope: 'pharmacy', online }          to patients: the first staff member came online /
//                                                     the last one went offline
// A patient never learns which other patients are online.
//
// Event the server RECEIVES:
//   'message'  { sessionId, content }, reply  - send a text message; reply({ ok, message }) or
//                                               reply({ ok: false, error, code, params })
import { Server } from 'socket.io';
import { ROLES } from '../constants.js';
import { getUserFromToken } from '../middleware/auth.js';
import { sendTextMessage } from '../services/chatService.js';

// The Socket.IO server, created by startChatSocket when the server starts
let io = null;

// How many connections are currently in a room (e.g. all the tabs of one user)
async function countConnectionsInRoom(room) {
  const sockets = await io.in(room).fetchSockets();
  return sockets.length;
}

// The ids of the patients who are online right now
export async function getOnlinePatientIds() {
  if (!io) {
    return [];
  }
  const sockets = await io.in('patients').fetchSockets();
  const ids = sockets.map((socket) => socket.data.user.id);
  return [...new Set(ids)]; // a patient with two tabs counts once
}

// Sends a new chat message to the patient of the session and to every staff member.
// Called after a message is saved (here, and by the HTTP routes in routes/chat.js).
export function publishMessage({ message, session }) {
  if (!io) {
    return;
  }
  io.to(`user:${session.patient_id}`).to('staff').emit('message', { message, session });
}

// Closes every connection of a user (their account was deleted, or their password was reset).
export function disconnectUser(userId) {
  if (!io) {
    return;
  }
  io.in(`user:${userId}`).disconnectSockets(true);
}

// Tells the right people that `user` came online (`online` true) or went offline (false).
async function announcePresence(user, online) {
  if (user.role === ROLES.PATIENT) {
    // Staff see each patient's online dot
    io.to('staff').emit('presence', { scope: 'patient', userId: user.id, online });
    return;
  }

  // A staff member: patients only care whether ANY staff member is online.
  // Coming online: tell them if this is now the only staff member online.
  // Going offline: tell them if nobody from the staff is left.
  const staffOnline = await countConnectionsInRoom('staff');
  const pharmacyJustCameOnline = online && staffOnline === 1;
  const pharmacyJustWentOffline = !online && staffOnline === 0;
  if (pharmacyJustCameOnline || pharmacyJustWentOffline) {
    io.to('patients').emit('presence', { scope: 'pharmacy', online });
  }
}

// Starts the Socket.IO server on the same port as the API.
export function startChatSocket(httpServer) {
  io = new Server(httpServer);

  // 1. Before a connection is accepted, check the login token the browser sends with it
  io.use(async (socket, next) => {
    const user = await getUserFromToken(socket.handshake.auth.token).catch(() => null);
    if (!user) {
      // The browser receives this and signs the user out (see client/src/api/socket.js)
      return next(new Error('AUTH_FAILED'));
    }
    socket.data.user = user;
    next();
  });

  // 2. A user connected
  io.on('connection', async (socket) => {
    const user = socket.data.user;
    const isStaff = user.role === ROLES.STAFF;

    // Join this user's own room and their role's room
    socket.join(`user:${user.id}`);
    socket.join(isStaff ? 'staff' : 'patients');

    // If this is the user's first open tab, they just came online
    if ((await countConnectionsInRoom(`user:${user.id}`)) === 1) {
      await announcePresence(user, true);
    }

    // Tell the new connection who is online right now, so it starts correct.
    // Staff get the list of online patients; patients only learn whether the pharmacy is online.
    let presence;
    if (isStaff) {
      presence = { patients: await getOnlinePatientIds() };
    } else {
      presence = { pharmacyOnline: (await countConnectionsInRoom('staff')) > 0 };
    }
    socket.emit('ready', { user, presence });

    // 3. The user sends a text message
    socket.on('message', async (data, reply) => {
      try {
        const result = await sendTextMessage(Number(data.sessionId), user, data.content);
        publishMessage(result);
        if (typeof reply === 'function') {
          reply({ ok: true, message: result.message });
        }
      } catch (error) {
        if (typeof reply === 'function') {
          reply({ ok: false, error: error.message, code: error.code, params: error.params });
        }
      }
    });

    // 4. The connection closed: if that was the user's last tab, they went offline
    socket.on('disconnect', async () => {
      if ((await countConnectionsInRoom(`user:${user.id}`)) === 0) {
        await announcePresence(user, false);
      }
    });
  });
}
