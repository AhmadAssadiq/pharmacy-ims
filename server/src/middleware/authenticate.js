/**
 * Verifies the `Authorization: Bearer <jwt>` header and attaches the user
 * ({ id, name, email, role }) to `req.user`. Every protected route uses this
 * (FR 1).
 *
 * A valid signature is not enough: the user must still exist (one primary-key
 * read per request), so a deleted account's token stops working at once
 * instead of lasting until it expires (GP2 addition). `req.user` comes from
 * that row, so a changed name or role is current too.
 */
const { verifyToken } = require('../services/tokenService');
const userModel = require('../models/userModel');
const HttpError = require('../utils/httpError');
const { ERROR_CODES } = require('../../../shared/constants.json');

const invalidToken = () =>
  new HttpError(401, 'Invalid or expired token', undefined, { code: ERROR_CODES.AUTH_INVALID_TOKEN });

function createAuthenticate({ findUser = userModel.findById } = {}) {
  return async function authenticate(req, res, next) {
    const header = req.headers.authorization || '';
    const [scheme, token] = header.split(' ');

    if (scheme !== 'Bearer' || !token) {
      return next(new HttpError(401, 'Authentication required', undefined, { code: ERROR_CODES.AUTH_REQUIRED }));
    }

    let claims;
    try {
      claims = verifyToken(token);
    } catch {
      return next(invalidToken());
    }

    try {
      const user = await findUser(claims.id);
      if (!user) return next(invalidToken());
      req.user = { id: user.id, name: user.name, email: user.email, role: user.role };
      return next();
    } catch (err) {
      return next(err);
    }
  };
}

module.exports = createAuthenticate();
module.exports.createAuthenticate = createAuthenticate;
