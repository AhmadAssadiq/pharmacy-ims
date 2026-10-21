/**
 * Who is connected to the chat hub right now (GP2 addition). Pure bookkeeping
 * with no WebSocket dependency, so it is unit tested; chatHub.js does the I/O.
 *
 * A user is online while they have at least one open socket (several tabs
 * count once). connect() and disconnect() report the edges - first socket in,
 * last socket out - which are the only moments a presence change is
 * broadcast, and also the pharmacy's own edges: the first staff member
 * arriving and the last one leaving, which is all a patient is told.
 * Presence lives in memory only: it is not written to the database and
 * resets when the server restarts, so there is no "last seen".
 */
const { ROLES } = require('../../../shared/constants.json');

function createPresence() {
  const socketsByUser = new Map(); // userId -> Set<socket>
  const roleByUser = new Map(); // userId -> role, while online

  /**
   * Returns { cameOnline, pharmacyCameOnline }: the user's first open socket,
   * and whether that made them the only staff member online.
   */
  function connect(user, socket) {
    let set = socketsByUser.get(user.id);
    const cameOnline = !set;
    if (!set) {
      set = new Set();
      socketsByUser.set(user.id, set);
      roleByUser.set(user.id, user.role);
    }
    set.add(socket);
    const pharmacyCameOnline = cameOnline && user.role === ROLES.STAFF && staffOnlineCount() === 1;
    return { cameOnline, pharmacyCameOnline };
  }

  /**
   * Returns { wentOffline, pharmacyWentOffline }: this closed the user's last
   * socket, and that left no staff member online. Safe to call twice.
   */
  function disconnect(user, socket) {
    const none = { wentOffline: false, pharmacyWentOffline: false };
    const set = socketsByUser.get(user.id);
    if (!set || !set.delete(socket)) return none;
    if (set.size > 0) return none;
    socketsByUser.delete(user.id);
    roleByUser.delete(user.id);
    return { wentOffline: true, pharmacyWentOffline: user.role === ROLES.STAFF && staffOnlineCount() === 0 };
  }

  const isOnline = (userId) => socketsByUser.has(userId);
  const onlineUserIds = () => [...socketsByUser.keys()];
  const onlineIdsByRole = (role) => onlineUserIds().filter((id) => roleByUser.get(id) === role);
  const staffOnlineCount = () => onlineIdsByRole(ROLES.STAFF).length;
  const socketsOf = (userId) => [...(socketsByUser.get(userId) || [])];
  const allSockets = () => [...socketsByUser.values()].flatMap((set) => [...set]);

  return { connect, disconnect, isOnline, onlineUserIds, onlineIdsByRole, staffOnlineCount, socketsOf, allSockets };
}

/** The process-wide instance used by the hub and by chatService. */
const presence = createPresence();

module.exports = { createPresence, presence };
