const test = require('node:test');
const assert = require('node:assert/strict');
const { createAuthenticate } = require('../src/middleware/authenticate');
const { signToken } = require('../src/services/tokenService');

const alice = { id: 7, name: 'Alice', email: 'alice@example.com', phone: '0791234567', role: 'patient' };

function run(middleware, headers) {
  return new Promise((resolve) => {
    const req = { headers };
    middleware(req, {}, (err) => resolve({ err, user: req.user }));
  });
}

test('accepts a valid token for a user that still exists (FR 1)', async () => {
  const authenticate = createAuthenticate({ findUser: async (id) => (id === 7 ? alice : null) });
  const { err, user } = await run(authenticate, { authorization: `Bearer ${signToken(alice)}` });
  assert.equal(err, undefined);
  assert.deepEqual(user, alice);
});

test("refuses a deleted user's token at once, though its signature is still valid (GP2 addition)", async () => {
  const authenticate = createAuthenticate({ findUser: async () => null });
  const { err } = await run(authenticate, { authorization: `Bearer ${signToken(alice)}` });
  assert.equal(err.status, 401);
  assert.equal(err.code, 'AUTH_INVALID_TOKEN');
});

test('takes name and role from the database, not from the token', async () => {
  const promoted = { ...alice, name: 'Alice B', role: 'staff' };
  const authenticate = createAuthenticate({ findUser: async () => promoted });
  const { user } = await run(authenticate, { authorization: `Bearer ${signToken(alice)}` });
  assert.equal(user.name, 'Alice B');
  assert.equal(user.role, 'staff');
});

test('refuses a missing header and a forged token', async () => {
  const authenticate = createAuthenticate({ findUser: async () => alice });
  assert.equal((await run(authenticate, {})).err.code, 'AUTH_REQUIRED');
  assert.equal((await run(authenticate, { authorization: 'Bearer not.a.jwt' })).err.code, 'AUTH_INVALID_TOKEN');
});
