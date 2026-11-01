// Creates the database and every table from schema.sql, then lists the tables so you can
// check them.   npm run db:migrate
//
// schema.sql only uses CREATE ... IF NOT EXISTS, so running this again is safe: tables that
// already exist are left as they are. After a change to the tables themselves, rebuild the
// database with npm run db:reset (which deletes all its data).
import fs from 'node:fs';
import path from 'node:path';
import mysql from 'mysql2/promise';
import { config } from '../config.js';

// Read schema.sql, using the database name from .env instead of the default "pharmacy_ims"
const schemaPath = path.join(import.meta.dirname, 'schema.sql');
const sql = fs.readFileSync(schemaPath, 'utf8').replace(/pharmacy_ims/g, config.database.name);

// Connect without choosing a database: schema.sql creates it first
const connection = await mysql.createConnection({
  host: config.database.host,
  port: config.database.port,
  user: config.database.user,
  password: config.database.password,
  multipleStatements: true, // schema.sql contains many statements
});

try {
  await connection.query(sql);

  // Print the tables that now exist
  const [tables] = await connection.query(
    'SELECT TABLE_NAME AS name FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? ORDER BY TABLE_NAME',
    [config.database.name]
  );
  console.log(`Database "${config.database.name}" is ready. Tables:`);
  for (const table of tables) {
    console.log(`  - ${table.name}`);
  }
} catch (error) {
  console.error('Migration failed:', error.message);
  process.exitCode = 1;
} finally {
  await connection.end();
}
