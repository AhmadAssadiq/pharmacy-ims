const { Router } = require('express');
const authController = require('../controllers/authController');
const authenticate = require('../middleware/authenticate');

const router = Router();

router.post('/register', authController.register);
router.post('/login', authController.login);
router.post('/forgot-password', authController.forgotPassword);
router.post('/reset-password', authController.resetPassword);
router.get('/me', authenticate, authController.me);
router.delete('/me', authenticate, authController.deleteMe);

module.exports = router;
