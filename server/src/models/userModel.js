/**
 * Data access for the `users` table.
 */
const pool = require('../config/db');

const PUBLIC_COLUMNS = 'id, name, email, role';

async function findByEmail(email) {
  const [rows] = await pool.execute(
    'SELECT id, name, email, password_hash, role FROM users WHERE email = ?',
    [email]
  );
  return rows[0] || null;
}

async function findById(id) {
  const [rows] = await pool.execute(`SELECT ${PUBLIC_COLUMNS} FROM users WHERE id = ?`, [id]);
  return rows[0] || null;
}

async function create({ name, email, passwordHash, role }) {
  const [result] = await pool.execute(
    'INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)',
    [name, email, passwordHash, role]
  );
  return findById(result.insertId);
}

/** Replaces the stored bcrypt hash (password reset). */
async function updatePasswordHash(id, passwordHash, conn = pool) {
  await conn.execute('UPDATE users SET password_hash = ? WHERE id = ?', [passwordHash, id]);
}

/** Deletes a user; the foreign keys remove what belongs to them (see schema.sql). */
async function remove(id, conn = pool) {
  const [result] = await conn.execute('DELETE FROM users WHERE id = ?', [id]);
  return result.affectedRows > 0;
}

module.exports = { findByEmail, findById, create, updatePasswordHash, remove };
