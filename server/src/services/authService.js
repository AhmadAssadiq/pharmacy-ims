/**
 * Registration and login (FR 1, NFR 2.1, NFR 2.3).
 *
 * - Public registration always creates a `patient` account; staff accounts are
 *   created by the administrator (see src/db/seed.js).
 * - Passwords are hashed with bcrypt before being stored.
 * - After 5 failed logins the account is temporarily locked.
 * - A patient can delete their own account (GP2 addition): see deleteOwnAccount.
 */
const bcrypt = require('bcryptjs');
const pool = require('../config/db');
const userModel = require('../models/userModel');
const chatMessageModel = require('../models/chatMessageModel');
const uploadStore = require('../utils/uploadStore');
const { signToken } = require('./tokenService');
const { defaultTracker } = require('./loginAttemptService');
const {
  validateRegister,
  validateLogin,
  validateDeleteAccount,
  validatePhoneUpdate,
  canSelfDelete,
} = require('../validation/authValidation');
const HttpError = require('../utils/httpError');
const { ROLES, ERROR_CODES } = require('../../../shared/constants.json');

const BCRYPT_ROUNDS = 10;

function toPublicUser(user) {
  return { id: user.id, name: user.name, email: user.email, phone: user.phone ?? null, role: user.role };
}

async function register(body, { tracker = defaultTracker } = {}) {
  const { valid, errors, value } = validateRegister(body);
  if (!valid) throw new HttpError(400, 'Validation failed', errors, { code: ERROR_CODES.VALIDATION_FAILED });

  const existing = await userModel.findByEmail(value.email);
  if (existing) {
    throw new HttpError(409, 'An account with this email already exists', undefined, {
      code: ERROR_CODES.AUTH_EMAIL_TAKEN,
    });
  }

  const passwordHash = await bcrypt.hash(value.password, BCRYPT_ROUNDS);
  const user = await userModel.create({
    name: value.name,
    email: value.email,
    phone: value.phone,
    passwordHash,
    role: ROLES.PATIENT,
  });

  tracker.reset(value.email);
  return { user: toPublicUser(user), token: signToken(user) };
}

async function login(body, { tracker = defaultTracker } = {}) {
  const { valid, errors, value } = validateLogin(body);
  if (!valid) throw new HttpError(400, 'Validation failed', errors, { code: ERROR_CODES.VALIDATION_FAILED });

  const lockedMs = tracker.lockedFor(value.email);
  if (lockedMs > 0) {
    const minutes = Math.ceil(lockedMs / 60000);
    throw new HttpError(423, `Account temporarily locked. Try again in ${minutes} minute(s).`, undefined, {
      code: ERROR_CODES.AUTH_LOCKED,
      params: { count: minutes },
    });
  }

  const user = await userModel.findByEmail(value.email);
  const passwordMatches = user ? await bcrypt.compare(value.password, user.password_hash) : false;

  if (!user || !passwordMatches) {
    const { locked, remainingAttempts } = tracker.recordFailure(value.email);
    if (locked) {
      throw new HttpError(423, 'Too many failed attempts. Account temporarily locked.', undefined, {
        code: ERROR_CODES.AUTH_TOO_MANY_ATTEMPTS,
      });
    }
    throw new HttpError(401, `Invalid email or password. ${remainingAttempts} attempt(s) remaining.`, undefined, {
      code: ERROR_CODES.AUTH_INVALID_CREDENTIALS,
      params: { count: remainingAttempts },
    });
  }

  tracker.reset(value.email);
  return { user: toPublicUser(user), token: signToken(user) };
}

/**
 * A patient deletes their own account, confirming with their password.
 *
 * - Staff cannot (403): see canSelfDelete.
 * - A wrong password is a failed login: it counts toward the same lockout.
 * - One DELETE in a transaction; the foreign keys do the rest. The patient's
 *   chat session goes (ON DELETE CASCADE) and with it every message in it,
 *   staff replies included - intended: it is the patient's conversation.
 *   Preorders and password reset tokens cascade too. sales_history has no
 *   link to users, so the dispensing record and the forecast are untouched.
 * - Their images are removed from disk only after the commit. A file that
 *   cannot be removed is logged, never a reason to keep the account.
 * The caller closes the user's sockets (controllers/authController.js).
 */
async function deleteOwnAccount(user, body, { tracker = defaultTracker } = {}) {
  if (!canSelfDelete(user.role)) {
    throw new HttpError(403, 'Staff accounts cannot be deleted here', undefined, {
      code: ERROR_CODES.ACCOUNT_DELETE_FORBIDDEN,
    });
  }

  const { valid, errors, value } = validateDeleteAccount(body);
  if (!valid) throw new HttpError(400, 'Validation failed', errors, { code: ERROR_CODES.VALIDATION_FAILED });

  const lockedMs = tracker.lockedFor(user.email);
  if (lockedMs > 0) {
    const minutes = Math.ceil(lockedMs / 60000);
    throw new HttpError(423, `Account temporarily locked. Try again in ${minutes} minute(s).`, undefined, {
      code: ERROR_CODES.AUTH_LOCKED,
      params: { count: minutes },
    });
  }

  const record = await userModel.findByEmail(user.email);
  const passwordMatches = record ? await bcrypt.compare(value.password, record.password_hash) : false;
  if (!record || !passwordMatches) {
    const { locked, remainingAttempts } = tracker.recordFailure(user.email);
    if (locked) {
      throw new HttpError(423, 'Too many failed attempts. Account temporarily locked.', undefined, {
        code: ERROR_CODES.AUTH_TOO_MANY_ATTEMPTS,
      });
    }
    throw new HttpError(401, `Invalid password. ${remainingAttempts} attempt(s) remaining.`, undefined, {
      code: ERROR_CODES.AUTH_INVALID_CREDENTIALS,
      params: { count: remainingAttempts },
    });
  }

  // Read the file keys first: once the rows are gone there is nothing to find them by.
  const files = await chatMessageModel.findAttachmentPathsForPatient(record.id);

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await userModel.remove(record.id, conn);
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }

  for (const key of files) {
    await uploadStore.remove(key).catch((err) => console.error(`Could not remove chat image ${key}:`, err.message));
  }
  tracker.reset(user.email);
  return { removedImages: files.length };
}

/** Adds or changes the signed-in user's phone number (GP2 addition). */
async function updateOwnPhone(user, body) {
  const { valid, errors, value } = validatePhoneUpdate(body);
  if (!valid) throw new HttpError(400, 'Validation failed', errors, { code: ERROR_CODES.VALIDATION_FAILED });
  return toPublicUser(await userModel.updatePhone(user.id, value.phone));
}

module.exports = { register, login, deleteOwnAccount, updateOwnPhone, toPublicUser, BCRYPT_ROUNDS };
