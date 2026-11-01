// Reorder alerts and forecast charts (FR 6, FR 6.1, FR 6.2, UC-3).
//
// The forecasting itself happens in the Python service (ml-service/). This file talks to it
// over HTTP:
//   POST /train   - "here is each medication's sales history, train a model for each"
//   POST /predict - "with this much stock, when will each medication fall below its threshold?"
//
// runForecast() is the background job (hourly, at start-up and soon after a sale):
//   1. send every medication's sales history to /train
//   2. ask /predict which medications will drop below their reorder threshold within 7 days
//   3. create, update or clear rows in reorder_alerts to match.
// Medications with too little history get no model and therefore no alert (UC-3 alternative flow).
import createError from 'http-errors';
import { db } from '../db.js';
import { config } from '../config.js';
import { ERROR_CODES, FORECAST_HORIZON_DAYS } from '../constants.js';
import { todayAsText, addDaysToDate } from '../utils/dates.js';
import { getAllMedications, findMedicationById } from './medicationService.js';
import { getAllSalesHistory, getSalesHistoryOfMedication } from './salesService.js';

// Sends `body` to the ML service at `path` and returns its JSON answer.
async function callMlService(path, body) {
  const response = await fetch(`${config.mlServiceUrl}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(`ML service ${path} responded ${response.status}`);
  }
  return response.json();
}

// ----------------------------------------------------------------------------
// reorder_alerts table
// ----------------------------------------------------------------------------

// The SELECT used for every alert read. The current quantity is the sum of the medication's
// unexpired lots (expired units cannot be sold, so they must not count).
const SELECT_ALERTS = `
  SELECT a.id, a.medication_id, m.name AS medication_name,
         CAST(COALESCE((SELECT SUM(b.quantity) FROM medication_batches b
                        WHERE b.medication_id = m.id AND b.expiry_date >= CURDATE()), 0) AS SIGNED)
           AS current_quantity,
         m.low_stock_threshold,
         a.predicted_date, a.days_until_threshold, a.status
  FROM reorder_alerts a JOIN medications m ON m.id = a.medication_id`;

// The active alert of a medication, or null.
async function findActiveAlert(medicationId) {
  const [rows] = await db.query(`${SELECT_ALERTS} WHERE a.medication_id = ? AND a.status = 'active' LIMIT 1`, [
    medicationId,
  ]);
  return rows[0] || null;
}

// The most recently dismissed alert of a medication, or null.
async function findLastDismissedAlert(medicationId) {
  const [rows] = await db.query(
    `${SELECT_ALERTS} WHERE a.medication_id = ? AND a.status = 'dismissed' ORDER BY a.id DESC LIMIT 1`,
    [medicationId]
  );
  return rows[0] || null;
}

// Every active alert for the staff dashboard, most urgent first.
export async function getActiveAlerts() {
  const [rows] = await db.query(
    `${SELECT_ALERTS} WHERE a.status = 'active' ORDER BY a.days_until_threshold ASC, m.name ASC`
  );
  return rows;
}

// Staff dismiss an alert. Returns the dismissed alert, or throws 404.
export async function dismissAlert(id) {
  const [result] = await db.query(`UPDATE reorder_alerts SET status = 'dismissed' WHERE id = ? AND status = 'active'`, [
    id,
  ]);
  if (result.affectedRows === 0) {
    throw createError(404, 'Active alert not found', { code: ERROR_CODES.ALERT_NOT_FOUND });
  }
  const [rows] = await db.query(`${SELECT_ALERTS} WHERE a.id = ?`, [id]);
  return rows[0];
}

// ----------------------------------------------------------------------------
// The background forecast
// ----------------------------------------------------------------------------

// Trains every medication's model, predicts the next 7 days and updates reorder_alerts.
// Returns { summary, trainResults, predictions }.
export async function runForecast() {
  const medications = await getAllMedications();
  const sales = await getAllSalesHistory();

  // Group the sales rows by medication: { medicationId: [{ date, quantity_sold }, ...] }
  const salesByMedication = {};
  for (const row of sales) {
    if (!salesByMedication[row.medication_id]) {
      salesByMedication[row.medication_id] = [];
    }
    salesByMedication[row.medication_id].push({ date: row.date, quantity_sold: row.quantity_sold });
  }

  // 1. Train one model per medication on its own sales history (FR 6.1)
  const trainRequest = { medications: [] };
  for (const medication of medications) {
    trainRequest.medications.push({ medication_id: medication.id, sales: salesByMedication[medication.id] || [] });
  }
  const { results: trainResults } = await callMlService('/train', trainRequest);

  // 2. Predict, from the current stock, which medications will fall below their threshold (FR 6.2)
  const predictRequest = {
    as_of_date: todayAsText(),
    horizon_days: FORECAST_HORIZON_DAYS,
    medications: medications.map((medication) => ({
      medication_id: medication.id,
      current_quantity: medication.quantity,
      threshold: medication.low_stock_threshold,
    })),
  };
  const { results: predictions } = await callMlService('/predict', predictRequest);

  // 3. Make reorder_alerts match the predictions, counting what changed
  const summary = {
    trained: trainResults.filter((result) => result.trained).length,
    insufficientData: 0,
    alertsCreated: 0,
    alertsUpdated: 0,
    alertsCleared: 0,
    alertsSuppressed: 0,
  };

  for (const prediction of predictions) {
    const medicationId = prediction.medication_id;
    const activeAlert = await findActiveAlert(medicationId);

    // Not enough history to predict: no alert (UC-3 alternative flow)
    if (prediction.status === 'insufficient_data') {
      summary.insufficientData += 1;
      continue;
    }

    if (prediction.status === 'alert') {
      // Already has an active alert: refresh its dates
      if (activeAlert) {
        await db.query('UPDATE reorder_alerts SET predicted_date = ?, days_until_threshold = ? WHERE id = ?', [
          prediction.predicted_date,
          prediction.days_until_threshold,
          activeAlert.id,
        ]);
        summary.alertsUpdated += 1;
        continue;
      }

      // Staff already dismissed this exact prediction: do not raise it again until it changes
      const dismissedAlert = await findLastDismissedAlert(medicationId);
      if (dismissedAlert && String(dismissedAlert.predicted_date).slice(0, 10) === prediction.predicted_date) {
        summary.alertsSuppressed += 1;
        continue;
      }

      // A new alert
      await db.query('INSERT INTO reorder_alerts (medication_id, predicted_date, days_until_threshold) VALUES (?, ?, ?)', [
        medicationId,
        prediction.predicted_date,
        prediction.days_until_threshold,
      ]);
      summary.alertsCreated += 1;
    } else if (activeAlert) {
      // Stock is fine again: remove the active alert
      await db.query(`DELETE FROM reorder_alerts WHERE medication_id = ? AND status = 'active'`, [medicationId]);
      summary.alertsCleared += 1;
    }
  }

  return { summary, trainResults, predictions };
}

// ----------------------------------------------------------------------------
// The Forecast page (charts for one medication)
// ----------------------------------------------------------------------------

// Adds up sales per day: [{ date, quantity_sold }] with one entry per date, oldest first.
// (Several sales of the same medication on one day become one total.)
function totalSalesPerDay(rows) {
  const totals = {};
  for (const row of rows) {
    const date = String(row.date).slice(0, 10);
    totals[date] = (totals[date] || 0) + Number(row.quantity_sold);
  }
  const days = [];
  for (const date of Object.keys(totals).sort()) {
    days.push({ date, quantity_sold: totals[date] });
  }
  return days;
}

// How many days from the day after `dateText` to the last day of the 3rd month after it.
// The monthly chart's outlook runs that far (in November: to the end of February).
export function outlookDays(dateText) {
  const [year, month] = dateText.split('-').map(Number);
  // Date.UTC(year, month + 3, 0) is "day 0" of the 4th month = the last day of the 3rd month
  const lastDay = Date.UTC(year, month + 3, 0);
  const millisecondsPerDay = 86400000;
  return Math.round((lastDay - Date.parse(`${dateText}T00:00:00Z`)) / millisecondsPerDay);
}

// Sales history and forecast of one medication, for the charts on the Forecast page.
// It retrains the model first, so the chart includes sales made seconds ago.
// When the model uses seasons (a year or more of history), it also returns an `outlook`
// of predicted daily demand for the monthly chart. Only the 7-day forecast drives alerts.
export async function getMedicationForecast(medicationId) {
  const medication = await findMedicationById(medicationId);
  if (!medication) {
    throw createError(404, 'Medication not found', { code: ERROR_CODES.MEDICATION_NOT_FOUND });
  }

  const history = totalSalesPerDay(await getSalesHistoryOfMedication(medicationId));
  const today = todayAsText();

  // 1. Retrain this medication's model on its latest history
  const { results: trainResults } = await callMlService('/train', {
    medications: [{ medication_id: medicationId, sales: history }],
  });
  const training = trainResults[0] || {};

  // 2. Predict the next 7 days from the current stock
  const { results: predictions } = await callMlService('/predict', {
    as_of_date: today,
    horizon_days: FORECAST_HORIZON_DAYS,
    medications: [
      { medication_id: medicationId, current_quantity: medication.quantity, threshold: medication.low_stock_threshold },
    ],
  });
  const prediction = predictions[0] || { status: 'insufficient_data' };

  // 3. Seasonal models only: predicted demand for the monthly chart (to the end of the 3rd month ahead)
  let outlook = [];
  if (training.seasonal) {
    const { results } = await callMlService('/predict', {
      as_of_date: today,
      horizon_days: outlookDays(today),
      medications: [{ medication_id: medicationId, current_quantity: 0, threshold: 0 }],
    });
    const dailyDemand = (results[0] && results[0].daily_demand) || [];
    outlook = dailyDemand.map((demand, index) => ({
      date: addDaysToDate(today, index + 1),
      predicted_demand: Math.round(demand * 100) / 100,
    }));
  }

  // 4. Walk the predicted demand forward to show how the stock runs down - this is
  //    exactly what the reorder alert is based on
  let stockLeft = Number(medication.quantity);
  const forecast = (prediction.daily_demand || []).map((demand, index) => {
    stockLeft = Math.max(stockLeft - demand, 0);
    return {
      date: addDaysToDate(today, index + 1),
      predicted_demand: Math.round(demand * 100) / 100,
      projected_stock: Math.round(stockLeft * 100) / 100,
    };
  });

  return {
    medication: {
      id: medication.id,
      name: medication.name,
      quantity: medication.quantity,
      low_stock_threshold: medication.low_stock_threshold,
    },
    as_of_date: today,
    history,
    forecast,
    outlook,
    seasonal: Boolean(training.seasonal),
    status: prediction.status,
    days_until_threshold: prediction.days_until_threshold ?? null,
    predicted_date: prediction.predicted_date ?? null,
    trained: Boolean(training.trained),
    reason: training.reason || prediction.reason || null,
    history_days: training.history_days ?? history.length,
    mae: training.mae ?? null,
  };
}
