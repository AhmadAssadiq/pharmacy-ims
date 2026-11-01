// Route under /api/availability: which medications are in stock (FR 7).
// Any logged-in user may use it. Only "in stock: yes/no" is shown - never quantities,
// prices or suppliers.
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
