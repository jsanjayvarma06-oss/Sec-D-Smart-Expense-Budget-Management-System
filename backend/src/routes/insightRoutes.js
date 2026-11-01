import { Router } from 'express';
import { z } from 'zod';
import {
  createPriceRiseNotifications,
  findSubscriptions,
} from '../services/subscriptionService.js';
import { askMoneyQuestion, SUGGESTED_QUESTIONS } from '../services/askMoneyService.js';
import { parseClientToday } from '../utils/clientDate.js';
import { HttpError } from '../utils/httpError.js';

const askSchema = z.object({
  question: z.string().trim().min(1, 'Question cannot be empty').max(200, 'Question is too long (maximum 200 characters)'),
});

export function insightRoutes() {
  const router = Router();

  // Likely subscriptions found in the user's expenses (story #90).
  // GET /api/insights/subscriptions?today=YYYY-MM-DD
  router.get('/subscriptions', async (req, res, next) => {
    try {
      const today = parseClientToday(req.query.today);
      const subscriptions = await findSubscriptions(req.user.id, today);

      res.json({ subscriptions });
    } catch (err) {
      next(err);
    }
  });

  // Turn price rises into notifications, once each.
  router.post('/subscriptions/price-alerts', async (req, res, next) => {
    try {
      const today = parseClientToday(req.body?.today);
      const notifications = await createPriceRiseNotifications(req.user.id, today);

      res.json({
        created_count: notifications.length,
        notifications,
      });
    } catch (err) {
      next(err);
    }
  });

  // Ask questions about my money (story #96, #97).
  // POST /api/insights/ask
  router.post('/ask', async (req, res, next) => {
    try {
      const parseResult = askSchema.safeParse(req.body);
      if (!parseResult.success) {
        throw new HttpError(400, parseResult.error.issues[0]?.message || 'Invalid question', {
          code: 'VALIDATION',
        });
      }

      const { question } = parseResult.data;
      const result = await askMoneyQuestion(req.user.id, question);

      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  // Get suggested example questions for the dashboard.
  router.get('/ask/suggestions', (_req, res) => {
    res.json({
      suggestions: SUGGESTED_QUESTIONS,
    });
  });

  return router;
}
