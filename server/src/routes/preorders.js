// Routes under /api/preorders: patients ask for out-of-stock medications, staff fulfil them
// (GP2 addition). See services/preorderService.js for the whole flow.
import express from 'express';
import { ROLES, PREORDER_STATUS } from '../constants.js';
import { requireLogin, requireRole } from '../middleware/auth.js';
import { validate } from '../validation/validate.js';
import { newPreorderSchema, preorderStatusSchema, validateStatusFilter } from '../validation/saleSchemas.js';
import { parseId } from '../utils/parseId.js';
import * as preorderService from '../services/preorderService.js';
import { requestForecastSoon } from '../jobs/forecastJob.js';

const router = express.Router();
router.use(requireLogin);

// POST /api/preorders - a patient asks for a medication { medication_id, quantity, note }
router.post('/', requireRole(ROLES.PATIENT), async (req, res) => {
  const input = validate(newPreorderSchema, req.body);
  const preorder = await preorderService.createPreorder(req.user, input);
  res.status(201).json({ preorder });
});

// GET /api/preorders/mine - the patient's own requests
router.get('/mine', requireRole(ROLES.PATIENT), async (req, res) => {
  const preorders = await preorderService.getPreordersOfPatient(req.user.id);
  res.json({ preorders });
});

// POST /api/preorders/7/cancel - the patient cancels their own pending request
router.post('/:id/cancel', requireRole(ROLES.PATIENT), async (req, res) => {
  const preorder = await preorderService.cancelOwnPreorder(parseId(req.params.id, 'preorder'), req.user);
  res.json({ preorder });
});

// GET /api/preorders?status=pending - staff: every request, newest first (status filter optional)
router.get('/', requireRole(ROLES.STAFF), async (req, res) => {
  const status = validateStatusFilter(req.query.status);
  const preorders = await preorderService.getAllPreorders(status);
  res.json({ preorders });
});

// PATCH /api/preorders/7 - staff move a request on { status, delivery? }.
// `delivery` (with status "ready") is the stock lot that arrived for it.
router.patch('/:id', requireRole(ROLES.STAFF), async (req, res) => {
  const id = parseId(req.params.id, 'preorder');
  const { status } = validate(preorderStatusSchema, req.body);
  // req.body is undefined when the request has no body, hence the ?.
  const result = await preorderService.changePreorderStatus(id, status, req.body?.delivery);

  // A collected preorder is a sale: update the reorder alerts soon (see jobs/forecastJob.js)
  if (status === PREORDER_STATUS.COLLECTED) {
    requestForecastSoon();
  }

  res.json(result);
});

export default router;
