/**
 * Reorder-alert forecasting (FR 6, FR 6.1, FR 6.2, UC-3).
 *
 * runForecast():
 *   1. sends every medication's sales history to the ML service (/train)
 *   2. asks it which medications will fall below the safe threshold within
 *      the next 7 days (/predict), given the current stock levels
 *   3. writes / refreshes an active row in `reorder_alerts` for each predicted
 *      breach and clears active alerts for medications that are fine again.
 *   Medications with insufficient history get no alert (UC-3 alt. flow).
 */
const env = require('../config/env');
const medicationModel = require('../models/medicationModel');
const salesHistoryModel = require('../models/salesHistoryModel');
const reorderAlertModel = require('../models/reorderAlertModel');
const HttpError = require('../utils/httpError');
const { LOW_STOCK_THRESHOLD, FORECAST_HORIZON_DAYS } = require('../../../shared/constants.json');

async function callMl(path, body) {
  const response = await fetch(`${env.mlServiceUrl}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`ML service ${path} responded ${response.status}`);
  return response.json();
}

function groupSalesByMedication(sales) {
  const grouped = new Map();
  for (const row of sales) {
    if (!grouped.has(row.medication_id)) grouped.set(row.medication_id, []);
    grouped.get(row.medication_id).push({ date: row.date, quantity_sold: row.quantity_sold });
  }
  return grouped;
}

async function runForecast() {
  const [medications, sales] = await Promise.all([medicationModel.findAll(), salesHistoryModel.findAll()]);
  const salesByMed = groupSalesByMedication(sales);

  // 1. Train one model per medication on its historical sales (FR 6.1).
  const trainPayload = {
    medications: medications.map((m) => ({ medication_id: m.id, sales: salesByMed.get(m.id) || [] })),
  };
  const { results: trainResults } = await callMl('/train', trainPayload);

  // 2. Predict threshold breaches from the current stock (FR 6.2).
  const predictPayload = {
    as_of_date: new Date().toISOString().slice(0, 10),
    horizon_days: FORECAST_HORIZON_DAYS,
    medications: medications.map((m) => ({
      medication_id: m.id,
      current_quantity: m.quantity,
      threshold: LOW_STOCK_THRESHOLD,
    })),
  };
  const { results: predictions } = await callMl('/predict', predictPayload);

  // 3. Synchronise reorder_alerts with the predictions.
  const summary = {
    trained: 0,
    insufficientData: 0,
    alertsCreated: 0,
    alertsUpdated: 0,
    alertsCleared: 0,
    alertsSuppressed: 0,
  };
  summary.trained = trainResults.filter((r) => r.trained).length;

  for (const prediction of predictions) {
    const medicationId = prediction.medication_id;
    const active = await reorderAlertModel.findActiveByMedicationId(medicationId);

    if (prediction.status === 'insufficient_data') {
      summary.insufficientData += 1;
      continue; // no prediction possible -> no alert
    }

    if (prediction.status === 'alert') {
      const values = {
        predictedDate: prediction.predicted_date,
        daysUntilThreshold: prediction.days_until_threshold,
      };
      if (active) {
        await reorderAlertModel.updatePrediction(active.id, values);
        summary.alertsUpdated += 1;
        continue;
      }
      // Staff dismissed this exact prediction already - do not raise it again
      // until the forecast changes.
      const dismissed = await reorderAlertModel.findLatestDismissedByMedicationId(medicationId);
      if (dismissed && String(dismissed.predicted_date).slice(0, 10) === values.predictedDate) {
        summary.alertsSuppressed += 1;
        continue;
      }
      await reorderAlertModel.create({ medicationId, ...values });
      summary.alertsCreated += 1;
    } else if (active) {
      await reorderAlertModel.deleteActiveByMedicationId(medicationId);
      summary.alertsCleared += 1;
    }
  }

  return { summary, trainResults, predictions };
}

async function listActiveAlerts() {
  return reorderAlertModel.findActive();
}

async function dismissAlert(id) {
  const dismissed = await reorderAlertModel.dismiss(id);
  if (!dismissed) throw new HttpError(404, 'Active alert not found');
  return reorderAlertModel.findById(id);
}

module.exports = { runForecast, listActiveAlerts, dismissAlert };
