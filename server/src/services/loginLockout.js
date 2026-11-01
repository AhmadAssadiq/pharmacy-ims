// Locks an account for 15 minutes after 5 wrong passwords in a row (NFR 2.3).
//
// The counts are kept in memory (not in the database), keyed by email address:
//   failedLogins['sara@mail.com'] = { failedCount: 2, lockedUntil: null }
// They reset when the server restarts, which is fine for a lockout.
import { MAX_LOGIN_ATTEMPTS, LOCKOUT_MINUTES } from '../constants.js';

const failedLogins = {};

// How many minutes until the account unlocks (rounded up), or 0 when it is not locked.
export function getMinutesLocked(email) {
  const entry = failedLogins[email];
  if (!entry || !entry.lockedUntil) {
    return 0;
  }

  const millisecondsLeft = entry.lockedUntil - Date.now();
  if (millisecondsLeft <= 0) {
    // The lock has run out: forget the old failures and start fresh
    delete failedLogins[email];
    return 0;
  }
  return Math.ceil(millisecondsLeft / 60000);
}

// Counts one wrong password. Locks the account when this was the 5th in a row.
// Returns { isNowLocked, attemptsLeft }.
export function recordFailedLogin(email) {
  if (!failedLogins[email]) {
    failedLogins[email] = { failedCount: 0, lockedUntil: null };
  }
  const entry = failedLogins[email];
  entry.failedCount += 1;

  if (entry.failedCount >= MAX_LOGIN_ATTEMPTS) {
    entry.lockedUntil = Date.now() + LOCKOUT_MINUTES * 60 * 1000;
  }

  return {
    isNowLocked: entry.lockedUntil !== null,
    attemptsLeft: Math.max(MAX_LOGIN_ATTEMPTS - entry.failedCount, 0),
  };
}

// Forgets the failures for an account (after a correct password or a password reset).
export function clearFailedLogins(email) {
  delete failedLogins[email];
}
