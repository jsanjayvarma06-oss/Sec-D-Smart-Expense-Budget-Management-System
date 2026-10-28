import { getRemainingBudget } from './budgetService.js';

const ALERT_THRESHOLDS = [
  { percentage: 100, level: '100_PERCENT', message: 'Budget limit reached or exceeded.' },
  { percentage: 80, level: '80_PERCENT', message: 'You have used at least 80% of your budget.' },
];

function toPaise(amount) {
  return Math.round(Number(amount) * 100);
}

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

    // Compare whole paise so exactly 80% is never missed by floating-point
    // rounding (4.52 of 5.65 is 79.99999999999999 as a JavaScript division).
    const spentPaise = toPaise(budget.spent_amount);
    const budgetPaise = toPaise(budget.budget_amount);
    const percentageUsed = (spentPaise / budgetPaise) * 100;

    for (const threshold of ALERT_THRESHOLDS) {
      if (spentPaise * 100 >= threshold.percentage * budgetPaise) {
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
