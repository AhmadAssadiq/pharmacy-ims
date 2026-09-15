/**
 * Role-based access control (FR 2, NFR 2.2). Must run after `authenticate`.
 *
 *   router.get('/staff-only', authenticate, requireRole('staff'), handler)
 */
const HttpError = require('../utils/httpError');

function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) return next(new HttpError(401, 'Authentication required'));
    if (!allowedRoles.includes(req.user.role)) {
      return next(new HttpError(403, 'You do not have permission to access this resource'));
    }
    return next();
  };
}

module.exports = requireRole;
