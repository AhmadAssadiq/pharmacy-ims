/**
 * In-place upgrades for databases created by an older schema.sql.
 *
 * schema.sql only issues CREATE TABLE IF NOT EXISTS, so a change to a table
 * that already exists never reaches an existing install. Each step here checks
 * whether it has already been applied, so db:migrate can run any number of
 * times. A fresh database gets the final shape from schema.sql and every step
 * finds nothing to do.
 */

/**
 * Pure: given every chat session, decides how to fold each patient's
 * duplicates into one. The earliest session (lowest id) survives; it takes the
 * first assigned staff member if it had none. Returns one entry per patient
 * that has more than one session.
 */
function planSessionMerges(sessions) {
  const byPatient = new Map();
  for (const session of [...sessions].sort((a, b) => a.id - b.id)) {
    if (!byPatient.has(session.patient_id)) byPatient.set(session.patient_id, []);
    byPatient.get(session.patient_id).push(session);
  }

  const merges = [];
  for (const [patientId, list] of byPatient) {
    if (list.length < 2) continue;
    const [keep, ...rest] = list;
    const staffId = keep.staff_id ?? rest.find((s) => s.staff_id != null)?.staff_id ?? null;
    merges.push({ patientId, keepId: keep.id, removeIds: rest.map((s) => s.id), staffId });
  }
  return merges;
}

async function indexExists(conn, database, table, index) {
  const [rows] = await conn.query(
    'SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND INDEX_NAME = ? LIMIT 1',
    [database, table, index]
  );
  return rows.length > 0;
}

/**
 * One chat session per patient (FR 5). Two "open my session" requests racing
 * each other (React StrictMode, a double click, two tabs) used to insert two
 * sessions. Merges any duplicates already stored, moving their messages into
 * the surviving session, then adds the unique key that stops it recurring.
 * Returns the number of patients whose sessions were merged.
 */
async function ensureOneSessionPerPatient(conn, database) {
  if (await indexExists(conn, database, 'chat_sessions', 'uq_chat_sessions_patient')) return 0;

  const [sessions] = await conn.query(`SELECT id, patient_id, staff_id FROM \`${database}\`.chat_sessions`);
  const merges = planSessionMerges(sessions);

  await conn.beginTransaction();
  try {
    for (const { keepId, removeIds, staffId } of merges) {
      await conn.query(`UPDATE \`${database}\`.chat_messages SET chat_session_id = ? WHERE chat_session_id IN (?)`, [keepId, removeIds]);
      await conn.query(`UPDATE \`${database}\`.chat_sessions SET staff_id = ? WHERE id = ?`, [staffId, keepId]);
      await conn.query(`DELETE FROM \`${database}\`.chat_sessions WHERE id IN (?)`, [removeIds]);
    }
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  }

  // DDL commits implicitly, so it runs only once the data is clean. The unique
  // key also serves the patient foreign key, so the old plain index goes.
  await conn.query(`ALTER TABLE \`${database}\`.chat_sessions ADD UNIQUE KEY uq_chat_sessions_patient (patient_id)`);
  if (await indexExists(conn, database, 'chat_sessions', 'idx_chat_sessions_patient')) {
    await conn.query(`ALTER TABLE \`${database}\`.chat_sessions DROP INDEX idx_chat_sessions_patient`);
  }
  return merges.length;
}

async function columnExists(conn, database, table, column) {
  const [rows] = await conn.query(
    'SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ? LIMIT 1',
    [database, table, column]
  );
  return rows.length > 0;
}

/** Adds a column if it is missing. `definition` is trusted SQL from this file. */
async function ensureColumn(conn, database, table, column, definition) {
  if (await columnExists(conn, database, table, column)) return false;
  await conn.query(`ALTER TABLE \`${database}\`.\`${table}\` ADD COLUMN \`${column}\` ${definition}`);
  return true;
}

/** Image attachments on chat messages (GP2 addition); see schema.sql. */
async function ensureChatAttachmentColumns(conn, database) {
  const columns = [
    ['attachment_path', 'VARCHAR(64) NULL AFTER content'],
    ['attachment_mime', 'VARCHAR(20) NULL AFTER attachment_path'],
    ['attachment_size', 'INT UNSIGNED NULL AFTER attachment_mime'],
    ['attachment_name', 'VARCHAR(120) NULL AFTER attachment_size'],
  ];
  const added = [];
  for (const [column, definition] of columns) {
    if (await ensureColumn(conn, database, 'chat_messages', column, definition)) added.push(column);
  }
  // Downloads look a message up by its file key.
  if (!(await indexExists(conn, database, 'chat_messages', 'uq_chat_messages_attachment'))) {
    await conn.query(`ALTER TABLE \`${database}\`.chat_messages ADD UNIQUE KEY uq_chat_messages_attachment (attachment_path)`);
    added.push('uq_chat_messages_attachment');
  }
  return added;
}

/** Patients' phone numbers (GP2 addition); see schema.sql. */
async function ensureUserPhoneColumn(conn, database) {
  return ensureColumn(conn, database, 'users', 'phone', 'VARCHAR(20) NULL AFTER email');
}

/**
 * Runs every upgrade step in order. The database name comes from
 * configuration, not user input; it is back-quoted because identifiers cannot
 * be passed as query parameters.
 */
async function runUpgrades(conn, database) {
  const merged = await ensureOneSessionPerPatient(conn, database);
  if (merged > 0) console.log(`Merged duplicate chat sessions for ${merged} patient(s).`);
  const added = await ensureChatAttachmentColumns(conn, database);
  if (added.length > 0) console.log(`Added chat_messages columns: ${added.join(', ')}.`);
  if (await ensureUserPhoneColumn(conn, database)) console.log('Added users.phone.');
}

module.exports = { runUpgrades, planSessionMerges };
