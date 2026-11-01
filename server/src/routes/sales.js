// Routes under /api/sales: dispensing (selling) medications. Staff only.
// A sale takes stock from the soonest-expiring lots first (FEFO) and is recorded in
// sales_history, which the forecast learns from (FR 6.1).
import express from 'express';
import { ROLES } from '../constants.js';
import { requireLogin, requireRole } from '../middleware/auth.js';
import { validate } from '../validation/validate.js';
import { saleLineSchema, validateSale } from '../validation/saleSchemas.js';
import * as salesService from '../services/salesService.js';
import { requestForecastSoon } from '../jobs/forecastJob.js';

const router = express.Router();
router.use(requireLogin, requireRole(ROLES.STAFF));

// GET /api/sales - the 20 most recent sales
router.get('/', async (req, res) => {
  const sales = await salesService.getRecentSales();
  res.json({ sales });
});

// GET /api/sales/preview?medication_id=3&quantity=5 - which lots one line would use (nothing is sold)
router.get('/preview', async (req, res) => {
  const line = validate(saleLineSchema, {
    medication_id: req.query.medication_id,
    quantity: req.query.quantity,
  });
  const preview = await salesService.previewSale(line);
  res.json({ preview });
});

// POST /api/sales - sell a basket { items: [{ medication_id, quantity }, ...] }.
// All-or-nothing: if one line cannot be filled, nothing is sold.
router.post('/', async (req, res) => {
  const lines = validateSale(req.body);
  const sale = await salesService.recordSale(lines);

  // Update the reorder alerts soon, so they reflect this sale (see jobs/forecastJob.js)
  requestForecastSoon();

  res.status(201).json({ sale });
});

export default router;
