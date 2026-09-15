/**
 * MySQL connection pool (mysql2/promise). All models use `pool.execute`, which
 * sends parameterized (prepared) statements - user input is never concatenated
 * into SQL strings (NFR 2.1).
 */
const mysql = require('mysql2/promise');
const env = require('./env');

const pool = mysql.createPool({
  host: env.db.host,
  port: env.db.port,
  user: env.db.user,
  password: env.db.password,
  database: env.db.database,
  waitForConnections: true,
  connectionLimit: 20, // comfortably serves 50 concurrent users (NFR 4.1)
  queueLimit: 0,
  dateStrings: true, // return DATE/DATETIME as strings, avoiding timezone shifts
});

module.exports = pool;
