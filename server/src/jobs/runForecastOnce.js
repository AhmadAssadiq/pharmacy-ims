// Runs the reorder forecast once and prints the result for each medication.
// Handy for demos and testing:   npm run forecast -w server
import { db } from '../db.js';
import { runForecast } from '../services/forecastService.js';
import { fillMissingDemoSales } from '../services/demoSalesService.js';

try {
  // Fill any demo sales days missing since the last seed, like the background job does
  const addedDays = await fillMissingDemoSales();
  if (addedDays > 0) {
    console.log(`Filled ${addedDays} missing demo sales day(s)`);
  }

  const { summary, predictions } = await runForecast();
  console.log('Summary:', summary);

  for (const prediction of predictions) {
    let result;
    if (prediction.status === 'alert') {
      result = `ALERT in ${prediction.days_until_threshold} day(s) (${prediction.predicted_date})`;
    } else if (prediction.status === 'ok') {
      result = 'ok';
    } else {
      result = `no alert (${prediction.reason || 'insufficient data'})`;
    }
    console.log(`  medication ${prediction.medication_id}: ${result}`);
  }
} catch (error) {
  console.error('Forecast failed:', error.message);
  process.exitCode = 1;
} finally {
  // Close the database connections so the script can exit
  await db.end();
}
