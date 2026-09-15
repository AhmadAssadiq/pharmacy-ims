/**
 * /api/availability - read-only in-stock / out-of-stock list for signed-in users (FR 7).
 */
const { Router } = require('express');
const availabilityController = require('../controllers/availabilityController');
const authenticate = require('../middleware/authenticate');

const router = Router();

router.get('/', authenticate, availabilityController.list);

module.exports = router;
