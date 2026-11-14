// Route under /api/availability: the medications a patient can see and order (FR 7).
// Any logged-in user may use it. It shows "in stock: yes/no", the price and whether a
// prescription is needed - never quantities or suppliers.
import express from 'express';
import { requireLogin } from '../middleware/auth.js';
import { getAvailability } from '../services/medicationService.js';

const router = express.Router();

// GET /api/availability
router.get('/', requireLogin, async (req, res) => {
  const medications = await getAvailability();
  res.json({ medications });
});

export default router;
