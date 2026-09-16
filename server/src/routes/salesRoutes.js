/**
 * /api/sales - staff-only dispensing. Recording a sale depletes stock
 * nearest-expiry-first and feeds `sales_history`, which trains the forecast.
 */
const { Router } = require('express');
const salesController = require('../controllers/salesController');
const authenticate = require('../middleware/authenticate');
const requireRole = require('../middleware/requireRole');
const { ROLES } = require('../../../shared/constants.json');

const router = Router();

router.use(authenticate, requireRole(ROLES.STAFF));

router.get('/', salesController.list);
router.get('/preview', salesController.preview);
router.post('/', salesController.create);

module.exports = router;
