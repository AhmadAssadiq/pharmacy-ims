// Routes for the notification bell and for "tell me when it's back" (GP2 additions).
// Two routers, mounted in app.js under /api/notifications and /api/watches.
import express from 'express';
import { ROLES } from '../constants.js';
import { requireLogin, requireRole } from '../middleware/auth.js';
import { parseId } from '../utils/parseId.js';
import { getMedication } from '../services/medicationService.js';
import * as notificationService from '../services/notificationService.js';

// ---- /api/notifications ----

export const notificationsRouter = express.Router();
notificationsRouter.use(requireLogin);

// GET /api/notifications - what the bell shows for the signed-in user: { items, total }
notificationsRouter.get('/', async (req, res) => {
  const notifications = await notificationService.getNotifications(req.user);
  res.json(notifications);
});

// ---- /api/watches (patients only) ----

export const watchesRouter = express.Router();
watchesRouter.use(requireLogin, requireRole(ROLES.PATIENT));

// GET /api/watches - the ids of the medications I asked to be told about
watchesRouter.get('/', async (req, res) => {
  const medicationIds = await notificationService.getWatchedMedicationIds(req.user.id);
  res.json({ medication_ids: medicationIds });
});

// POST /api/watches/clear-available - I opened the "back in stock" notification:
// stop watching the medications that are back
watchesRouter.post('/clear-available', async (req, res) => {
  await notificationService.clearWatchesBackInStock(req.user.id);
  res.status(204).end();
});

// POST /api/watches/3 - tell me when medication 3 is back in stock
watchesRouter.post('/:medicationId', async (req, res) => {
  const medicationId = parseId(req.params.medicationId, 'medication');
  await getMedication(medicationId); // 404 if it does not exist
  await notificationService.watchMedication(req.user.id, medicationId);
  res.status(204).end();
});

// DELETE /api/watches/3 - I no longer want to be told about medication 3
watchesRouter.delete('/:medicationId', async (req, res) => {
  await notificationService.unwatchMedication(req.user.id, parseId(req.params.medicationId, 'medication'));
  res.status(204).end();
});
