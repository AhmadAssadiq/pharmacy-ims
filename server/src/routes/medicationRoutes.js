/**
 * /api/medications - staff-only catalog and stock management (FR 2.1, FR 3).
 * Stock is changed by adding or adjusting batches (UC-1); dispensing lives
 * under /api/sales.
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

router.patch('/batches/:batchId', medicationController.updateBatch);
router.delete('/batches/:batchId', medicationController.removeBatch);

router.get('/:id', medicationController.get);
router.put('/:id', medicationController.update);
router.delete('/:id', medicationController.remove);
router.get('/:id/batches', medicationController.listBatches);
router.post('/:id/batches', medicationController.addBatch);

module.exports = router;
