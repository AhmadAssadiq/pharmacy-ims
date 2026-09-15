/**
 * /api/chat - chat sessions and message history (FR 5).
 */
const { Router } = require('express');
const chatController = require('../controllers/chatController');
const authenticate = require('../middleware/authenticate');
const requireRole = require('../middleware/requireRole');
const { ROLES } = require('../../../shared/constants.json');

const router = Router();

router.use(authenticate);

router.post('/sessions', requireRole(ROLES.PATIENT), chatController.openSession);
router.get('/sessions', requireRole(ROLES.STAFF), chatController.listSessions);
router.get('/sessions/:id/messages', chatController.listMessages);
router.post('/sessions/:id/messages', chatController.sendMessage);

module.exports = router;
