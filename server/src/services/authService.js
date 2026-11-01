// Accounts: register, log in, change phone number, delete your own account (FR 1, NFR 2.1, NFR 2.3).
//
// - Registering always creates a patient. Staff accounts are made by the administrator (db/seed.js).
// - Passwords are never stored as typed: bcrypt turns them into a "hash" that cannot be reversed.
// - 5 wrong passwords in a row lock the account for 15 minutes (services/loginLockout.js).
import bcrypt from 'bcryptjs';
import createError from 'http-errors';
import { db, runInTransaction } from '../db.js';
import { ROLES, ERROR_CODES } from '../constants.js';
import { createLoginToken } from '../middleware/auth.js';
import { getMinutesLocked, recordFailedLogin, clearFailedLogins } from './loginLockout.js';
import { deleteStoredImage } from './chatService.js';

// How much work bcrypt does per password: higher is slower to crack (and slower to check)
export const BCRYPT_ROUNDS = 10;

// ----------------------------------------------------------------------------
// Database helpers
// ----------------------------------------------------------------------------

// Finds a user by email, including the password hash (needed to check a password).
export async function findUserByEmail(email) {
  const [rows] = await db.query(
    'SELECT id, name, email, phone, password_hash, role FROM users WHERE email = ?',
    [email]
  );
  return rows[0] || null;
}

// Finds a user by id, without the password hash.
export async function findUserById(id) {
  const [rows] = await db.query('SELECT id, name, email, phone, role FROM users WHERE id = ?', [id]);
  return rows[0] || null;
}

// The user details that are safe to send to the browser (never the password hash).
function toPublicUser(user) {
  return { id: user.id, name: user.name, email: user.email, phone: user.phone ?? null, role: user.role };
}

// ----------------------------------------------------------------------------
// Password check with lockout (shared by login and delete account)
// ----------------------------------------------------------------------------

// Checks `password` against the account with this `email`.
// Returns the user when it is correct. Otherwise throws:
//   423 AUTH_LOCKED             - the account is already locked
//   423 AUTH_TOO_MANY_ATTEMPTS  - this wrong password was the 5th in a row
//   401 AUTH_INVALID_CREDENTIALS - wrong password; the message says how many tries are left
// `wrongPasswordText` is the start of that 401 message ("Invalid email or password.").
async function checkPasswordWithLockout(email, password, wrongPasswordText) {
  // 1. Refuse straight away while the account is locked
  const minutesLocked = getMinutesLocked(email);
  if (minutesLocked > 0) {
    throw createError(423, `Account temporarily locked. Try again in ${minutesLocked} minute(s).`, {
      code: ERROR_CODES.AUTH_LOCKED,
      params: { count: minutesLocked },
    });
  }

  // 2. Compare the password with the stored hash
  const user = await findUserByEmail(email);
  let passwordMatches = false;
  if (user) {
    passwordMatches = await bcrypt.compare(password, user.password_hash);
  }

  // 3. Wrong password (or no such account): count it and say how many tries are left
  if (!passwordMatches) {
    const { isNowLocked, attemptsLeft } = recordFailedLogin(email);
    if (isNowLocked) {
      throw createError(423, 'Too many failed attempts. Account temporarily locked.', {
        code: ERROR_CODES.AUTH_TOO_MANY_ATTEMPTS,
      });
    }
    throw createError(401, `${wrongPasswordText} ${attemptsLeft} attempt(s) remaining.`, {
      code: ERROR_CODES.AUTH_INVALID_CREDENTIALS,
      params: { count: attemptsLeft },
    });
  }

  // 4. Correct: forget earlier wrong attempts
  clearFailedLogins(email);
  return user;
}

// ----------------------------------------------------------------------------
// The actions behind the /api/auth routes
// ----------------------------------------------------------------------------

// Creates a patient account and logs it in. `input` is already validated (registerSchema).
// Returns { user, token }.
export async function register(input) {
  // Each email can only have one account
  const existingUser = await findUserByEmail(input.email);
  if (existingUser) {
    throw createError(409, 'An account with this email already exists', { code: ERROR_CODES.AUTH_EMAIL_TAKEN });
  }

  const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);
  const [result] = await db.query(
    'INSERT INTO users (name, email, phone, password_hash, role) VALUES (?, ?, ?, ?, ?)',
    [input.name, input.email, input.phone, passwordHash, ROLES.PATIENT]
  );

  const user = await findUserById(result.insertId);
  clearFailedLogins(input.email);
  return { user: toPublicUser(user), token: createLoginToken(user) };
}

// Logs a user in. `input` is already validated (loginSchema). Returns { user, token }.
export async function login(input) {
  const user = await checkPasswordWithLockout(input.email, input.password, 'Invalid email or password.');
  return { user: toPublicUser(user), token: createLoginToken(user) };
}

// Adds or changes the logged-in user's phone number. Returns the updated user.
export async function updatePhone(user, input) {
  await db.query('UPDATE users SET phone = ? WHERE id = ?', [input.phone, user.id]);
  return toPublicUser(await findUserById(user.id));
}

// Only patients may delete their own account. Staff accounts are made by the administrator,
// and a staff member deleting themselves could leave nobody able to run the pharmacy.
export function canDeleteOwnAccount(role) {
  return role === ROLES.PATIENT;
}

// A patient deletes their own account after typing their password again (GP2 addition).
// `password` is already validated (deleteAccountSchema).
//
// Deleting the user row also deletes, through the database's foreign keys (ON DELETE CASCADE):
// their chat session and every message in it, their preorders and their password reset tokens.
// sales_history is not linked to users, so dispensing records and the forecast are unchanged.
// Their chat images are then removed from the disk.
export async function deleteOwnAccount(user, password) {
  // 1. Staff cannot delete themselves here
  if (!canDeleteOwnAccount(user.role)) {
    throw createError(403, 'Staff accounts cannot be deleted here', { code: ERROR_CODES.ACCOUNT_DELETE_FORBIDDEN });
  }

  // 2. Check the password (a wrong one counts towards the lockout, like a wrong login)
  const account = await checkPasswordWithLockout(user.email, password, 'Invalid password.');

  // 3. Note which image files belong to their chat, before the rows that point to them are gone
  const [imageRows] = await db.query(
    `SELECT m.attachment_path FROM chat_messages m
     JOIN chat_sessions s ON s.id = m.chat_session_id
     WHERE s.patient_id = ? AND m.attachment_path IS NOT NULL`,
    [account.id]
  );

  // 4. Delete the account (the database removes everything linked to it)
  await runInTransaction(async (connection) => {
    await connection.query('DELETE FROM users WHERE id = ?', [account.id]);
  });

  // 5. Remove their images from the disk. A file that cannot be removed is only logged:
  //    it is never a reason to keep the account.
  for (const row of imageRows) {
    try {
      await deleteStoredImage(row.attachment_path);
    } catch (error) {
      console.error(`Could not remove chat image ${row.attachment_path}:`, error.message);
    }
  }
}
