/**
 * Drops the database so db:migrate can rebuild it from the current schema.
 *
 * migrate.js only issues CREATE TABLE IF NOT EXISTS, so it cannot apply schema
 * changes to tables that already exist - a schema change needs a clean rebuild.
 *
 * DESTRUCTIVE: every row is removed. Run via `npm run db:reset`, which chains
 * drop -> migrate -> seed.
 */
const mysql = require('mysql2/promise');
const env = require('../config/env');

async function reset() {
  const connection = await mysql.createConnection({
    host: env.db.host,
    port: env.db.port,
    user: env.db.user,
    password: env.db.password,
  });

  try {
    // The name comes from configuration, not from user input; back-quoted
    // because identifiers cannot be passed as query parameters.
    await connection.query(`DROP DATABASE IF EXISTS \`${env.db.database}\``);
    console.log(`Dropped database "${env.db.database}". Run the migration to recreate it.`);
  } finally {
    await connection.end();
  }
}

reset().catch((err) => {
  console.error('Reset failed:', err.message);
  process.exit(1);
});
