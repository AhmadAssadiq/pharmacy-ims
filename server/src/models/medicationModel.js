/**
 * Data access for the `medications` table.
 *
 * Stock lives in `medication_batches`, so reads aggregate the lots back into the
 * `quantity` and `expiry_date` fields the rest of the application already uses:
 *   quantity         - units that can actually be dispensed (unexpired lots)
 *   expired_quantity - units held in expired lots, surfaced so staff can clear them
 *   expiry_date      - the next lot to expire, i.e. what FR 4 should warn about
 */
const pool = require('../config/db');

const CATALOG_COLUMNS = 'm.id, m.name, m.category, m.unit_price, m.supplier_info, m.low_stock_threshold';

const SELECT_WITH_STOCK = `
  SELECT ${CATALOG_COLUMNS},
         COALESCE(SUM(CASE WHEN b.expiry_date >= CURDATE() THEN b.quantity END), 0) AS quantity,
         COALESCE(SUM(CASE WHEN b.expiry_date <  CURDATE() THEN b.quantity END), 0) AS expired_quantity,
         MIN(CASE WHEN b.quantity > 0 AND b.expiry_date >= CURDATE() THEN b.expiry_date END) AS expiry_date
  FROM medications m
  LEFT JOIN medication_batches b ON b.medication_id = m.id
`;

/** MySQL returns SUM() as a string; normalise the aggregates to numbers. */
function normalise(row) {
  if (!row) return null;
  return {
    ...row,
    quantity: Number(row.quantity),
    expired_quantity: Number(row.expired_quantity),
    low_stock_threshold: Number(row.low_stock_threshold),
  };
}

async function findAll(conn = pool) {
  const [rows] = await conn.execute(`${SELECT_WITH_STOCK} GROUP BY m.id ORDER BY m.name ASC`);
  return rows.map(normalise);
}

async function findById(id, conn = pool) {
  const [rows] = await conn.execute(`${SELECT_WITH_STOCK} WHERE m.id = ? GROUP BY m.id`, [id]);
  return normalise(rows[0]);
}

async function create({ name, category, unit_price, supplier_info, low_stock_threshold }, conn = pool) {
  const [result] = await conn.execute(
    `INSERT INTO medications (name, category, unit_price, supplier_info, low_stock_threshold)
     VALUES (?, ?, ?, ?, ?)`,
    [name, category, unit_price, supplier_info, low_stock_threshold]
  );
  return findById(result.insertId, conn);
}

async function update(id, { name, category, unit_price, supplier_info, low_stock_threshold }, conn = pool) {
  await conn.execute(
    `UPDATE medications
     SET name = ?, category = ?, unit_price = ?, supplier_info = ?, low_stock_threshold = ?
     WHERE id = ?`,
    [name, category, unit_price, supplier_info, low_stock_threshold, id]
  );
  return findById(id, conn);
}

async function remove(id, conn = pool) {
  const [result] = await conn.execute('DELETE FROM medications WHERE id = ?', [id]);
  return result.affectedRows > 0;
}

module.exports = { findAll, findById, create, update, remove };
