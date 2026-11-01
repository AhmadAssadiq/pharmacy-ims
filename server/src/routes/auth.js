// Routes under /api/auth: register, log in, forgot/reset password, and the logged-in
// user's own account (FR 1).
import express from 'express';
import createError from 'http-errors';
import { rateLimit } from 'express-rate-limit';
import { ERROR_CODES } from '../constants.js';
import { requireLogin } from '../middleware/auth.js';
import { validate } from '../validation/validate.js';
import {
  registerSchema,
  loginSchema,
  phoneSchema,
  deleteAccountSchema,
  forgotPasswordSchema,
} from '../validation/authSchemas.js';
import * as authService from '../services/authService.js';
import * as passwordResetService from '../services/passwordResetService.js';
import { disconnectUser } from '../socket/chatSocket.js';

const router = express.Router();

// ----------------------------------------------------------------------------
// Rate limits for the password reset routes (express-rate-limit library)
// ----------------------------------------------------------------------------

// Builds a limiter: at most `limit` requests per 15 minutes for each key.
// `keyGenerator` decides what is counted (the default counts per IP address).
function createResetLimiter(limit, keyGenerator) {
  return rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    limit: limit,
    keyGenerator: keyGenerator,
    standardHeaders: false,
    legacyHeaders: false,
    // When the limit is reached: answer 429 with the minutes left until it resets
    handler: (req, res, next) => {
      const minutes = Math.ceil((req.rateLimit.resetTime - Date.now()) / 60000);
      next(
        createError(429, `Too many requests. Try again in ${minutes} minute(s).`, {
          code: ERROR_CODES.RATE_LIMITED,
          params: { count: minutes },
        })
      );
    },
  });
}

// Forgot password: 10 requests per IP address and 3 per email address, every 15 minutes
const forgotPasswordLimitPerIp = createResetLimiter(10);
const forgotPasswordLimitPerEmail = createResetLimiter(3, (req) => `email:${req.forgotPasswordInput.email}`);

// Reset password: 10 requests per IP address every 15 minutes
const resetPasswordLimitPerIp = createResetLimiter(10);

// Checks the forgot-password form BEFORE the rate limits, so a mistyped email does not use
// up an attempt. Saves the checked input on the request for the next steps.
function checkForgotPasswordForm(req, res, next) {
  req.forgotPasswordInput = validate(forgotPasswordSchema, req.body);
  next();
}

// ----------------------------------------------------------------------------
// Routes
// ----------------------------------------------------------------------------

// POST /api/auth/register - create a patient account { name, email, phone, password }
router.post('/register', async (req, res) => {
  const input = validate(registerSchema, req.body);
  const result = await authService.register(input);
  res.status(201).json(result);
});

// POST /api/auth/login - log in { email, password }. Locks after 5 wrong passwords (NFR 2.3).
router.post('/login', async (req, res) => {
  const input = validate(loginSchema, req.body);
  const result = await authService.login(input);
  res.json(result);
});

// POST /api/auth/forgot-password - email a reset link { email, lang }.
// Always gives the same answer, whether or not the email has an account.
router.post(
  '/forgot-password',
  checkForgotPasswordForm,
  forgotPasswordLimitPerIp,
  forgotPasswordLimitPerEmail,
  (req, res) => {
    res.json(passwordResetService.requestPasswordReset(req.forgotPasswordInput));
  }
);

// POST /api/auth/reset-password - choose a new password { token, password }.
// Every login token made before this stops working, and the user's open chat is closed.
router.post('/reset-password', resetPasswordLimitPerIp, async (req, res) => {
  const userId = await passwordResetService.resetPassword(req.body);
  disconnectUser(userId);
  res.json({ message: 'Password updated. Sign in with your new password.' });
});

// GET /api/auth/me - the logged-in user (the React app uses it to restore a session)
router.get('/me', requireLogin, (req, res) => {
  res.json({ user: req.user });
});

// PUT /api/auth/me/phone - add or change your phone number { phone }
router.put('/me/phone', requireLogin, async (req, res) => {
  const input = validate(phoneSchema, req.body);
  const user = await authService.updatePhone(req.user, input);
  res.json({ user });
});

// DELETE /api/auth/me - a patient deletes their own account { password }.
// Their open chat connections are closed with it.
router.delete('/me', requireLogin, async (req, res) => {
  // Staff are refused before anything else is checked
  if (!authService.canDeleteOwnAccount(req.user.role)) {
    throw createError(403, 'Staff accounts cannot be deleted here', { code: ERROR_CODES.ACCOUNT_DELETE_FORBIDDEN });
  }
  const input = validate(deleteAccountSchema, req.body);
  await authService.deleteOwnAccount(req.user, input.password);
  disconnectUser(req.user.id);
  res.status(204).end();
});

export default router;
