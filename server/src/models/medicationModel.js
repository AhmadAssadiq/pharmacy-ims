/**
 * Data access for the `medications` table.
 */
const pool = require('../config/db');

const COLUMNS = 'id, name, category, quantity, unit_price, expiry_date, supplier_info';

async function findAll() {
  const [rows] = await pool.execute(`SELECT ${COLUMNS} FROM medications ORDER BY name ASC`);
  return rows;
}

async function findById(id) {
  const [rows] = await pool.execute(`SELECT ${COLUMNS} FROM medications WHERE id = ?`, [id]);
  return rows[0] || null;
}

async function create({ name, category, quantity, unit_price, expiry_date, supplier_info }) {
  const [result] = await pool.execute(
    `INSERT INTO medications (name, category, quantity, unit_price, expiry_date, supplier_info)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [name, category, quantity, unit_price, expiry_date, supplier_info]
  );
  return findById(result.insertId);
}

async function update(id, { name, category, quantity, unit_price, expiry_date, supplier_info }) {
  await pool.execute(
    `UPDATE medications
     SET name = ?, category = ?, quantity = ?, unit_price = ?, expiry_date = ?, supplier_info = ?
     WHERE id = ?`,
    [name, category, quantity, unit_price, expiry_date, supplier_info, id]
  );
  return findById(id);
}

async function remove(id) {
  const [result] = await pool.execute('DELETE FROM medications WHERE id = ?', [id]);
  return result.affectedRows > 0;
}

module.exports = { findAll, findById, create, update, remove };
