const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { ERROR_CODES } = require('../../shared/constants.json');

const dir = path.join(__dirname, '../../client/src/i18n');
const en = require(path.join(dir, 'en.json'));
const ar = require(path.join(dir, 'ar.json'));

/** Leaf keys; a plural object counts as one leaf. */
function leaves(node, prefix = '') {
  return Object.entries(node).flatMap(([key, value]) => {
    const full = prefix ? `${prefix}.${key}` : key;
    const plural = value && typeof value === 'object' && 'other' in value;
    return value && typeof value === 'object' && !plural ? leaves(value, full) : [full];
  });
}

test('the Arabic dictionary has exactly the English keys (GP2 addition)', () => {
  assert.deepEqual(leaves(ar).sort(), leaves(en).sort());
});

test('every error code the server sends has a translation in both languages', () => {
  for (const code of Object.values(ERROR_CODES)) {
    assert.ok(en.errors[code], `en missing errors.${code}`);
    assert.ok(ar.errors[code], `ar missing errors.${code}`);
  }
});
