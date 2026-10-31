import { query } from '../db/pool.js';

// Privacy-safe product usage metrics (#125, #126). Only aggregate counts leave
// this service. Daily buckets backed by fewer than five distinct users are
// suppressed; private/custom category labels are never returned.
export async function getUsageDashboard() {
  const { rows: dailyRows } = await query(
    `WITH days AS (
       SELECT generate_series(
         CURRENT_DATE - INTERVAL '29 days',
         CURRENT_DATE,
         INTERVAL '1 day'
       )::date AS day
     ),
     signups AS (
       SELECT created_at::date AS day,
              COUNT(*)::integer AS event_count,
              COUNT(DISTINCT id)::integer AS user_count
       FROM users
       WHERE created_at >= CURRENT_DATE - INTERVAL '29 days'
         AND created_at < CURRENT_DATE + INTERVAL '1 day'
       GROUP BY created_at::date
     ),
     expense_activity AS (
       SELECT created_at::date AS day,
              COUNT(*)::integer AS event_count,
              COUNT(DISTINCT user_id)::integer AS user_count
       FROM expenses
       WHERE created_at >= CURRENT_DATE - INTERVAL '29 days'
         AND created_at < CURRENT_DATE + INTERVAL '1 day'
       GROUP BY created_at::date
     )
     SELECT days.day::text AS date,
            COALESCE(signups.event_count, 0)::integer AS signup_events,
            COALESCE(signups.user_count, 0)::integer AS signup_users,
            COALESCE(expense_activity.event_count, 0)::integer AS expense_events,
            COALESCE(expense_activity.user_count, 0)::integer AS expense_users
     FROM days
     LEFT JOIN signups ON signups.day = days.day
     LEFT JOIN expense_activity ON expense_activity.day = days.day
     ORDER BY days.day`,
  );

  const { rows: activeRows } = await query(
    `SELECT COUNT(DISTINCT user_id)::integer AS weekly_active_users
     FROM sessions
     WHERE last_seen_at >= now() - INTERVAL '7 days'
       AND expires_at > now()`,
  );

  const { rows: categoryRows } = await query(
    `WITH category_usage AS (
       SELECT
         CASE WHEN c.user_id IS NULL THEN c.name ELSE 'Other' END AS category_name,
         COUNT(*)::integer AS expense_count,
         COUNT(DISTINCT e.user_id)::integer AS user_count
       FROM expenses e
       JOIN categories c ON c.id = e.category_id
       WHERE e.created_at >= CURRENT_DATE - INTERVAL '29 days'
         AND e.created_at < CURRENT_DATE + INTERVAL '1 day'
       GROUP BY CASE WHEN c.user_id IS NULL THEN c.name ELSE 'Other' END
     ),
     visible AS (
       SELECT category_name, expense_count, user_count
       FROM category_usage
       WHERE category_name <> 'Other' AND user_count >= 5
     ),
     hidden AS (
       SELECT
         COUNT(*)::integer AS expense_count,
         COUNT(DISTINCT e.user_id)::integer AS user_count
       FROM expenses e
       JOIN categories c ON c.id = e.category_id
       WHERE e.created_at >= CURRENT_DATE - INTERVAL '29 days'
         AND e.created_at < CURRENT_DATE + INTERVAL '1 day'
         AND (
           c.user_id IS NOT NULL
           OR c.name IN (
             SELECT category_name FROM category_usage
             WHERE category_name <> 'Other' AND user_count < 5
           )
         )
     )
     SELECT category_name, expense_count, user_count
     FROM visible
     UNION ALL
     SELECT 'Other' AS category_name, expense_count, user_count
     FROM hidden
     WHERE user_count >= 5 AND expense_count > 0
     ORDER BY expense_count DESC, category_name ASC
     LIMIT 6`,
  );

  return {
    period_days: 30,
    weekly_active_users: activeRows[0].weekly_active_users,
    daily: dailyRows.map((row) => ({
      date: row.date,
      new_signups: row.signup_users > 0 && row.signup_users < 5 ? null : row.signup_events,
      signups_suppressed: row.signup_users > 0 && row.signup_users < 5,
      expenses_added: row.expense_users > 0 && row.expense_users < 5 ? null : row.expense_events,
      expenses_suppressed: row.expense_users > 0 && row.expense_users < 5,
    })),
    top_categories: categoryRows.map((row) => ({
      category: row.category_name,
      expense_count: row.expense_count,
      users: row.user_count,
    })),
  };
}
