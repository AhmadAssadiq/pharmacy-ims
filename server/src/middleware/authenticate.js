/**
 * Verifies the `Authorization: Bearer <jwt>` header and attaches the decoded
 * user ({ id, name, email, role }) to `req.user`. Every protected route uses
 * this (FR 1).
 */
const { verifyToken } = require('../services/tokenService');
const HttpError = require('../utils/httpError');

function authenticate(req, res, next) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');

  if (scheme !== 'Bearer' || !token) {
    return next(new HttpError(401, 'Authentication required'));
  }

  try {
    req.user = verifyToken(token);
    return next();
  } catch (err) {
    return next(new HttpError(401, 'Invalid or expired token'));
  }
}

module.exports = authenticate;
