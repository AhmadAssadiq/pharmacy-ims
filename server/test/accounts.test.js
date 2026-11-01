// Tests for logging in: the lockout after 5 wrong passwords (NFR 2.3), the login token check
// (including the sign-out after a password reset), roles (NFR 2.2) and account deletion.
// The database is replaced by a fake (mock.method on db.query), so no MySQL is needed.
import test from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import { db } from '../src/db.js';
import { config } from '../src/config.js';
import { getMinutesLocked, recordFailedLogin, clearFailedLogins } from '../src/services/loginLockout.js';
import { createLoginToken, getUserFromToken, requireLogin, requireRole } from '../src/middleware/auth.js';
import { canDeleteOwnAccount, deleteOwnAccount } from '../src/services/authService.js';

// ---- lockout ----

test('5 wrong passwords in a row lock the account for 15 minutes (NFR 2.3)', (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: 0 });
  const email = 'lock@test.com';

  for (let attempt = 1; attempt <= 4; attempt++) {
    const result = recordFailedLogin(email);
    assert.equal(result.isNowLocked, false);
    assert.equal(result.attemptsLeft, 5 - attempt);
  }
  assert.equal(recordFailedLogin(email).isNowLocked, true);
  assert.equal(getMinutesLocked(email), 15);

  // After 15 minutes the lock is gone and counting starts again
  t.mock.timers.tick(15 * 60 * 1000);
  assert.equal(getMinutesLocked(email), 0);
  assert.equal(recordFailedLogin(email).attemptsLeft, 4);
});

test('a correct password clears the count, and each account is counted separately', () => {
  recordFailedLogin('a@test.com');
  recordFailedLogin('a@test.com');
  clearFailedLogins('a@test.com');
  assert.equal(recordFailedLogin('a@test.com').attemptsLeft, 4);
  assert.equal(recordFailedLogin('b@test.com').attemptsLeft, 4);
});

// ---- login tokens ----

const SARA = { id: 7, name: 'Sara', email: 'sara@test.com', phone: '0791234567', role: 'patient' };

// Makes db.query answer as if the users table held `user` (or nobody, when user is null)
function fakeUsersTable(t, user) {
  t.mock.method(db, 'query', async () => [user ? [user] : []]);
}

test('a valid token for an existing user is accepted (FR 1)', async (t) => {
  fakeUsersTable(t, { ...SARA, password_changed_time: null });
  const user = await getUserFromToken(createLoginToken(SARA));
  assert.deepEqual(user, SARA);
});

test("a deleted user's token is refused at once, although its signature is still valid", async (t) => {
  fakeUsersTable(t, null);
  assert.equal(await getUserFromToken(createLoginToken(SARA)), null);
});

test('a token made before a password reset is refused; one made after is accepted', async (t) => {
  const now = Math.floor(Date.now() / 1000);
  // The password was reset 10 seconds ago
  fakeUsersTable(t, { ...SARA, password_changed_time: now - 10 });

  const oldToken = jwt.sign({ sub: '7', iat: now - 60 }, config.jwtSecret);
  const newToken = jwt.sign({ sub: '7', iat: now }, config.jwtSecret);
  assert.equal(await getUserFromToken(oldToken), null);
  assert.deepEqual(await getUserFromToken(newToken), SARA);
});

test('a forged token and a missing header are refused with 401', async () => {
  assert.equal(await getUserFromToken(jwt.sign({ sub: '7' }, 'wrong-secret')), null);
  await assert.rejects(requireLogin({ headers: {} }, {}, () => {}), (error) => {
    assert.equal(error.status, 401);
    assert.equal(error.code, 'AUTH_REQUIRED');
    return true;
  });
});

// ---- roles ----

test('requireRole lets the right role through and refuses the others (NFR 2.2)', () => {
  const staffOnly = requireRole('staff');
  let passed = false;
  staffOnly({ user: { role: 'staff' } }, {}, () => {
    passed = true;
  });
  assert.equal(passed, true);

  assert.throws(() => staffOnly({ user: { role: 'patient' } }, {}, () => {}), { status: 403, code: 'FORBIDDEN' });
  assert.throws(() => staffOnly({}, {}, () => {}), { status: 401, code: 'AUTH_REQUIRED' });
});

// ---- deleting your own account (GP2 addition) ----

test('only patients may delete their own account', () => {
  assert.equal(canDeleteOwnAccount('patient'), true);
  assert.equal(canDeleteOwnAccount('staff'), false);
  assert.equal(canDeleteOwnAccount(undefined), false);
});

test('a staff member is refused with 403 before anything is checked or deleted', async (t) => {
  const query = t.mock.method(db, 'query', async () => [[]]);
  await assert.rejects(deleteOwnAccount({ id: 1, email: 'staff@pharmacy.com', role: 'staff' }, 'anything'), {
    status: 403,
    code: 'ACCOUNT_DELETE_FORBIDDEN',
  });
  assert.equal(query.mock.callCount(), 0);
});
