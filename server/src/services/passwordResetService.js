/**
 * Forgot / reset password (GP2 addition).
 *
 * - Asking for a link always answers the same way, whether or not the email
 *   has an account, and the token work runs after the response is decided, so
 *   neither the body nor the response time reveals which emails are registered.
 * - A link carries a 32-byte random token; only its SHA-256 is stored. It is
 *   valid for PASSWORD_RESET_MINUTES, works once, and a newer link retires it.
 * - Resetting applies the registration password rules, hashes with the same
 *   bcrypt cost, clears the login lockout for that account, and does not sign
 *   the user in: they go back to the login page.
 * - Both endpoints are rate limited per IP, and asking for a link per email too.
 *
 * There is no mail service. With AUTH_RESET_DEBUG=true outside production the
 * link is printed to the server console; otherwise nobody receives it.
 */
const bcrypt = require('bcryptjs');
const pool = require('../config/db');
const env = require('../config/env');
const userModel = require('../models/userModel');
const passwordResetModel = require('../models/passwordResetModel');
const { BCRYPT_ROUNDS } = require('./authService');
const { defaultTracker } = require('./loginAttemptService');
const { createRateLimiter } = require('./rateLimitService');
const { generateToken, hashToken, tokenState } = require('../utils/resetToken');
const { validateForgotPassword, validateResetPassword } = require('../validation/authValidation');
const HttpError = require('../utils/httpError');
const { ERROR_CODES, PASSWORD_RESET_MINUTES } = require('../../../shared/constants.json');

const WINDOW_MINUTES = 15;
const WINDOW_MS = WINDOW_MINUTES * 60 * 1000;
const limiters = {
  forgotByIp: createRateLimiter({ limit: 10, windowMs: WINDOW_MS }),
  forgotByEmail: createRateLimiter({ limit: 3, windowMs: WINDOW_MS }),
  resetByIp: createRateLimiter({ limit: 10, windowMs: WINDOW_MS }),
};

function limit(limiter, key) {
  const { allowed, retryAfterMs } = limiter.hit(key);
  if (!allowed) {
    const minutes = Math.ceil(retryAfterMs / 60000);
    throw new HttpError(429, `Too many requests. Try again in ${minutes} minute(s).`, undefined, {
      code: ERROR_CODES.RATE_LIMITED,
      params: { count: minutes },
    });
  }
}

const invalidLink = () =>
  new HttpError(400, 'This reset link is invalid or has expired', undefined, { code: ERROR_CODES.RESET_TOKEN_INVALID });

/** Issues a token for `email` if it has an account. Runs after the response is decided. */
async function issueResetToken(email) {
  const user = await userModel.findByEmail(email);
  if (!user) return;

  const { token, hash } = generateToken();
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await passwordResetModel.invalidateUnusedForUser(user.id, conn);
    await passwordResetModel.create({ userId: user.id, tokenHash: hash, minutes: PASSWORD_RESET_MINUTES }, conn);
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }

  const link = `${env.clientOrigin}/reset-password?token=${token}`;
  // TODO(production): send `link` to `email` through an SMTP server or a mail
  // provider's API. Until then a real user never receives it.
  if (env.authResetDebug && env.nodeEnv !== 'production') {
    console.log(`[password reset] link for ${email} (valid ${PASSWORD_RESET_MINUTES} min): ${link}`);
  }
}

async function requestPasswordReset(body, { ip } = {}) {
  const { valid, errors, value } = validateForgotPassword(body);
  if (!valid) throw new HttpError(400, 'Validation failed', errors, { code: ERROR_CODES.VALIDATION_FAILED });

  limit(limiters.forgotByIp, `ip:${ip}`);
  limit(limiters.forgotByEmail, `email:${value.email}`);

  // Not awaited: an existing account must not answer more slowly than an unknown one.
  issueResetToken(value.email).catch((err) => console.error('Password reset token could not be issued:', err));

  return { message: 'If an account exists for that email, a reset link has been sent.' };
}

async function resetPassword(body, { ip, tracker = defaultTracker } = {}) {
  limit(limiters.resetByIp, `ip:${ip}`);

  const { valid, errors, value } = validateResetPassword(body);
  if (errors.token) throw invalidLink();
  if (!valid) throw new HttpError(400, 'Validation failed', errors, { code: ERROR_CODES.VALIDATION_FAILED });

  const conn = await pool.getConnection();
  let userId;
  try {
    await conn.beginTransaction();
    const row = await passwordResetModel.findByHashForUpdate(hashToken(value.token), conn);
    if (tokenState(row) !== 'valid') throw invalidLink();

    userId = row.user_id;
    const passwordHash = await bcrypt.hash(value.password, BCRYPT_ROUNDS);
    await userModel.updatePasswordHash(userId, passwordHash, conn);
    // Uses this token and retires any other unused one the user holds.
    await passwordResetModel.invalidateUnusedForUser(userId, conn);
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }

  const user = await userModel.findById(userId);
  if (user) tracker.reset(user.email);
  return { message: 'Password updated. Sign in with your new password.' };
}

module.exports = { requestPasswordReset, resetPassword, issueResetToken };
