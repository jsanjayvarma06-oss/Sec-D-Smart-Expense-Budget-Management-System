import { withUser } from '../db/userScope.js';

function calculateProgress(savedAmount, targetAmount) {
  if (targetAmount <= 0) return 0;

  return Math.min(
    100,
    Math.max(0, (savedAmount / targetAmount) * 100),
  );
}

function addGoalDetails(goal, averageMonthlySavings) {
  const savedAmount = Number(goal.saved_amount);
  const targetAmount = Number(goal.target_amount);
  const remainingAmount = Math.max(0, targetAmount - savedAmount);
  const progress = calculateProgress(savedAmount, targetAmount);

  let estimatedMonths = null;
  let estimateMessage =
  'Your goal cannot currently be estimated at your existing saving rate.'; if (remainingAmount === 0) {
    estimatedMonths = 0;
    estimateMessage = 'Your savings goal has been reached.';
  } else if (averageMonthlySavings > 0) {
    estimatedMonths = Math.ceil(
      remainingAmount / averageMonthlySavings,
    );
    estimateMessage = `Approximately ${estimatedMonths} month(s) remaining.`;
  }

  return {
    ...goal,
    progress: Math.round(progress * 100) / 100,
    remaining_amount: remainingAmount,
    average_monthly_savings: averageMonthlySavings,
    estimated_months: estimatedMonths,
    estimate_message: estimateMessage,
  };
}

async function getAverageMonthlySavings(db, userId) {
  const { rows } = await db.query(
    `WITH monthly_savings AS (
       SELECT
         months.month_start,
         COALESCE(income.total_income, 0)
           - COALESCE(expenses.total_expenses, 0) AS savings
       FROM generate_series(
         date_trunc('month', CURRENT_DATE) - INTERVAL '3 months',
         date_trunc('month', CURRENT_DATE) - INTERVAL '1 month',
         INTERVAL '1 month'
       ) AS months(month_start)
       LEFT JOIN (
         SELECT
           date_trunc('month', received_on)::date AS month_start,
           SUM(amount) AS total_income
         FROM income
         WHERE user_id = $1
           AND received_on >=
             date_trunc('month', CURRENT_DATE) - INTERVAL '3 months'
           AND received_on < date_trunc('month', CURRENT_DATE)
         GROUP BY 1
       ) income ON income.month_start = months.month_start::date
       LEFT JOIN (
         SELECT
           date_trunc('month', spent_on)::date AS month_start,
           SUM(amount) AS total_expenses
         FROM expenses
         WHERE user_id = $1
           AND spent_on >=
             date_trunc('month', CURRENT_DATE) - INTERVAL '3 months'
           AND spent_on < date_trunc('month', CURRENT_DATE)
         GROUP BY 1
       ) expenses ON expenses.month_start = months.month_start::date
     )
     SELECT COALESCE(AVG(savings), 0)::numeric(12, 2)
       AS average_monthly_savings
     FROM monthly_savings`,
    [userId],
  );

  return Number(rows[0].average_monthly_savings);
}

export async function listSavingsGoals(userId) {
  return withUser(userId, async (db) => {
    const { rows } = await db.query(
      `SELECT id, name, target_amount, saved_amount,
              target_date, status, created_at, updated_at
       FROM savings_goals
       WHERE user_id = $1
       ORDER BY created_at DESC`,
      [userId],
    );

    const averageMonthlySavings = await getAverageMonthlySavings(db, userId);

    return rows.map((goal) =>
      addGoalDetails(goal, averageMonthlySavings),
    );
  });
}

export async function createSavingsGoal(userId, goal) {
  return withUser(userId, async (db) => {
    const { rows } = await db.query(
      `INSERT INTO savings_goals
        (user_id, name, target_amount, saved_amount, target_date, status)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, name, target_amount, saved_amount,
                 target_date, status, created_at, updated_at`,
      [
        userId,
        goal.name,
        goal.target_amount,
        goal.saved_amount,
        goal.target_date,
        Number(goal.saved_amount) >= Number(goal.target_amount)
          ? 'completed'
          : 'active',
      ],
    );

    const averageMonthlySavings = await getAverageMonthlySavings(db, userId);

    return addGoalDetails(rows[0], averageMonthlySavings);
  });
}

export async function updateSavingsGoal(userId, goalId, goal) {
  return withUser(userId, async (db) => {
    const { rows } = await db.query(
      `UPDATE savings_goals
       SET name = $1,
           target_amount = $2,
           saved_amount = $3,
           target_date = $4,
           status = $5
       WHERE id = $6 AND user_id = $7
       RETURNING id, name, target_amount, saved_amount,
                 target_date, status, created_at, updated_at`,
      [
        goal.name,
        goal.target_amount,
        goal.saved_amount,
        goal.target_date,
        goal.status === 'archived'
  ? 'archived'
  : Number(goal.saved_amount) >= Number(goal.target_amount)
    ? 'completed'
    : 'active',
        goalId,
        userId,
      ],
    );

    if (!rows[0]) return null;

    const averageMonthlySavings = await getAverageMonthlySavings(db, userId);

    return addGoalDetails(rows[0], averageMonthlySavings);
  });
}

export async function deleteSavingsGoal(userId, goalId) {
  return withUser(userId, async (db) => {
    const { rows } = await db.query(
      `DELETE FROM savings_goals
       WHERE id = $1 AND user_id = $2
       RETURNING id`,
      [goalId, userId],
    );

    return rows.length > 0;
  });
}