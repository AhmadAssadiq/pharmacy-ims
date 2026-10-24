const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { generateToken, hashToken, tokenState, TOKEN_BYTES } = require('../src/utils/resetToken');
const { createRateLimiter } = require('../src/services/rateLimitService');
const { validateForgotPassword, validateResetPassword } = require('../src/validation/authValidation');

test('a reset token is 32 random bytes as hex, and only its SHA-256 is kept (GP2 addition)', () => {
  const { token, hash } = generateToken();
  assert.match(token, /^[0-9a-f]{64}$/);
  assert.equal(token.length, TOKEN_BYTES * 2);
  assert.equal(hash, crypto.createHash('sha256').update(token).digest('hex'));
  assert.notEqual(hash, token);
});

test('two tokens never collide and the hash is deterministic', () => {
  const a = generateToken();
  const b = generateToken();
  assert.notEqual(a.token, b.token);
  assert.equal(hashToken(a.token), a.hash);
});

test('a token is valid only before it expires and only until it is used', () => {
  const now = 1_000_000;
  assert.equal(tokenState(null, now), 'missing');
  assert.equal(tokenState({ expires_ms: now + 1, used_at: null }, now), 'valid');
  assert.equal(tokenState({ expires_ms: now, used_at: null }, now), 'expired');
  assert.equal(tokenState({ expires_ms: now - 1, used_at: null }, now), 'expired');
  assert.equal(tokenState({ expires_ms: now + 60_000, used_at: '2026-10-21 10:00:00' }, now), 'used');
});

test('the rate limiter allows `limit` hits per window, then blocks until it resets', () => {
  let clock = 0;
  const limiter = createRateLimiter({ limit: 3, windowMs: 1000, now: () => clock });
  for (let i = 0; i < 3; i += 1) assert.equal(limiter.hit('ip:1').allowed, true);
  const blocked = limiter.hit('ip:1');
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.retryAfterMs, 1000);
  assert.equal(limiter.hit('ip:2').allowed, true, 'keys are independent');
  clock = 1000;
  assert.equal(limiter.hit('ip:1').allowed, true, 'a new window starts');
});

test('forgot password accepts any well-formed email and normalises it', () => {
  assert.deepEqual(validateForgotPassword({ email: ' Sara@Example.com ' }).value, { email: 'sara@example.com', lang: 'en' });
  assert.equal(validateForgotPassword({ email: 'a@b.co', lang: 'ar' }).value.lang, 'ar');
  assert.equal(validateForgotPassword({ email: 'a@b.co', lang: 'xx' }).value.lang, 'en');
  assert.equal(validateForgotPassword({ email: 'not-an-email' }).valid, false);
  assert.equal(validateForgotPassword({}).valid, false);
});

test('reset password needs a well-formed token and a password that meets the rules', () => {
  const { token } = generateToken();
  assert.equal(validateResetPassword({ token, password: 'longenough' }).valid, true);
  assert.equal(validateResetPassword({ token: token.toUpperCase(), password: 'longenough' }).value.token, token);
  assert.ok(validateResetPassword({ token: 'abc', password: 'longenough' }).errors.token);
  assert.ok(validateResetPassword({ token, password: 'short' }).errors.password);
});

test('the reset email carries the link and its lifetime, in English or Arabic', () => {
  const { resetEmail } = require('../src/services/passwordResetService');
  const link = 'http://localhost:5173/reset-password?token=abc';
  const en = resetEmail('en', { name: 'Sara', link, minutes: 15 });
  const ar = resetEmail('ar', { name: 'سارة', link, minutes: 15 });
  for (const mail of [en, ar]) {
    assert.ok(mail.text.includes(link));
    assert.ok(mail.text.includes('15'));
    assert.ok(mail.subject.length > 0);
  }
  assert.match(en.text, /^Hello Sara,/);
  assert.match(ar.text, /^مرحبًا سارة،/);
});

test('the rate limiter forgets expired windows, so it cannot grow without bound', () => {
  let clock = 0;
  const limiter = createRateLimiter({ limit: 3, windowMs: 1000, now: () => clock });
  for (let i = 0; i < 99; i += 1) limiter.hit(`email:${i}@example.com`);
  assert.equal(limiter.size(), 99);
  clock = 5000;
  limiter.hit('email:last@example.com');
  assert.equal(limiter.size(), 1, 'the 100th hit prunes every expired window');
});
