import { getRemainingBudget } from './budgetService.js';

const ALERT_THRESHOLDS = [
  { percentage: 100, level: '100_PERCENT', message: 'Budget limit reached or exceeded.' },
  { percentage: 80, level: '80_PERCENT', message: 'You have used at least 80% of your budget.' },
];

/**
 * Check overall and category budgets against alert thresholds.
 * This service calculates alerts but does not send notifications.
 */
export async function getBudgetAlerts(userId, month) {
  const budgets = await getRemainingBudget(userId, month);
  const alerts = [];

  for (const budget of budgets) {
    if (budget.budget_amount <= 0) {
      continue;
    }

    const percentageUsed =
      (budget.spent_amount / budget.budget_amount) * 100;

    for (const threshold of ALERT_THRESHOLDS) {
      if (percentageUsed >= threshold.percentage) {
        alerts.push({
          budget_id: budget.budget_id,
          month: budget.month,
          category_id: budget.category_id,
          category_name: budget.category_name,
          threshold: threshold.percentage,
          level: threshold.level,
          budget_amount: budget.budget_amount,
          spent_amount: budget.spent_amount,
          remaining_amount: budget.remaining_amount,
          percentage_used: Math.round(percentageUsed * 100) / 100,
          message: threshold.message,
        });

        // Only return the highest applicable threshold for this budget.
        break;
      }
    }
  }

  return alerts;
}
