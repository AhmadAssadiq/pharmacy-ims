/**
 * Mounts every feature router under /api.
 */
const { Router } = require('express');
const authRoutes = require('./authRoutes');
const medicationRoutes = require('./medicationRoutes');
const chatRoutes = require('./chatRoutes');

const router = Router();

router.get('/health', (req, res) => res.json({ status: 'ok' }));
router.use('/auth', authRoutes);
router.use('/medications', medicationRoutes);
router.use('/chat', chatRoutes);

module.exports = router;
