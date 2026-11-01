// Small date helpers. Dates are handled as text in the form 'YYYY-MM-DD'
// (for example '2026-11-01'), the same format MySQL uses for DATE columns.

// Today's date as 'YYYY-MM-DD' (UTC).
export function todayAsText() {
  return new Date().toISOString().slice(0, 10);
}

// The date `days` days after `dateText` (use a negative number to go back).
// Example: addDaysToDate('2026-11-01', 1) returns '2026-11-02'.
export function addDaysToDate(dateText, days) {
  const date = new Date(`${dateText}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

// How many days from `fromDateText` to `toDateText` (negative if `toDateText` is earlier).
// Example: daysBetween('2026-11-01', '2026-11-11') returns 10.
export function daysBetween(fromDateText, toDateText) {
  const from = new Date(`${String(fromDateText).slice(0, 10)}T00:00:00Z`);
  const to = new Date(`${String(toDateText).slice(0, 10)}T00:00:00Z`);
  const millisecondsPerDay = 24 * 60 * 60 * 1000;
  return Math.round((to - from) / millisecondsPerDay);
}

// Every date from `firstDateText` to `lastDateText`, both included, as a list.
// Example: listDatesBetween('2024-02-28', '2024-03-01')
//          returns ['2024-02-28', '2024-02-29', '2024-03-01'].
export function listDatesBetween(firstDateText, lastDateText) {
  const dates = [];
  let current = firstDateText;
  while (current <= lastDateText) {
    dates.push(current);
    current = addDaysToDate(current, 1);
  }
  return dates;
}
