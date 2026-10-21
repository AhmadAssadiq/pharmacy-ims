const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

// The translator is the client's pure ES module; node --test can import it as is.
const load = () => import(pathToFileURL(path.join(__dirname, '../../client/src/i18n/translate.js')).href);

const FSI = '⁨';
const PDI = '⁩';

const en = {
  greeting: 'Hello {name}',
  units: { one: '{count} unit', other: '{count} units' },
  only: 'English only',
};
const ar = {
  greeting: 'مرحبًا {name}',
  units: { zero: '{count} وحدة', one: 'وحدة واحدة', two: 'وحدتان', few: '{count} وحدات', many: '{count} وحدة', other: '{count} وحدة' },
};

test('picks the Arabic plural form by count (GP2 addition)', async () => {
  const { createTranslator } = await load();
  const t = createTranslator(ar, 'ar-JO-u-nu-latn', en);
  assert.equal(t('units', { count: 1 }), 'وحدة واحدة');
  assert.equal(t('units', { count: 2 }), 'وحدتان');
  assert.equal(t('units', { count: 3 }), '3 وحدات');
  assert.equal(t('units', { count: 11 }), '11 وحدة');
  assert.equal(t('units', { count: 100 }), '100 وحدة');
});

test('picks the English plural form by count', async () => {
  const { createTranslator } = await load();
  const t = createTranslator(en, 'en-GB');
  assert.equal(t('units', { count: 1 }), '1 unit');
  assert.equal(t('units', { count: 5 }), '5 units');
});

test('isolates interpolated strings so a Latin name cannot reorder Arabic text', async () => {
  const { createTranslator } = await load();
  const t = createTranslator(ar, 'ar-JO-u-nu-latn', en);
  assert.equal(t('greeting', { name: 'Hikma' }), `مرحبًا ${FSI}Hikma${PDI}`);
});

test('falls back to English, then to the key itself', async () => {
  const { createTranslator } = await load();
  const t = createTranslator(ar, 'ar-JO-u-nu-latn', en);
  assert.equal(t('only'), 'English only');
  assert.equal(t('missing.key'), 'missing.key');
});

test('returns parts, not a string, when a value is an element; n picks the plural', async () => {
  const { createTranslator } = await load();
  const t = createTranslator(en, 'en-GB');
  const bold = { type: 'strong', value: 3 };
  assert.deepEqual(t('units', { count: bold, n: 3 }), [bold, ' units']);
});

test('formats dates with the month spelled and Western digits in Arabic', async () => {
  const { formatDate, formatPrice } = await load();
  assert.equal(formatDate('2026-11-09', 'en-GB'), '09 Nov 2026');
  assert.match(formatDate('2026-11-09', 'ar-JO-u-nu-latn'), /^09 .+ 2026$/);
  assert.equal(formatDate(null, 'en-GB'), '—');
  assert.equal(formatPrice(2.5, 'ar-JO-u-nu-latn'), '2.50');
});
