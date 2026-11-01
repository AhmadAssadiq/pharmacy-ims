// DELETES the whole database, so it can be rebuilt from scratch.
// Use it through   npm run db:reset   which runs: this file -> migrate -> seed.
// Every row (accounts, stock, sales, chats...) is removed.
import mysql from 'mysql2/promise';
import { config } from '../config.js';

const connection = await mysql.createConnection({
  host: config.database.host,
  port: config.database.port,
  user: config.database.user,
  password: config.database.password,
});

try {
  // The name comes from .env (not from a user). Table and database names cannot be passed
  // as ? parameters, so it is written into the SQL between back-quotes.
  await connection.query(`DROP DATABASE IF EXISTS \`${config.database.name}\``);
  console.log(`Dropped database "${config.database.name}". Run the migration to recreate it.`);
} catch (error) {
  console.error('Reset failed:', error.message);
  process.exitCode = 1;
} finally {
  await connection.end();
}
