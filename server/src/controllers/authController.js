/**
 * HTTP layer for authentication. Controllers only translate between HTTP and
 * the service layer - no business logic here.
 */
const authService = require('../services/authService');
const asyncHandler = require('../utils/asyncHandler');

const register = asyncHandler(async (req, res) => {
  const result = await authService.register(req.body);
  res.status(201).json(result);
});

const login = asyncHandler(async (req, res) => {
  const result = await authService.login(req.body);
  res.json(result);
});

/** Returns the user encoded in the caller's token (used to restore sessions). */
const me = (req, res) => {
  res.json({ user: req.user });
};

module.exports = { register, login, me };
