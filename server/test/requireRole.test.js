const test = require('node:test');
const assert = require('node:assert/strict');
const requireRole = require('../src/middleware/requireRole');

function run(middleware, req) {
  let passedError;
  let called = false;
  middleware(req, {}, (err) => {
    called = true;
    passedError = err;
  });
  return { called, error: passedError };
}

test('allows a user whose role is permitted', () => {
  const { called, error } = run(requireRole('staff'), { user: { id: 1, role: 'staff' } });
  assert.equal(called, true);
  assert.equal(error, undefined);
});

test('rejects a patient on a staff-only route with 403 (NFR 2.2)', () => {
  const { error } = run(requireRole('staff'), { user: { id: 2, role: 'patient' } });
  assert.equal(error.status, 403);
});

test('rejects an unauthenticated request with 401', () => {
  const { error } = run(requireRole('staff'), {});
  assert.equal(error.status, 401);
});
