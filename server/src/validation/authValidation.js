/**
 * Pure validation functions for the auth endpoints. They return
 * { valid, errors, value } and never touch the database, which keeps them
 * easy to unit test.
 */
const { PASSWORD_MIN_LENGTH, ROLES } = require('../../../shared/constants.json');

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const RESET_TOKEN_PATTERN = /^[0-9a-f]{64}$/;
const NAME_MAX_LENGTH = 100;

/**
 * A phone number as people type it: spaces, dashes, dots and brackets are
 * dropped and a leading 00 becomes +. What is left must be 8 to 15 digits,
 * with an optional leading + (E.164's limit is 15). Jordanian numbers such as
 * 079 123 4567 and +962 79 123 4567 both pass. Returns { value } or { error }.
 */
function normalisePhone(raw) {
  const compact = String(raw ?? '').trim().replace(/[\s\-().]/g, '').replace(/^00/, '+');
  if (!compact) return { error: 'Phone number is required' };
  if (!/^\+?\d{8,15}$/.test(compact)) return { error: 'Phone number is not valid' };
  return { value: compact };
}

function normaliseEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function validateRegister(body = {}) {
  const errors = {};
  const name = String(body.name || '').trim();
  const email = normaliseEmail(body.email);
  const password = typeof body.password === 'string' ? body.password : '';
  const phone = normalisePhone(body.phone);

  if (!name) errors.name = 'Name is required';
  else if (name.length > NAME_MAX_LENGTH) errors.name = `Name must be at most ${NAME_MAX_LENGTH} characters`;

  if (!email) errors.email = 'Email is required';
  else if (!EMAIL_PATTERN.test(email)) errors.email = 'Email address is not valid';

  const passwordError = checkNewPassword(password);
  if (passwordError) errors.password = passwordError;

  // Registration only creates patients, and every patient needs a phone number.
  if (phone.error) errors.phone = phone.error;

  return { valid: Object.keys(errors).length === 0, errors, value: { name, email, password, phone: phone.value } };
}

/** Adding or changing your own phone number. */
function validatePhoneUpdate(body = {}) {
  const phone = normalisePhone(body.phone);
  return phone.error
    ? { valid: false, errors: { phone: phone.error }, value: {} }
    : { valid: true, errors: {}, value: { phone: phone.value } };
}

/** The rules a new password must meet, shared by registration and password reset. */
function checkNewPassword(password) {
  if (!password) return 'Password is required';
  if (password.length < PASSWORD_MIN_LENGTH) return `Password must be at least ${PASSWORD_MIN_LENGTH} characters`;
  return null;
}

/**
 * Forgot password: only a well-formed email, whose existence is never
 * revealed, and the language to write the email in (en unless "ar").
 */
function validateForgotPassword(body = {}) {
  const email = normaliseEmail(body.email);
  const lang = body.lang === 'ar' ? 'ar' : 'en';
  const errors = {};
  if (!email) errors.email = 'Email is required';
  else if (!EMAIL_PATTERN.test(email)) errors.email = 'Email address is not valid';
  return { valid: Object.keys(errors).length === 0, errors, value: { email, lang } };
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
  normalisePhone,
  validatePhoneUpdate,
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
