import { query } from '../db/pool.js';

const ALLOWED_EVENT_TYPES = new Set([
  'login_failed',
  'account_locked',
  'rate_limit_blocked',
  'password_reset_requested',
  'two_factor_failed',
  'disabled_account_login_attempt',
]);

/**
 * Records a security event in the security_events table.
 * Strips any sensitive fields (passwords, tokens, secrets) before saving.
 */
export async function recordSecurityEvent({
  eventType,
  email,
  ipAddress = null,
  details = {},
}) {
  if (!ALLOWED_EVENT_TYPES.has(eventType)) {
    return null;
  }

  const normalizedEmail = email ? String(email).trim().toLowerCase() : null;

  // Sanitize details: strictly remove passwords, tokens, or hashes (SR10)
  const safeDetails = { ...details };
  delete safeDetails.password;
  delete safeDetails.code;
  delete safeDetails.token;
  delete safeDetails.secret;
  delete safeDetails.amount;

  const result = await query(
    `INSERT INTO security_events (event_type, email, ip_address, details)
     VALUES ($1, $2, $3, $4)
     RETURNING id, event_type, email, ip_address, details, created_at`,
    [eventType, normalizedEmail, ipAddress, JSON.stringify(safeDetails)],
  );

  return result.rows[0];
}

/**
 * Returns security analytics for the admin security monitor screen.
 * Covers the last 7 days of activity and highlights the top targeted accounts.
 */
export async function getSecurityOverview() {
  // 1. Fetch 7-day daily counts grouped by day and event_type
  const dailyResult = await query(
    `SELECT
       TO_CHAR(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS day,
       event_type,
       COUNT(*)::int AS count
     FROM security_events
     WHERE created_at >= NOW() - INTERVAL '7 days'
     GROUP BY day, event_type
     ORDER BY day ASC`,
  );

  // Build a continuous 7-day timeline
  const days = [];
  const now = new Date();
  for (let i = 6; i >= 0; i -= 1) {
    const d = new Date(now);
    d.setUTCDate(d.getUTCDate() - i);
    days.push(d.toISOString().slice(0, 10));
  }

  const dailyCountsByDate = {};
  for (const day of days) {
    dailyCountsByDate[day] = {
      day,
      login_failed: 0,
      account_locked: 0,
      rate_limit_blocked: 0,
      password_reset_requested: 0,
      two_factor_failed: 0,
      disabled_account_login_attempt: 0,
      total: 0,
    };
  }

  const totals = {
    login_failed: 0,
    account_locked: 0,
    rate_limit_blocked: 0,
    password_reset_requested: 0,
    two_factor_failed: 0,
    disabled_account_login_attempt: 0,
    total_events: 0,
  };

  for (const row of dailyResult.rows) {
    if (dailyCountsByDate[row.day]) {
      dailyCountsByDate[row.day][row.event_type] = row.count;
      dailyCountsByDate[row.day].total += row.count;
    }
    if (totals[row.event_type] !== undefined) {
      totals[row.event_type] += row.count;
    }
    totals.total_events += row.count;
  }

  // 2. Fetch top targeted accounts in the last 7 days
  const topAccountsResult = await query(
    `SELECT
       se.email,
       COUNT(*)::int AS failed_count,
       MAX(se.created_at) AS last_event_at,
       u.id AS user_id,
       CASE WHEN u.locked_until IS NOT NULL AND u.locked_until > NOW() THEN true ELSE false END AS is_locked,
       CASE WHEN u.disabled_at IS NOT NULL THEN true ELSE false END AS is_disabled
     FROM security_events se
     LEFT JOIN users u ON LOWER(u.email) = se.email
     WHERE se.created_at >= NOW() - INTERVAL '7 days'
       AND se.email IS NOT NULL
       AND se.event_type IN ('login_failed', 'account_locked', 'two_factor_failed', 'disabled_account_login_attempt')
     GROUP BY se.email, u.id, u.locked_until, u.disabled_at
     ORDER BY failed_count DESC, last_event_at DESC
     LIMIT 10`,
  );

  return {
    timeline: days.map((day) => dailyCountsByDate[day]),
    totals,
    top_targeted_accounts: topAccountsResult.rows.map((row) => ({
      email: row.email,
      failed_count: row.failed_count,
      last_event_at: row.last_event_at,
      user_id: row.user_id,
      is_locked: row.is_locked,
      is_disabled: row.is_disabled,
    })),
  };
}
