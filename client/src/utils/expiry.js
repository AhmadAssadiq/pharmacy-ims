import constants from '../../../shared/constants.json';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

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

export function formatDate(value) {
  return value ? String(value).slice(0, 10) : '—';
}
