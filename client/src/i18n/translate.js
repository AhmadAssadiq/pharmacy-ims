/**
 * Translation and locale formatting (GP2 addition). Pure functions with no
 * React, so they can be unit tested; I18nContext.jsx wires them to the app.
 *
 * Dictionaries are nested JSON. A leaf is either a string with `{name}`
 * placeholders or a plural object keyed by Intl.PluralRules category
 * (`one`, `other` in English; `zero`, `one`, `two`, `few`, `many`, `other` in
 * Arabic), chosen by the `count` value.
 */

export const LANGUAGES = ['en', 'ar'];

/**
 * Intl locale per language. Arabic keeps Western digits (`nu-latn`): on a
 * stock screen a quantity or a price must read the same to every pharmacist,
 * and Jordanian pharmacy systems, labels and invoices print Western digits.
 * en-GB gives day-month order and a 24-hour clock, the convention in Jordan.
 */
export const LOCALES = { en: 'en-GB', ar: 'ar-JO-u-nu-latn' };

export const DIRECTIONS = { en: 'ltr', ar: 'rtl' };

// First-strong isolates keep a Latin medication name from reordering the
// Arabic sentence around it (and the other way round).
const FSI = '⁨';
const PDI = '⁩';

function lookup(dict, key) {
  return key.split('.').reduce((node, part) => (node && typeof node === 'object' ? node[part] : undefined), dict);
}

function pickPlural(entry, count, locale) {
  const category = new Intl.PluralRules(locale).select(Number(count));
  return entry[category] ?? entry.other;
}

/**
 * Splits `template` on `{name}` placeholders. Returns a string when every value
 * is a string or number, otherwise an array of strings and the raw values, so
 * a caller can pass React elements (a <strong>, a <span className="num">).
 */
export function interpolate(template, values = {}, { isolate = false } = {}) {
  const parts = String(template).split(/\{(\w+)\}/);
  const out = parts.map((part, i) => {
    if (i % 2 === 0) return part;
    if (!(part in values)) return `{${part}}`;
    const value = values[part];
    if (isolate && typeof value === 'string') return `${FSI}${value}${PDI}`;
    return value;
  });
  const plain = out.every((part) => typeof part === 'string' || typeof part === 'number');
  return plain ? out.join('') : out.filter((part) => part !== '');
}

/**
 * Returns `t(key, values)` for one language. Missing keys fall back to the
 * fallback dictionary (English), then to the key itself so a gap is visible.
 *
 * The plural form is chosen by `values.count`. When `{count}` must render as
 * an element (a bold number), pass the element as `count` and the number as `n`.
 */
export function createTranslator(dict, locale, fallback = dict) {
  return function t(key, values = {}) {
    let entry = lookup(dict, key);
    if (entry === undefined) entry = lookup(fallback, key);
    if (entry === undefined) return key;
    const pluralBy = typeof values.count === 'number' ? values.count : (values.n ?? 0);
    if (entry && typeof entry === 'object') entry = pickPlural(entry, pluralBy, locale);
    return interpolate(entry, values, { isolate: true });
  };
}

/** Parses "YYYY-MM-DD" (or a longer ISO string) as a calendar day in UTC. */
function toUtcDay(value) {
  const iso = String(value).slice(0, 10);
  const [year, month, day] = iso.split('-').map(Number);
  if (!year || !month || !day) return null;
  return new Date(Date.UTC(year, month - 1, day));
}

/**
 * "09 Nov 2026" in English, "09 تشرين الثاني 2026" in Arabic: the month is
 * always spelled, never a run of digits. A pharmacist reads expiry off a box as
 * a month name, and 2026-11-09 against 2026-11-19 differ by one glyph in the
 * middle; the fixed-width day and year still line up down a column.
 */
export function formatDate(value, locale) {
  if (!value) return '—';
  const date = toUtcDay(value);
  if (!date) return String(value);
  return new Intl.DateTimeFormat(locale, { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(date);
}

/** Short day and month for chart axes: "21 Sep". */
export function formatDayMonth(value, locale) {
  const date = toUtcDay(value);
  if (!date) return String(value);
  return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(date);
}

/** A chat timestamp ("2026-10-21 18:40:12.345") in the reader's local time. */
export function formatDateTime(value, locale) {
  if (!value) return '';
  const date = new Date(String(value).replace(' ', 'T'));
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat(locale, { dateStyle: 'short', timeStyle: 'short' }).format(date);
}

/** Prices always carry two decimals. */
export function formatPrice(value, locale) {
  return new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(value));
}
