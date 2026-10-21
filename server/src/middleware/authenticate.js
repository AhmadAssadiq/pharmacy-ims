/**
 * Verifies the `Authorization: Bearer <jwt>` header and attaches the decoded
 * user ({ id, name, email, role }) to `req.user`. Every protected route uses
 * this (FR 1).
 */
const { verifyToken } = require('../services/tokenService');
const HttpError = require('../utils/httpError');
const { ERROR_CODES } = require('../../../shared/constants.json');

function authenticate(req, res, next) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');

  if (scheme !== 'Bearer' || !token) {
    return next(new HttpError(401, 'Authentication required', undefined, { code: ERROR_CODES.AUTH_REQUIRED }));
  }

  try {
    req.user = verifyToken(token);
    return next();
  } catch (err) {
    return next(new HttpError(401, 'Invalid or expired token', undefined, { code: ERROR_CODES.AUTH_INVALID_TOKEN }));
  }
}

module.exports = authenticate;
