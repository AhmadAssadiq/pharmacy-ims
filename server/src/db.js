// The MySQL connection pool that every service uses to run SQL.
//
// Usage in a service:
//   const [rows] = await db.query('SELECT * FROM medications WHERE id = ?', [id]);
// The ? placeholders are filled in safely by mysql2, so user input is never pasted
// into the SQL text (this protects against SQL injection - NFR 2.1).
import mysql from 'mysql2/promise';
import { config } from './config.js';

export const db = mysql.createPool({
  host: config.database.host,
  port: config.database.port,
  user: config.database.user,
  password: config.database.password,
  database: config.database.name,
  connectionLimit: 20, // enough for 50 users at the same time (NFR 4.1)
  dateStrings: true, // give DATE columns back as text like '2026-11-01' (no timezone surprises)
});

// Runs several SQL statements as one transaction: either all of them are saved, or none.
// `work` is a function that receives a connection and runs its queries on it.
// Example:
//   await runInTransaction(async (connection) => {
//     await connection.query('UPDATE ...');
//     await connection.query('INSERT ...');
//   });
// If anything inside throws an error, every change is undone (rollback).
export async function runInTransaction(work) {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const result = await work(connection);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    // Give the connection back to the pool so it can be reused
    connection.release();
  }
}
