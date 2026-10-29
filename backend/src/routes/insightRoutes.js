import { Router } from 'express';
import {
  createPriceRiseNotifications,
  findSubscriptions,
} from '../services/subscriptionService.js';
import { parseClientToday } from '../utils/clientDate.js';

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

  return router;
}
