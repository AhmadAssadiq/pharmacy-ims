/**
 * /api/forecast - staff-only demand history and prediction for one medication,
 * used by the forecast charts. Loaded on demand, one medication at a time.
 */
const { Router } = require('express');
const forecastController = require('../controllers/forecastController');
const authenticate = require('../middleware/authenticate');
const requireRole = require('../middleware/requireRole');
const { ROLES } = require('../../../shared/constants.json');

const router = Router();

router.use(authenticate, requireRole(ROLES.STAFF));

router.get('/:medicationId', forecastController.get);

module.exports = router;
