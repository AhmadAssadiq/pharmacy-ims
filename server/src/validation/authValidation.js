/**
 * Pure validation functions for the auth endpoints. They return
 * { valid, errors, value } and never touch the database, which keeps them
 * easy to unit test.
 */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PASSWORD_MIN_LENGTH = 8;
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

  if (!password) errors.password = 'Password is required';
  else if (password.length < PASSWORD_MIN_LENGTH) {
    errors.password = `Password must be at least ${PASSWORD_MIN_LENGTH} characters`;
  }

  return { valid: Object.keys(errors).length === 0, errors, value: { name, email, password } };
}

function validateLogin(body = {}) {
  const errors = {};
  const email = normaliseEmail(body.email);
  const password = typeof body.password === 'string' ? body.password : '';

  if (!email) errors.email = 'Email is required';
  if (!password) errors.password = 'Password is required';

  return { valid: Object.keys(errors).length === 0, errors, value: { email, password } };
}

module.exports = { validateRegister, validateLogin, normaliseEmail, PASSWORD_MIN_LENGTH };
