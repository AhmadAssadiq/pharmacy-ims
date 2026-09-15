/**
 * Runs the reorder forecast a single time and prints the result.
 * Useful for demos and testing: npm run forecast
 */
const pool = require('../config/db');
const forecastService = require('../services/forecastService');

forecastService
  .runForecast()
  .then(({ summary, predictions }) => {
    console.log('Summary:', summary);
    for (const p of predictions) {
      const detail =
        p.status === 'alert'
          ? `ALERT in ${p.days_until_threshold} day(s) (${p.predicted_date})`
          : p.status === 'ok'
            ? 'ok'
            : `no alert (${p.reason || 'insufficient data'})`;
      console.log(`  medication ${p.medication_id}: ${detail}`);
    }
  })
  .catch((err) => {
    console.error('Forecast failed:', err.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
