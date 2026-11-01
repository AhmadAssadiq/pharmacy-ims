// Checks the English and Arabic dictionaries of the React app (client/src/i18n) match, so no
// text is missing in one language (GP2 addition).
import test from 'node:test';
import assert from 'node:assert/strict';
import en from '../../client/src/i18n/en.json' with { type: 'json' };
import ar from '../../client/src/i18n/ar.json' with { type: 'json' };
import { ERROR_CODES } from '../src/constants.js';

// Plural texts end in _zero, _one, _two, _few, _many or _other. English uses only _one and
// _other while Arabic uses all six, so plural keys are compared without that ending.
const PLURAL_ENDING = /_(zero|one|two|few|many|other)$/;

// Every text's full key, e.g. 'nav.logout', with the plural ending removed
function allKeys(dictionary, prefix = '') {
  const keys = new Set();
  for (const [key, value] of Object.entries(dictionary)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === 'object') {
      for (const nested of allKeys(value, fullKey)) keys.add(nested);
    } else {
      keys.add(fullKey.replace(PLURAL_ENDING, ''));
    }
  }
  return keys;
}

test('the Arabic dictionary has exactly the same texts as the English one', () => {
  assert.deepEqual([...allKeys(ar)].sort(), [...allKeys(en)].sort());
});

test('every plural text has an "other" form in both languages', () => {
  for (const dictionary of [en, ar]) {
    const keys = new Set();
    function collect(node, prefix) {
      for (const [key, value] of Object.entries(node)) {
        const fullKey = prefix ? `${prefix}.${key}` : key;
        if (value && typeof value === 'object') collect(value, fullKey);
        else keys.add(fullKey);
      }
    }
    collect(dictionary, '');
    for (const key of keys) {
      if (PLURAL_ENDING.test(key)) {
        assert.ok(keys.has(key.replace(PLURAL_ENDING, '_other')), `${key} has no _other form`);
      }
    }
  }
});

test('every error code the server sends has a translation in both languages', () => {
  for (const code of Object.values(ERROR_CODES)) {
    const hasEnglish = en.errors[code] !== undefined || en.errors[`${code}_other`] !== undefined;
    const hasArabic = ar.errors[code] !== undefined || ar.errors[`${code}_other`] !== undefined;
    assert.ok(hasEnglish, `en missing errors.${code}`);
    assert.ok(hasArabic, `ar missing errors.${code}`);
  }
});
