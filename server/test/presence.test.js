const test = require('node:test');
const assert = require('node:assert/strict');
const { createPresence } = require('../src/ws/presence');

const staff = { id: 1, role: 'staff' };
const patient = { id: 2, role: 'patient' };

test('the first socket brings a user online, later ones do not (GP2 addition)', () => {
  const p = createPresence();
  assert.equal(p.connect(patient, 'a').cameOnline, true);
  assert.equal(p.connect(patient, 'b').cameOnline, false);
  assert.equal(p.isOnline(2), true);
});

test('only the last socket closing takes a user offline', () => {
  const p = createPresence();
  p.connect(patient, 'a');
  p.connect(patient, 'b');
  assert.equal(p.disconnect(patient, 'a').wentOffline, false);
  assert.equal(p.isOnline(2), true);
  assert.equal(p.disconnect(patient, 'b').wentOffline, true);
  assert.equal(p.isOnline(2), false);
});

test('disconnecting twice (close after error, or terminate) reports offline once', () => {
  const p = createPresence();
  p.connect(patient, 'a');
  assert.equal(p.disconnect(patient, 'a').wentOffline, true);
  assert.equal(p.disconnect(patient, 'a').wentOffline, false);
  assert.equal(p.disconnect({ id: 99, role: 'patient' }, 'x').wentOffline, false);
});

test('the pharmacy comes online with the first staff member and goes offline with the last', () => {
  const p = createPresence();
  const second = { id: 5, role: 'staff' };
  assert.equal(p.connect(staff, 'a').pharmacyCameOnline, true);
  assert.equal(p.connect(second, 'b').pharmacyCameOnline, false);
  assert.equal(p.connect(staff, 'c').pharmacyCameOnline, false, 'a second tab is not a new arrival');
  assert.equal(p.disconnect(staff, 'a').pharmacyWentOffline, false);
  assert.equal(p.disconnect(staff, 'c').pharmacyWentOffline, false, 'another staff member is still here');
  assert.equal(p.disconnect(second, 'b').pharmacyWentOffline, true);
});

test('patients never move the pharmacy edge', () => {
  const p = createPresence();
  assert.equal(p.connect(patient, 'a').pharmacyCameOnline, false);
  assert.equal(p.disconnect(patient, 'a').pharmacyWentOffline, false);
});

test('counts staff separately from patients', () => {
  const p = createPresence();
  p.connect(staff, 's1');
  p.connect(staff, 's2');
  p.connect(patient, 'p1');
  p.connect({ id: 3, role: 'patient' }, 'p2');
  assert.equal(p.staffOnlineCount(), 1);
  assert.deepEqual(p.onlineIdsByRole('patient').sort(), [2, 3]);
  assert.deepEqual(p.onlineUserIds().sort(), [1, 2, 3]);
  assert.deepEqual(p.socketsOf(1).sort(), ['s1', 's2']);
  assert.equal(p.allSockets().length, 4);
});
