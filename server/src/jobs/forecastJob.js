/**
 * Background scheduler that runs the reorder forecast on a cron schedule
 * (FORECAST_CRON, default hourly) and once shortly after start-up, so the
 * ML model "runs in the background" as described in UC-3.
 */
const cron = require('node-cron');
const env = require('../config/env');
const forecastService = require('../services/forecastService');

const STARTUP_DELAY_MS = 5_000;
let running = false;

async function runForecastSafely(trigger) {
  if (running) return; // never overlap two runs
  running = true;
  try {
    const { summary } = await forecastService.runForecast();
    console.log(
      `[forecast:${trigger}] trained=${summary.trained} insufficient=${summary.insufficientData} ` +
        `created=${summary.alertsCreated} updated=${summary.alertsUpdated} cleared=${summary.alertsCleared}`
    );
  } catch (err) {
    console.warn(`[forecast:${trigger}] skipped - ${err.message}`);
  } finally {
    running = false;
  }
}

function scheduleForecastJob() {
  if (!cron.validate(env.forecastCron)) {
    console.warn(`Invalid FORECAST_CRON "${env.forecastCron}" - forecast job not scheduled`);
    return;
  }
  cron.schedule(env.forecastCron, () => runForecastSafely('cron'));
  setTimeout(() => runForecastSafely('startup'), STARTUP_DELAY_MS);
  console.log(`Forecast job scheduled (${env.forecastCron})`);
}

module.exports = { scheduleForecastJob, runForecastSafely };
