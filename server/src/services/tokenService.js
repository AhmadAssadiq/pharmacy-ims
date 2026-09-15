/**
 * Issues and verifies JSON Web Tokens. Kept separate from authService so the
 * WebSocket server can verify tokens without pulling in bcrypt/DB code.
 */
const jwt = require('jsonwebtoken');
const env = require('../config/env');

function signToken(user) {
  return jwt.sign(
    { sub: String(user.id), name: user.name, email: user.email, role: user.role },
    env.jwtSecret,
    { expiresIn: env.jwtExpiresIn }
  );
}

/** Returns { id, name, email, role } or throws if the token is invalid. */
function verifyToken(token) {
  const payload = jwt.verify(token, env.jwtSecret);
  return { id: Number(payload.sub), name: payload.name, email: payload.email, role: payload.role };
}

module.exports = { signToken, verifyToken };
