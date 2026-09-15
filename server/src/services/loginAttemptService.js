/**
 * Tracks failed login attempts per account and temporarily locks the account
 * after MAX_LOGIN_ATTEMPTS consecutive failures (NFR 2.3).
 *
 * The state is kept in memory, keyed by the (normalised) email address, so it
 * needs no extra database columns. Locks expire after LOCKOUT_MINUTES.
 */
const { MAX_LOGIN_ATTEMPTS, LOCKOUT_MINUTES } = require('../../../shared/constants.json');

function createLoginAttemptTracker({
  maxAttempts = MAX_LOGIN_ATTEMPTS,
  lockoutMinutes = LOCKOUT_MINUTES,
  now = () => Date.now(),
} = {}) {
  const attempts = new Map(); // email -> { count, lockedUntil }

  /** Returns the remaining lock time in ms, or 0 when the account is not locked. */
  function lockedFor(email) {
    const entry = attempts.get(email);
    if (!entry || !entry.lockedUntil) return 0;
    const remaining = entry.lockedUntil - now();
    if (remaining <= 0) {
      attempts.delete(email); // lock expired - start fresh
      return 0;
    }
    return remaining;
  }

  /** Records a failure. Returns { locked, remainingAttempts }. */
  function recordFailure(email) {
    const entry = attempts.get(email) || { count: 0, lockedUntil: null };
    entry.count += 1;
    if (entry.count >= maxAttempts) {
      entry.lockedUntil = now() + lockoutMinutes * 60 * 1000;
    }
    attempts.set(email, entry);
    return { locked: Boolean(entry.lockedUntil), remainingAttempts: Math.max(maxAttempts - entry.count, 0) };
  }

  function reset(email) {
    attempts.delete(email);
  }

  return { lockedFor, recordFailure, reset };
}

module.exports = { createLoginAttemptTracker, defaultTracker: createLoginAttemptTracker() };
