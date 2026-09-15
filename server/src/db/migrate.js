/**
 * Creates the database and all six tables from schema.sql, then prints the
 * resulting table list so the schema can be verified.
 *
 * Usage: npm run db:migrate   (from /server or the repo root)
 */
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const env = require('../config/env');

async function migrate() {
  const schemaPath = path.join(__dirname, 'schema.sql');
  const sql = fs
    .readFileSync(schemaPath, 'utf8')
    .replace(/pharmacy_ims/g, env.db.database);

  // Connect without selecting a database: the script creates it itself.
  const connection = await mysql.createConnection({
    host: env.db.host,
    port: env.db.port,
    user: env.db.user,
    password: env.db.password,
    multipleStatements: true,
  });

  try {
    await connection.query(sql);
    const [tables] = await connection.query(
      'SELECT TABLE_NAME AS name FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? ORDER BY TABLE_NAME',
      [env.db.database]
    );
    console.log(`Database "${env.db.database}" is ready. Tables:`);
    for (const { name } of tables) console.log(`  - ${name}`);
  } finally {
    await connection.end();
  }
}

migrate().catch((err) => {
  console.error('Migration failed:', err.message);
  process.exit(1);
});
