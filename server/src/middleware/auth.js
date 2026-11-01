// Login tokens and access control (FR 1, FR 2, NFR 2.2).
//
// When someone logs in, the server gives them a token (a JWT): a signed piece of text
// that says who they are. The React app sends it back with every request in the header
//   Authorization: Bearer <token>
// requireLogin checks that token; requireRole checks the user's role (staff or patient).
import jwt from 'jsonwebtoken';
import createError from 'http-errors';
import { config } from '../config.js';
import { db } from '../db.js';
import { ERROR_CODES } from '../constants.js';

// Creates a login token for a user. It expires after JWT_EXPIRES_IN (8 hours by default).
// jsonwebtoken also stores the time the token was made ("iat" = issued at).
export function createLoginToken(user) {
  return jwt.sign(
    { sub: String(user.id), name: user.name, email: user.email, role: user.role },
    config.jwtSecret,
    { expiresIn: config.jwtExpiresIn }
  );
}

// Reads a login token and returns the user it belongs to: { id, name, email, phone, role }.
// Returns null when the token is not valid. A token is refused when:
//   - it is fake, damaged or expired;
//   - its user no longer exists (the account was deleted);
//   - it was made before the user's last password reset (so a reset signs out every
//     old session, including a stolen token).
// Also used by the chat socket (socket/chatSocket.js).
export async function getUserFromToken(token) {
  // 1. Check the signature and the expiry time
  let payload;
  try {
    payload = jwt.verify(token, config.jwtSecret);
  } catch {
    return null;
  }

  // 2. Look the user up, so a deleted account stops working straight away.
  //    UNIX_TIMESTAMP gives the password change time in seconds, the same unit as "iat".
  const [rows] = await db.query(
    `SELECT id, name, email, phone, role, UNIX_TIMESTAMP(password_changed_at) AS password_changed_time
     FROM users WHERE id = ?`,
    [Number(payload.sub)]
  );
  const user = rows[0];
  if (!user) {
    return null;
  }

  // 3. Refuse tokens made before the password was last reset
  if (user.password_changed_time !== null && payload.iat < Number(user.password_changed_time)) {
    return null;
  }

  return { id: user.id, name: user.name, email: user.email, phone: user.phone, role: user.role };
}

// Middleware: lets the request through only with a valid login token.
// The logged-in user is saved on req.user for the route to use.
export async function requireLogin(req, res, next) {
  // The header looks like "Bearer eyJhbGciOi..."
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) {
    throw createError(401, 'Authentication required', { code: ERROR_CODES.AUTH_REQUIRED });
  }

  const user = await getUserFromToken(token);
  if (!user) {
    throw createError(401, 'Invalid or expired token', { code: ERROR_CODES.AUTH_INVALID_TOKEN });
  }

  req.user = user;
  next();
}

// Middleware: lets the request through only for the given role(s). Use after requireLogin.
// Example: router.get('/', requireLogin, requireRole('staff'), handler)
export function requireRole(...allowedRoles) {
  return function checkRole(req, res, next) {
    if (!req.user) {
      throw createError(401, 'Authentication required', { code: ERROR_CODES.AUTH_REQUIRED });
    }
    if (!allowedRoles.includes(req.user.role)) {
      throw createError(403, 'You do not have permission to access this resource', {
        code: ERROR_CODES.FORBIDDEN,
      });
    }
    next();
  };
}
