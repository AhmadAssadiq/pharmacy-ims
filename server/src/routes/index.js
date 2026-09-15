/**
 * Mounts every feature router under /api.
 */
const { Router } = require('express');
const authRoutes = require('./authRoutes');

const router = Router();

router.get('/health', (req, res) => res.json({ status: 'ok' }));
router.use('/auth', authRoutes);

module.exports = router;
