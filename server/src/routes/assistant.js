// Routes under /api/assistant: the conversation with Rafiq, the AI assistant (GP2 addition).
// Every signed-in user (patient or staff) has their own private conversation.
import express from 'express';
import createError from 'http-errors';
import { rateLimit } from 'express-rate-limit';
import { ERROR_CODES } from '../constants.js';
import { requireLogin } from '../middleware/auth.js';
import * as assistantService from '../services/assistantService.js';

const router = express.Router();
router.use(requireLogin);

// Each question costs a little money at DeepSeek, so every user may ask at most
// 20 questions every 10 minutes (express-rate-limit library, counted per user).
const questionLimit = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 minutes
  limit: 20,
  keyGenerator: (req) => `user:${req.user.id}`,
  standardHeaders: false,
  legacyHeaders: false,
  // When the limit is reached: answer 429 with the minutes left until it resets
  handler: (req, res, next) => {
    const minutes = Math.ceil((req.rateLimit.resetTime - Date.now()) / 60000);
    next(
      createError(429, `Too many questions. Try again in ${minutes} minute(s).`, {
        code: ERROR_CODES.RATE_LIMITED,
        params: { count: minutes },
      })
    );
  },
});

// GET /api/assistant/messages - my conversation with Rafiq, oldest message first
router.get('/messages', async (req, res) => {
  const messages = await assistantService.getAssistantMessages(req.user.id);
  res.json({ messages });
});

// POST /api/assistant/messages - ask a question { content }.
// Answers { question, answer }: the saved question and Rafiq's saved answer.
router.post('/messages', questionLimit, async (req, res) => {
  const result = await assistantService.askAssistant(req.user, req.body?.content);
  res.status(201).json(result);
});

// DELETE /api/assistant/messages - delete my whole conversation with Rafiq
router.delete('/messages', async (req, res) => {
  await assistantService.clearAssistantMessages(req.user.id);
  res.status(204).end();
});

export default router;
