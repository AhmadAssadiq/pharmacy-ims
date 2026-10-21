/**
 * Pure validation functions for the auth endpoints. They return
 * { valid, errors, value } and never touch the database, which keeps them
 * easy to unit test.
 */
const { PASSWORD_MIN_LENGTH, ROLES } = require('../../../shared/constants.json');

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const RESET_TOKEN_PATTERN = /^[0-9a-f]{64}$/;
const NAME_MAX_LENGTH = 100;

function normaliseEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function validateRegister(body = {}) {
  const errors = {};
  const name = String(body.name || '').trim();
  const email = normaliseEmail(body.email);
  const password = typeof body.password === 'string' ? body.password : '';

  if (!name) errors.name = 'Name is required';
  else if (name.length > NAME_MAX_LENGTH) errors.name = `Name must be at most ${NAME_MAX_LENGTH} characters`;

  if (!email) errors.email = 'Email is required';
  else if (!EMAIL_PATTERN.test(email)) errors.email = 'Email address is not valid';

  const passwordError = checkNewPassword(password);
  if (passwordError) errors.password = passwordError;

  return { valid: Object.keys(errors).length === 0, errors, value: { name, email, password } };
}

/** The rules a new password must meet, shared by registration and password reset. */
function checkNewPassword(password) {
  if (!password) return 'Password is required';
  if (password.length < PASSWORD_MIN_LENGTH) return `Password must be at least ${PASSWORD_MIN_LENGTH} characters`;
  return null;
}

/** Forgot password: only a well-formed email. Whether it exists is never revealed. */
function validateForgotPassword(body = {}) {
  const email = normaliseEmail(body.email);
  const errors = {};
  if (!email) errors.email = 'Email is required';
  else if (!EMAIL_PATTERN.test(email)) errors.email = 'Email address is not valid';
  return { valid: Object.keys(errors).length === 0, errors, value: { email } };
}

/** Reset: a 64-hex-character token and a password that meets the usual rules. */
function validateResetPassword(body = {}) {
  const token = typeof body.token === 'string' ? body.token.trim().toLowerCase() : '';
  const password = typeof body.password === 'string' ? body.password : '';
  const errors = {};
  if (!RESET_TOKEN_PATTERN.test(token)) errors.token = 'Reset link is not valid';
  const passwordError = checkNewPassword(password);
  if (passwordError) errors.password = passwordError;
  return { valid: Object.keys(errors).length === 0, errors, value: { token, password } };
}

function validateLogin(body = {}) {
  const errors = {};
  const email = normaliseEmail(body.email);
  const password = typeof body.password === 'string' ? body.password : '';

  if (!email) errors.email = 'Email is required';
  if (!password) errors.password = 'Password is required';

  return { valid: Object.keys(errors).length === 0, errors, value: { email, password } };
}

/** Deleting your own account: the current password, re-entered. */
function validateDeleteAccount(body = {}) {
  const password = typeof body.password === 'string' ? body.password : '';
  const errors = {};
  if (!password) errors.password = 'Password is required';
  return { valid: Object.keys(errors).length === 0, errors, value: { password } };
}

/**
 * Only patients may delete their own account. Staff accounts are created by
 * the administrator, and a staff member deleting themselves could leave the
 * pharmacy with nobody able to run it.
 */
function canSelfDelete(role) {
  return role === ROLES.PATIENT;
}

module.exports = {
  validateDeleteAccount,
  canSelfDelete,
  validateRegister,
  validateLogin,
  validateForgotPassword,
  validateResetPassword,
  checkNewPassword,
  normaliseEmail,
  PASSWORD_MIN_LENGTH,
};
