// Route under /api/interactions: the interaction check for a basket of medications
// (GP2 addition). Staff use it on the Dispense page, patients in their order.
import express from 'express';
import { requireLogin } from '../middleware/auth.js';
import { validate } from '../validation/validate.js';
import { interactionCheckSchema } from '../validation/medicationSchemas.js';
import { checkInteractions } from '../services/interactionService.js';

const router = express.Router();
router.use(requireLogin);

// POST /api/interactions/check - { medication_ids: [3, 16] }
// Answers { checked, interactions }. It is a POST because the list of ids is sent in the
// body; nothing is saved.
router.post('/check', async (req, res) => {
  const { medication_ids } = validate(interactionCheckSchema, req.body);
  const result = await checkInteractions(medication_ids);
  res.json(result);
});

export default router;
