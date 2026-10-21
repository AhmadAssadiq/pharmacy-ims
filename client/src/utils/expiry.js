import constants from '../../../shared/constants.json';

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Whole days from today until `dateStr` (negative once it has passed). */
export function daysUntil(dateStr) {
  const target = new Date(`${String(dateStr).slice(0, 10)}T00:00:00Z`);
  const base = new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00Z`);
  return Math.round((target - base) / MS_PER_DAY);
}

/** Badge text and modifier for a single stock lot's expiry date (FR 4). */
export function expiryStatus(dateStr) {
  const days = daysUntil(dateStr);
  if (days < 0) return { days, label: `Expired ${Math.abs(days)} d ago`, modifier: 'danger' };
  if (days <= constants.NEAR_EXPIRY_DAYS) return { days, label: `Expires in ${days} d`, modifier: 'warning' };
  return { days, label: 'OK', modifier: 'success' };
}

/**
 * Dates read as "09 Nov 2026", never as a bare ISO string.
 *
 * A pharmacist reads expiry off a box as a month name, and 2026-11-09 against
 * 2026-11-19 differ by one glyph in the middle of a run of digits. Spelling the
 * month removes that whole class of misread, and the fixed-width day and year
 * still line up down the column.
 */
export function formatDate(value) {
  if (!value) return '—';
  const iso = String(value).slice(0, 10);
  const [year, month, day] = iso.split('-');
  const name = MONTHS[Number(month) - 1];
  if (!name || !day || !year) return iso;
  return `${day} ${name} ${year}`;
}
