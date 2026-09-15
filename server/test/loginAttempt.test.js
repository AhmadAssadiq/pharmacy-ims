const test = require('node:test');
const assert = require('node:assert/strict');
const { createLoginAttemptTracker } = require('../src/services/loginAttemptService');

test('locks the account after 5 failed attempts (NFR 2.3)', () => {
  let clock = 1_000_000;
  const tracker = createLoginAttemptTracker({ maxAttempts: 5, lockoutMinutes: 15, now: () => clock });
  const email = 'user@example.com';

  for (let i = 1; i <= 4; i += 1) {
    const result = tracker.recordFailure(email);
    assert.equal(result.locked, false, `attempt ${i} should not lock`);
    assert.equal(result.remainingAttempts, 5 - i);
  }
  assert.equal(tracker.lockedFor(email), 0);

  const fifth = tracker.recordFailure(email);
  assert.equal(fifth.locked, true);
  assert.equal(tracker.lockedFor(email), 15 * 60 * 1000);

  // Lock expires after the lockout window.
  clock += 15 * 60 * 1000 + 1;
  assert.equal(tracker.lockedFor(email), 0);
});

test('a successful login resets the failure counter', () => {
  const tracker = createLoginAttemptTracker({ maxAttempts: 5, lockoutMinutes: 15 });
  const email = 'user@example.com';
  tracker.recordFailure(email);
  tracker.recordFailure(email);
  tracker.reset(email);
  const result = tracker.recordFailure(email);
  assert.equal(result.remainingAttempts, 4);
});

test('attempts are tracked per account', () => {
  const tracker = createLoginAttemptTracker({ maxAttempts: 2, lockoutMinutes: 1 });
  tracker.recordFailure('a@example.com');
  tracker.recordFailure('a@example.com');
  assert.ok(tracker.lockedFor('a@example.com') > 0);
  assert.equal(tracker.lockedFor('b@example.com'), 0);
});
