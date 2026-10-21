/**
 * /api/preorders - patient requests for out-of-stock medications (GP2 addition).
 * Patients create, list and cancel their own; staff list all and move them along.
 */
const { Router } = require('express');
const preorderController = require('../controllers/preorderController');
const authenticate = require('../middleware/authenticate');
const requireRole = require('../middleware/requireRole');
const { ROLES } = require('../../../shared/constants.json');

const router = Router();

router.use(authenticate);

router.post('/', requireRole(ROLES.PATIENT), preorderController.create);
router.get('/mine', requireRole(ROLES.PATIENT), preorderController.listMine);
router.post('/:id/cancel', requireRole(ROLES.PATIENT), preorderController.cancel);

router.get('/', requireRole(ROLES.STAFF), preorderController.list);
router.patch('/:id', requireRole(ROLES.STAFF), preorderController.updateStatus);

module.exports = router;
