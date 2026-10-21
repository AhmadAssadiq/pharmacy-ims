import constants from '../../../shared/constants.json';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Whole days from today until `dateStr` (negative once it has passed). */
export function daysUntil(dateStr) {
  const target = new Date(`${String(dateStr).slice(0, 10)}T00:00:00Z`);
  const base = new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00Z`);
  return Math.round((target - base) / MS_PER_DAY);
}

/**
 * Where a single stock lot stands on expiry (FR 4): `kind` is expired, soon
 * or ok, `modifier` is the badge tone. The wording lives in the dictionaries.
 * Dates are formatted by useI18n().formatDate, in the active language.
 */
export function expiryStatus(dateStr) {
  const days = daysUntil(dateStr);
  if (days < 0) return { days, kind: 'expired', modifier: 'danger' };
  if (days <= constants.NEAR_EXPIRY_DAYS) return { days, kind: 'soon', modifier: 'warning' };
  return { days, kind: 'ok', modifier: 'success' };
}
