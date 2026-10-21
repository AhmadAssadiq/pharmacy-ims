/**
 * Data access for the `password_resets` table (GP2 addition). Only token
 * hashes are stored. Expiry is computed and read in SQL time (NOW(),
 * UNIX_TIMESTAMP), so the Node process and MySQL never disagree on timezones.
 */
const pool = require('../config/db');

async function create({ userId, tokenHash, minutes }, conn = pool) {
  await conn.execute(
    'INSERT INTO password_resets (user_id, token_hash, expires_at) VALUES (?, ?, DATE_ADD(NOW(), INTERVAL ? MINUTE))',
    [userId, tokenHash, minutes]
  );
}

/** Retires every unused token a user holds, so only the newest link works. */
async function invalidateUnusedForUser(userId, conn = pool) {
  await conn.execute('UPDATE password_resets SET used_at = NOW() WHERE user_id = ? AND used_at IS NULL', [userId]);
}

/** The token row, locked for the reset. Must be called inside a transaction. */
async function findByHashForUpdate(tokenHash, conn) {
  const [rows] = await conn.execute(
    `SELECT id, user_id, used_at, UNIX_TIMESTAMP(expires_at) * 1000 AS expires_ms
     FROM password_resets WHERE token_hash = ? FOR UPDATE`,
    [tokenHash]
  );
  return rows[0] || null;
}

module.exports = { create, invalidateUnusedForUser, findByHashForUpdate };
