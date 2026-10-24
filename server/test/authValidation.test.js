const test = require('node:test');
const assert = require('node:assert/strict');
const { validateRegister, validateLogin } = require('../src/validation/authValidation');

test('validateRegister accepts a well-formed payload and normalises the email', () => {
  const result = validateRegister({ name: '  Sara  ', email: 'Sara@Example.com ', password: 'password123', phone: '0791234567' });
  assert.equal(result.valid, true);
  assert.deepEqual(result.errors, {});
  assert.equal(result.value.name, 'Sara');
  assert.equal(result.value.email, 'sara@example.com');
});

test('validateRegister rejects missing fields', () => {
  const result = validateRegister({});
  assert.equal(result.valid, false);
  assert.ok(result.errors.name);
  assert.ok(result.errors.email);
  assert.ok(result.errors.password);
});

test('validateRegister rejects a malformed email', () => {
  const result = validateRegister({ name: 'A', email: 'not-an-email', password: 'password123' });
  assert.equal(result.valid, false);
  assert.match(result.errors.email, /not valid/);
});

test('validateRegister rejects a short password', () => {
  const result = validateRegister({ name: 'A', email: 'a@b.co', password: 'short' });
  assert.equal(result.valid, false);
  assert.match(result.errors.password, /at least 8/);
});

test('validateLogin requires both email and password', () => {
  assert.equal(validateLogin({ email: 'a@b.co' }).valid, false);
  assert.equal(validateLogin({ password: 'x' }).valid, false);
  assert.equal(validateLogin({ email: 'a@b.co', password: 'x' }).valid, true);
});

test('a patient must give a phone number, normalised from how people type it (GP2 addition)', () => {
  const { normalisePhone } = require('../src/validation/authValidation');
  assert.deepEqual(normalisePhone('079 123 4567'), { value: '0791234567' });
  assert.deepEqual(normalisePhone('+962 (79) 123-4567'), { value: '+962791234567' });
  assert.deepEqual(normalisePhone('00962791234567'), { value: '+962791234567' });
  assert.equal(normalisePhone('').error, 'Phone number is required');
  assert.equal(normalisePhone('12345').error, 'Phone number is not valid');
  assert.equal(normalisePhone('079-ABC-4567').error, 'Phone number is not valid');
  assert.equal(normalisePhone('+1234567890123456').error, 'Phone number is not valid');
  const register = validateRegister({ name: 'Sara', email: 'sara@example.com', password: 'password123' });
  assert.ok(register.errors.phone, 'registration without a phone is refused');
  assert.equal(validateRegister({ name: 'Sara', email: 'sara@example.com', password: 'password123', phone: '0791234567' }).valid, true);
});
