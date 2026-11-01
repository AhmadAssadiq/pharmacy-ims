// Routes under /api/medications: the medication catalogue and its stock lots (FR 2.1, FR 3, UC-1).
// Only staff can use these, so every route checks login + role first.
// Selling (which also changes stock) is under /api/sales.
import express from 'express';
import { ROLES } from '../constants.js';
import { requireLogin, requireRole } from '../middleware/auth.js';
import { validate } from '../validation/validate.js';
import { medicationSchema, newMedicationSchema, batchSchema } from '../validation/medicationSchemas.js';
import { parseId } from '../utils/parseId.js';
import * as medicationService from '../services/medicationService.js';

const router = express.Router();
router.use(requireLogin, requireRole(ROLES.STAFF));

// GET /api/medications - every medication with its stock and warning flags
router.get('/', async (req, res) => {
  const medications = await medicationService.getAllMedications();
  res.json({ medications });
});

// POST /api/medications - add a new medication together with its first stock lot
router.post('/', async (req, res) => {
  const input = validate(newMedicationSchema, req.body);
  const medication = await medicationService.addMedication(input);
  res.status(201).json({ medication });
});

// PATCH /api/medications/batches/12 - correct a stock lot { quantity, expiry_date, batch_number }
router.patch('/batches/:batchId', async (req, res) => {
  const batchId = parseId(req.params.batchId, 'batch');
  const input = validate(batchSchema, req.body);
  const batch = await medicationService.updateBatch(batchId, input);
  res.json({ batch });
});

// DELETE /api/medications/batches/12 - remove a stock lot
router.delete('/batches/:batchId', async (req, res) => {
  await medicationService.deleteBatch(parseId(req.params.batchId, 'batch'));
  res.status(204).end();
});

// GET /api/medications/3 - one medication
router.get('/:id', async (req, res) => {
  const medication = await medicationService.getMedication(parseId(req.params.id, 'medication'));
  res.json({ medication });
});

// PUT /api/medications/3 - change a medication's catalogue details
router.put('/:id', async (req, res) => {
  const id = parseId(req.params.id, 'medication');
  const input = validate(medicationSchema, req.body);
  const medication = await medicationService.updateMedication(id, input);
  res.json({ medication });
});

// DELETE /api/medications/3 - delete a medication (its lots and sales history go with it)
router.delete('/:id', async (req, res) => {
  await medicationService.deleteMedication(parseId(req.params.id, 'medication'));
  res.status(204).end();
});

// GET /api/medications/3/batches - the stock lots of a medication
router.get('/:id/batches', async (req, res) => {
  const batches = await medicationService.getBatches(parseId(req.params.id, 'medication'));
  res.json({ batches });
});

// POST /api/medications/3/batches - receive a delivery as a new stock lot (UC-1)
router.post('/:id/batches', async (req, res) => {
  const id = parseId(req.params.id, 'medication');
  const input = validate(batchSchema, req.body);
  const batch = await medicationService.addBatch(id, input);
  res.status(201).json({ batch });
});

export default router;
