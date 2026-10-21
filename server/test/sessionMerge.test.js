const test = require('node:test');
const assert = require('node:assert/strict');
const { planSessionMerges } = require('../src/db/upgrades');

test('leaves patients with a single session alone (FR 5)', () => {
  const plan = planSessionMerges([
    { id: 1, patient_id: 10, staff_id: null },
    { id: 2, patient_id: 11, staff_id: 5 },
  ]);
  assert.deepEqual(plan, []);
});

test('keeps the earliest session and removes the rest', () => {
  const plan = planSessionMerges([
    { id: 7, patient_id: 10, staff_id: null },
    { id: 3, patient_id: 10, staff_id: null },
    { id: 9, patient_id: 10, staff_id: null },
  ]);
  assert.deepEqual(plan, [{ patientId: 10, keepId: 3, removeIds: [7, 9], staffId: null }]);
});

test('the surviving session keeps its own assigned staff member', () => {
  const plan = planSessionMerges([
    { id: 1, patient_id: 10, staff_id: 4 },
    { id: 2, patient_id: 10, staff_id: 8 },
  ]);
  assert.equal(plan[0].staffId, 4);
});

test('an unassigned survivor takes the first staff member assigned to a duplicate', () => {
  const plan = planSessionMerges([
    { id: 1, patient_id: 10, staff_id: null },
    { id: 2, patient_id: 10, staff_id: 8 },
    { id: 3, patient_id: 10, staff_id: 9 },
  ]);
  assert.equal(plan[0].staffId, 8);
});

test('merges each patient independently', () => {
  const plan = planSessionMerges([
    { id: 1, patient_id: 10, staff_id: null },
    { id: 2, patient_id: 10, staff_id: null },
    { id: 3, patient_id: 11, staff_id: null },
    { id: 4, patient_id: 11, staff_id: null },
    { id: 5, patient_id: 12, staff_id: null },
  ]);
  assert.deepEqual(plan.map((m) => [m.patientId, m.keepId, m.removeIds]), [
    [10, 1, [2]],
    [11, 3, [4]],
  ]);
});
