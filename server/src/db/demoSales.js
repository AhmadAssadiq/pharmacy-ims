/**
 * The demo pharmacy's daily sales per medicine (GP2 addition), read from
 * data/demo-sales.json. That file is built from the Kaggle "Global Pharmacy
 * Sales Dataset (2020-2025)" by data/prepare_demo_sales.py: cleaned, cut to
 * 2022-2025 (2020-2021 are the COVID years), scaled to one pharmacy and given
 * each medicine's own seasons, then carried on to the end of 2029.
 *
 * It is indexed by calendar date, so whenever the seed runs the history ends
 * on a real "yesterday" and its months and seasons fall where they belong.
 */
const DATA = require('../../../data/demo-sales.json');

const DAY_MS = 86_400_000;

function dayNumber(isoDate) {
  const [year, month, day] = isoDate.split('-').map(Number);
  return Date.UTC(year, month - 1, day) / DAY_MS;
}

function addDays(isoDate, days) {
  return new Date((dayNumber(isoDate) + days) * DAY_MS).toISOString().slice(0, 10);
}

/** Every YYYY-MM-DD from `from` to `to`, both included. */
function datesBetween(from, to) {
  const dates = [];
  for (let n = dayNumber(from); n <= dayNumber(to); n += 1) {
    dates.push(new Date(n * DAY_MS).toISOString().slice(0, 10));
  }
  return dates;
}

function hasSeries(series, data = DATA) {
  return Object.prototype.hasOwnProperty.call(data.medicines, series);
}

/** Units of `series` sold on `isoDate`, or null outside the file's dates. */
function unitsOn(series, isoDate, data = DATA) {
  if (!hasSeries(series, data)) return null;
  const index = dayNumber(isoDate) - dayNumber(data.first_day);
  const values = data.medicines[series];
  return index >= 0 && index < values.length ? values[index] : null;
}

/** Average units a day over the `days` days up to and including `lastDate`. */
function recentAverage(series, lastDate, days = 28, data = DATA) {
  const values = datesBetween(addDays(lastDate, 1 - days), lastDate)
    .map((date) => unitsOn(series, date, data))
    .filter((value) => value !== null);
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

module.exports = {
  firstDay: DATA.first_day,
  lastDay: DATA.last_day,
  addDays,
  datesBetween,
  hasSeries,
  unitsOn,
  recentAverage,
};
