/**
 * /api/medications - staff-only catalog management (FR 2.1, FR 3).
 */
const { Router } = require('express');
const medicationController = require('../controllers/medicationController');
const authenticate = require('../middleware/authenticate');
const requireRole = require('../middleware/requireRole');
const { ROLES } = require('../../../shared/constants.json');

const router = Router();

router.use(authenticate, requireRole(ROLES.STAFF));

router.get('/', medicationController.list);
router.post('/', medicationController.create);
router.get('/:id', medicationController.get);
router.put('/:id', medicationController.update);
router.patch('/:id/quantity', medicationController.updateQuantity);
router.delete('/:id', medicationController.remove);

module.exports = router;
