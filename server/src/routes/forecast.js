// Routes under /api/forecast and /api/alerts (FR 6.2, UC-3). Staff only.
import express from 'express';
import { ROLES } from '../constants.js';
import { requireLogin, requireRole } from '../middleware/auth.js';
import { parseId } from '../utils/parseId.js';
import * as forecastService from '../services/forecastService.js';

// /api/forecast - charts for one medication
export const forecastRouter = express.Router();
forecastRouter.use(requireLogin, requireRole(ROLES.STAFF));

// GET /api/forecast/3 - sales history and forecast of one medication (retrains its model first)
forecastRouter.get('/:medicationId', async (req, res) => {
  const forecast = await forecastService.getMedicationForecast(parseId(req.params.medicationId, 'medication'));
  res.json({ forecast });
});

// /api/alerts - the reorder alerts the forecast job creates
export const alertsRouter = express.Router();
alertsRouter.use(requireLogin, requireRole(ROLES.STAFF));

// GET /api/alerts - active reorder alerts, most urgent first
alertsRouter.get('/', async (req, res) => {
  const alerts = await forecastService.getActiveAlerts();
  res.json({ alerts });
});

// PATCH /api/alerts/5/dismiss - staff dismiss an alert
alertsRouter.patch('/:id/dismiss', async (req, res) => {
  const alert = await forecastService.dismissAlert(parseId(req.params.id, 'alert'));
  res.json({ alert });
});
