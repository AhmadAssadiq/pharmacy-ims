/**
 * Password reset tokens (GP2 addition). Pure helpers, unit tested.
 *
 * The token is 32 random bytes sent to the user as hex. Only its SHA-256 hash
 * is stored: the token is already unguessable, so a fast hash is enough to make
 * a copy of the table useless for resetting anyone's password.
 */
const crypto = require('node:crypto');

const TOKEN_BYTES = 32;

function hashToken(token) {
  return crypto.createHash('sha256').update(String(token), 'utf8').digest('hex');
}

/** Returns { token, hash }: the token goes in the link, the hash in the database. */
function generateToken() {
  const token = crypto.randomBytes(TOKEN_BYTES).toString('hex');
  return { token, hash: hashToken(token) };
}

/**
 * Where a stored token stands: 'missing', 'used', 'expired' or 'valid'.
 * `row` carries `expires_ms` (epoch milliseconds, from UNIX_TIMESTAMP in SQL,
 * so no timezone guessing) and `used_at`.
 */
function tokenState(row, now = Date.now()) {
  if (!row) return 'missing';
  if (row.used_at) return 'used';
  if (Number(row.expires_ms) <= now) return 'expired';
  return 'valid';
}

module.exports = { generateToken, hashToken, tokenState, TOKEN_BYTES };
