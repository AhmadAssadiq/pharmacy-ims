/**
 * HTTP layer for authentication. Controllers only translate between HTTP and
 * the service layer - no business logic here.
 */
const authService = require('../services/authService');
const passwordResetService = require('../services/passwordResetService');
const chatHub = require('../ws/chatHub');
const asyncHandler = require('../utils/asyncHandler');

const register = asyncHandler(async (req, res) => {
  const result = await authService.register(req.body);
  res.status(201).json(result);
});

const login = asyncHandler(async (req, res) => {
  const result = await authService.login(req.body);
  res.json(result);
});

/** Always the same answer, whether or not the email has an account. */
const forgotPassword = asyncHandler(async (req, res) => {
  res.json(await passwordResetService.requestPasswordReset(req.body, { ip: req.ip }));
});

const resetPassword = asyncHandler(async (req, res) => {
  res.json(await passwordResetService.resetPassword(req.body, { ip: req.ip }));
});

/** Returns the user encoded in the caller's token (used to restore sessions). */
const me = (req, res) => {
  res.json({ user: req.user });
};

/** A patient deletes their own account; their open chat sockets are closed with it. */
const deleteMe = asyncHandler(async (req, res) => {
  await authService.deleteOwnAccount(req.user, req.body);
  chatHub.disconnectUser(req.user.id);
  res.status(204).end();
});

module.exports = { register, login, me, forgotPassword, resetPassword, deleteMe };
