// Runs the reorder forecast in the background (UC-3: "the ML model runs in the background").
//
// It runs:
//   - every hour (FORECAST_CRON in server/.env),
//   - 5 seconds after the server starts,
//   - 10 seconds after a sale or a collected preorder, so reorder alerts react to real
//     sales within seconds instead of waiting for the next hour.
// Each run first fills any missing demo sales days, then trains, predicts and updates alerts.
import cron from 'node-cron';
import { config } from '../config.js';
import { runForecast } from '../services/forecastService.js';
import { fillMissingDemoSales } from '../services/demoSalesService.js';

const STARTUP_DELAY_MS = 5000;
const AFTER_SALE_DELAY_MS = 10000;

// True while a forecast is running, so two runs never overlap
let isForecastRunning = false;

// The timer waiting to run the forecast after a sale (null when none is waiting)
let afterSaleTimer = null;

// Runs the forecast once and prints a one-line summary. `reason` says why it ran
// (startup, cron, sale). Errors are printed, never thrown: the server keeps running
// even when the Python service is offline.
export async function runForecastNow(reason) {
  if (isForecastRunning) {
    return false; // another run is busy
  }
  isForecastRunning = true;
  try {
    const addedDays = await fillMissingDemoSales();
    if (addedDays > 0) {
      console.log(`[forecast:${reason}] filled ${addedDays} missing demo sales day(s)`);
    }
    const { summary } = await runForecast();
    console.log(
      `[forecast:${reason}] trained=${summary.trained} insufficient=${summary.insufficientData} ` +
        `created=${summary.alertsCreated} updated=${summary.alertsUpdated} cleared=${summary.alertsCleared}`
    );
  } catch (error) {
    console.warn(`[forecast:${reason}] skipped - ${error.message}`);
  } finally {
    isForecastRunning = false;
  }
  return true;
}

// Asks for a forecast run soon after a sale (called by routes/sales.js and routes/preorders.js).
// The run starts 10 seconds later, so several sales close together cause only ONE run.
export function requestForecastSoon() {
  if (afterSaleTimer) {
    return; // a run is already waiting and will include this sale too
  }
  afterSaleTimer = setTimeout(async () => {
    afterSaleTimer = null;
    const didRun = await runForecastNow('sale');
    // If another run was busy, try again shortly so this sale is not missed
    if (!didRun) {
      requestForecastSoon();
    }
  }, AFTER_SALE_DELAY_MS);
}

// Sets up the hourly run and the start-up run (called once by index.js).
export function startForecastJob() {
  if (!cron.validate(config.forecastCron)) {
    console.warn(`Invalid FORECAST_CRON "${config.forecastCron}" - forecast job not scheduled`);
    return;
  }
  cron.schedule(config.forecastCron, () => runForecastNow('cron'));
  setTimeout(() => runForecastNow('startup'), STARTUP_DELAY_MS);
  console.log(`Forecast job scheduled (${config.forecastCron})`);
}
