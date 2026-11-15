// The notification bell in the top bar (GP2 addition), and "tell me when it's back".
//
// There is no notifications table. Each notification is COUNTED from data the app already
// has, every time the bell asks, so it can never disagree with the pages it points to:
//   staff:   reorder alerts, conversations with unread patient messages, orders waiting
//   patient: unread messages from the pharmacy, orders ready to collect, orders cancelled
//            because their prescription was rejected, watched medications back in stock
// A notification disappears by itself when its cause is gone (the chat is opened, the
// order is collected, the alert is dismissed...).
import { db } from '../db.js';
import { ROLES } from '../constants.js';

// The "sellable units of medication m" piece of SQL: its lots that have not expired
const SELLABLE_UNITS = `
  COALESCE((SELECT SUM(b.quantity) FROM medication_batches b
            WHERE b.medication_id = m.id AND b.expiry_date >= CURDATE()), 0)`;

// Runs a "SELECT COUNT(*) AS total ..." query and returns the number.
async function countRows(sql, params = []) {
  const [rows] = await db.query(sql, params);
  return Number(rows[0].total);
}

// Turns counts into the list the bell shows. Only kinds with something to show are
// included, in a fixed order. Each item is { type, count, link } (plus `names` for
// medications back in stock); the React app writes the sentence for each type.
// `counts` is { type: number }; `links` is { type: page to open }.
export function buildNotificationItems(counts, links, extra = {}) {
  const items = [];
  for (const type of Object.keys(links)) {
    if (counts[type] > 0) {
      items.push({ type, count: counts[type], link: links[type], ...extra[type] });
    }
  }
  return items;
}

// The pages each staff notification opens
const STAFF_LINKS = {
  reorder_alerts: '/staff/inventory',
  unread_chats: '/staff/chat',
  orders_pending: '/staff/preorders',
};

// The pages each patient notification opens
const PATIENT_LINKS = {
  unread_messages: '/patient/chat',
  orders_ready: '/patient/orders',
  orders_rejected: '/patient/orders',
  back_in_stock: '/patient/availability',
};

// The notifications of a staff member.
async function getStaffNotifications() {
  const counts = {
    // Active reorder alerts (FR 6.2) of medications that are still sold
    reorder_alerts: await countRows(
      `SELECT COUNT(*) AS total FROM reorder_alerts a
       JOIN medications m ON m.id = a.medication_id
       WHERE a.status = 'active' AND m.is_discontinued = 0`
    ),
    // Conversations holding a patient message that arrived after staff last opened them
    unread_chats: await countRows(
      `SELECT COUNT(*) AS total FROM chat_sessions s
       WHERE EXISTS (SELECT 1 FROM chat_messages msg
                     WHERE msg.chat_session_id = s.id AND msg.sender_id = s.patient_id
                       AND (s.staff_read_at IS NULL OR msg.timestamp > s.staff_read_at))`
    ),
    // Orders waiting to be prepared (including those whose prescription must be checked)
    orders_pending: await countRows(`SELECT COUNT(*) AS total FROM preorders WHERE status = 'pending'`),
  };
  return buildNotificationItems(counts, STAFF_LINKS);
}

// The medications a patient asked about ("tell me when it's back") that are in stock again.
// Returns [{ id, name }].
async function findWatchedBackInStock(patientId) {
  const [rows] = await db.query(
    `SELECT m.id, m.name FROM stock_watches w
     JOIN medications m ON m.id = w.medication_id
     WHERE w.patient_id = ? AND m.is_discontinued = 0 AND ${SELLABLE_UNITS} > 0
     ORDER BY m.name`,
    [patientId]
  );
  return rows;
}

// The notifications of a patient.
async function getPatientNotifications(patientId) {
  const backInStock = await findWatchedBackInStock(patientId);
  const counts = {
    // Messages from the pharmacy that arrived after the patient last opened the chat
    unread_messages: await countRows(
      `SELECT COUNT(*) AS total FROM chat_messages msg
       JOIN chat_sessions s ON s.id = msg.chat_session_id
       WHERE s.patient_id = ? AND msg.sender_id <> s.patient_id
         AND (s.patient_read_at IS NULL OR msg.timestamp > s.patient_read_at)`,
      [patientId]
    ),
    // Orders the pharmacy has marked ready: shown until they are collected
    orders_ready: await countRows(`SELECT COUNT(*) AS total FROM preorders WHERE patient_id = ? AND status = 'ready'`, [
      patientId,
    ]),
    // Orders cancelled because the prescription was rejected, since the patient last
    // opened their "My orders" page
    orders_rejected: await countRows(
      `SELECT COUNT(*) AS total FROM preorders p
       JOIN users u ON u.id = p.patient_id
       WHERE p.patient_id = ? AND p.prescription_status = 'rejected'
         AND (u.orders_seen_at IS NULL OR p.updated_at > u.orders_seen_at)`,
      [patientId]
    ),
    back_in_stock: backInStock.length,
  };
  return buildNotificationItems(counts, PATIENT_LINKS, {
    back_in_stock: { names: backInStock.map((medication) => medication.name) },
  });
}

// The notifications of the signed-in user: { items, total }.
// `total` is the number shown on the bell.
export async function getNotifications(user) {
  const items = user.role === ROLES.STAFF ? await getStaffNotifications() : await getPatientNotifications(user.id);
  let total = 0;
  for (const item of items) {
    total += item.count;
  }
  return { items, total };
}

// Records that a patient has just looked at their "My orders" page, so the
// "prescription rejected" notification is not shown again for orders they have seen.
export async function markOrdersSeen(patientId) {
  await db.query('UPDATE users SET orders_seen_at = NOW() WHERE id = ?', [patientId]);
}

// ----------------------------------------------------------------------------
// "Tell me when it's back"
// ----------------------------------------------------------------------------

// The ids of the medications a patient is waiting for.
export async function getWatchedMedicationIds(patientId) {
  const [rows] = await db.query('SELECT medication_id FROM stock_watches WHERE patient_id = ?', [patientId]);
  return rows.map((row) => row.medication_id);
}

// A patient asks to be told when a medication is back. Asking twice changes nothing
// (the unique key makes the second INSERT do nothing).
export async function watchMedication(patientId, medicationId) {
  await db.query(
    `INSERT INTO stock_watches (patient_id, medication_id) VALUES (?, ?)
     ON DUPLICATE KEY UPDATE medication_id = medication_id`,
    [patientId, medicationId]
  );
}

// A patient no longer wants to be told about a medication.
export async function unwatchMedication(patientId, medicationId) {
  await db.query('DELETE FROM stock_watches WHERE patient_id = ? AND medication_id = ?', [patientId, medicationId]);
}

// The patient opened the "back in stock" notification: stop watching the medications
// that are back, so the notification goes away. Those still out of stock are kept.
export async function clearWatchesBackInStock(patientId) {
  const backInStock = await findWatchedBackInStock(patientId);
  for (const medication of backInStock) {
    await unwatchMedication(patientId, medication.id);
  }
}
