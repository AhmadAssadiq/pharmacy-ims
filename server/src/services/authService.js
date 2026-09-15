/**
 * Registration and login (FR 1, NFR 2.1, NFR 2.3).
 *
 * - Public registration always creates a `patient` account; staff accounts are
 *   created by the administrator (see src/db/seed.js).
 * - Passwords are hashed with bcrypt before being stored.
 * - After 5 failed logins the account is temporarily locked.
 */
const bcrypt = require('bcryptjs');
const userModel = require('../models/userModel');
const { signToken } = require('./tokenService');
const { defaultTracker } = require('./loginAttemptService');
const { validateRegister, validateLogin } = require('../validation/authValidation');
const HttpError = require('../utils/httpError');
const { ROLES } = require('../../../shared/constants.json');

const BCRYPT_ROUNDS = 10;

function toPublicUser(user) {
  return { id: user.id, name: user.name, email: user.email, role: user.role };
}

async function register(body, { tracker = defaultTracker } = {}) {
  const { valid, errors, value } = validateRegister(body);
  if (!valid) throw new HttpError(400, 'Validation failed', errors);

  const existing = await userModel.findByEmail(value.email);
  if (existing) throw new HttpError(409, 'An account with this email already exists');

  const passwordHash = await bcrypt.hash(value.password, BCRYPT_ROUNDS);
  const user = await userModel.create({
    name: value.name,
    email: value.email,
    passwordHash,
    role: ROLES.PATIENT,
  });

  tracker.reset(value.email);
  return { user: toPublicUser(user), token: signToken(user) };
}

async function login(body, { tracker = defaultTracker } = {}) {
  const { valid, errors, value } = validateLogin(body);
  if (!valid) throw new HttpError(400, 'Validation failed', errors);

  const lockedMs = tracker.lockedFor(value.email);
  if (lockedMs > 0) {
    const minutes = Math.ceil(lockedMs / 60000);
    throw new HttpError(423, `Account temporarily locked. Try again in ${minutes} minute(s).`);
  }

  const user = await userModel.findByEmail(value.email);
  const passwordMatches = user ? await bcrypt.compare(value.password, user.password_hash) : false;

  if (!user || !passwordMatches) {
    const { locked, remainingAttempts } = tracker.recordFailure(value.email);
    if (locked) {
      throw new HttpError(423, 'Too many failed attempts. Account temporarily locked.');
    }
    throw new HttpError(401, `Invalid email or password. ${remainingAttempts} attempt(s) remaining.`);
  }

  tracker.reset(value.email);
  return { user: toPublicUser(user), token: signToken(user) };
}

module.exports = { register, login, toPublicUser };
