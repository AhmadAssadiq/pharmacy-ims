const test = require('node:test');
const assert = require('node:assert/strict');
const { validateDeleteAccount, canSelfDelete } = require('../src/validation/authValidation');
const { deleteOwnAccount } = require('../src/services/authService');
const { createLoginAttemptTracker } = require('../src/services/loginAttemptService');

test('deleting an account needs the current password (GP2 addition)', () => {
  assert.equal(validateDeleteAccount({ password: 'secret123' }).valid, true);
  assert.ok(validateDeleteAccount({}).errors.password);
  assert.ok(validateDeleteAccount({ password: 42 }).errors.password);
});

test('only patients may delete their own account', () => {
  assert.equal(canSelfDelete('patient'), true);
  assert.equal(canSelfDelete('staff'), false);
  assert.equal(canSelfDelete(undefined), false);
});

test('a staff member is refused with 403 before anything is checked or deleted', async () => {
  const staff = { id: 1, email: 'staff@pharmacy.com', role: 'staff' };
  await assert.rejects(deleteOwnAccount(staff, { password: 'anything' }), (err) => {
    assert.equal(err.status, 403);
    assert.equal(err.code, 'ACCOUNT_DELETE_FORBIDDEN');
    return true;
  });
});

test('a locked account cannot be deleted until the lock expires', async () => {
  const tracker = createLoginAttemptTracker({ maxAttempts: 1, lockoutMinutes: 15 });
  tracker.recordFailure('sara@example.com');
  const patient = { id: 9, email: 'sara@example.com', role: 'patient' };
  await assert.rejects(deleteOwnAccount(patient, { password: 'x' }, { tracker }), (err) => err.status === 423);
});
