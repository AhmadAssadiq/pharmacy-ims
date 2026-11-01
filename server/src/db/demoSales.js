// Reads the demo pharmacy's daily sales from data/demo-sales.json (GP2 addition).
//
// That file is made from the Kaggle "Global Pharmacy Sales Dataset (2020-2025)" by
// data/prepare_demo_sales.py: cleaned, cut to 2022-2025 (2020-2021 were the COVID years),
// scaled to one pharmacy, given each medicine's own seasons, and continued to the end of 2029.
//
// It holds one number per medicine per day (units sold), starting on its first_day:
//   { "first_day": "2022-01-01", "medicines": { "Amoxicillin": [6, 5, 8, ...], ... } }
// It is read by calendar date, so whenever the seed runs, the history ends on a real
// "yesterday" and the months and seasons fall where they belong.
import demoSalesData from '../../../data/demo-sales.json' with { type: 'json' };
import { daysBetween, addDaysToDate, listDatesBetween } from '../utils/dates.js';

export const DEMO_FIRST_DAY = demoSalesData.first_day;
export const DEMO_LAST_DAY = demoSalesData.last_day;

// True when the file has a series with this name (e.g. 'Amoxicillin').
export function hasDemoSeries(series) {
  return Object.hasOwn(demoSalesData.medicines, series);
}

// Units of `series` sold on `dateText`, or null when the date is outside the file.
export function getDemoUnits(series, dateText) {
  if (!hasDemoSeries(series)) {
    return null;
  }
  // The position in the list is the number of days since the first day
  const index = daysBetween(DEMO_FIRST_DAY, dateText);
  const values = demoSalesData.medicines[series];
  if (index < 0 || index >= values.length) {
    return null;
  }
  return values[index];
}

// Average units sold per day over the `days` days ending on `lastDateText` (included).
export function getRecentAverage(series, lastDateText, days = 28) {
  const firstDateText = addDaysToDate(lastDateText, 1 - days);
  let total = 0;
  let count = 0;
  for (const dateText of listDatesBetween(firstDateText, lastDateText)) {
    const units = getDemoUnits(series, dateText);
    if (units !== null) {
      total += units;
      count += 1;
    }
  }
  return count > 0 ? total / count : 0;
}
