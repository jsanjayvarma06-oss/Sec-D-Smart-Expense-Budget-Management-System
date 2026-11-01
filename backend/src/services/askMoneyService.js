import { withUser } from '../db/userScope.js';
import { getRemainingBudget } from './budgetService.js';

export const SUGGESTED_QUESTIONS = [
  'How much did I spend this month?',
  'How much did I spend on Food last month?',
  'What was my biggest expense this month?',
  'Did I spend more than last month?',
  'How much budget do I have left?',
  'How much did I earn this month?',
];

function formatCurrency(amount) {
  const num = Number(amount || 0);
  return `₹${num.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toISOString().slice(0, 10);
}

/**
 * Resolves period bounds based on keywords.
 */
function resolvePeriod(text, now = new Date()) {
  const lower = text.toLowerCase();
  const year = now.getFullYear();
  const month = now.getMonth(); // 0-indexed

  // Specific month check: e.g. "october 2026", "in october", "sep", "september"
  const months = [
    'january', 'february', 'march', 'april', 'may', 'june',
    'july', 'august', 'september', 'october', 'november', 'december',
  ];
  for (let m = 0; m < 12; m += 1) {
    const monthName = months[m];
    const shortName = monthName.slice(0, 3);
    const regex = new RegExp(`\\b(${monthName}|${shortName})\\b(?:\\s+(\\d{4}))?`, 'i');
    const match = lower.match(regex);
    if (match) {
      const targetYear = match[2] ? parseInt(match[2], 10) : (m > month ? year - 1 : year);
      const start = new Date(Date.UTC(targetYear, m, 1)).toISOString().slice(0, 10);
      const end = new Date(Date.UTC(targetYear, m + 1, 0)).toISOString().slice(0, 10);
      const label = `${monthName.charAt(0).toUpperCase() + monthName.slice(1)} ${targetYear}`;
      return { start, end, label, monthKey: `${targetYear}-${String(m + 1).padStart(2, '0')}` };
    }
  }

  // "last month"
  if (lower.includes('last month') || lower.includes('previous month')) {
    const prevMonthDate = new Date(Date.UTC(year, month - 1, 1));
    const prevYear = prevMonthDate.getUTCFullYear();
    const prevMonth = prevMonthDate.getUTCMonth();
    const start = new Date(Date.UTC(prevYear, prevMonth, 1)).toISOString().slice(0, 10);
    const end = new Date(Date.UTC(prevYear, prevMonth + 1, 0)).toISOString().slice(0, 10);
    const label = `${months[prevMonth].charAt(0).toUpperCase() + months[prevMonth].slice(1)} ${prevYear}`;
    return { start, end, label, monthKey: `${prevYear}-${String(prevMonth + 1).padStart(2, '0')}` };
  }

  // "this week"
  if (lower.includes('this week')) {
    const dayOfWeek = now.getDay(); // 0 is Sunday
    const distanceToMonday = (dayOfWeek + 6) % 7;
    const startD = new Date(now);
    startD.setDate(now.getDate() - distanceToMonday);
    const start = startD.toISOString().slice(0, 10);
    const end = now.toISOString().slice(0, 10);
    return { start, end, label: 'this week' };
  }

  // "last week"
  if (lower.includes('last week')) {
    const dayOfWeek = now.getDay();
    const distanceToMonday = (dayOfWeek + 6) % 7;
    const endD = new Date(now);
    endD.setDate(now.getDate() - distanceToMonday - 1);
    const startD = new Date(endD);
    startD.setDate(endD.getDate() - 6);
    return {
      start: startD.toISOString().slice(0, 10),
      end: endD.toISOString().slice(0, 10),
      label: 'last week',
    };
  }

  // Default: "this month"
  const start = new Date(Date.UTC(year, month, 1)).toISOString().slice(0, 10);
  const end = new Date(Date.UTC(year, month + 1, 0)).toISOString().slice(0, 10);
  const label = `${months[month].charAt(0).toUpperCase() + months[month].slice(1)} ${year}`;
  return { start, end, label, monthKey: `${year}-${String(month + 1).padStart(2, '0')}` };
}

/**
 * Natural language money question answering engine (Story #96, #97).
 */
export async function askMoneyQuestion(userId, question, now = new Date()) {
  const trimmed = String(question || '').trim();
  const lower = trimmed.toLowerCase();

  return withUser(userId, async (db) => {
    // 1. Fetch all accessible category names (built-in and custom)
    const catResult = await db.query(
      `SELECT id, name FROM categories WHERE user_id = $1 OR user_id IS NULL`,
      [userId],
    );
    const categories = catResult.rows;

    // Detect if a category is mentioned in the question
    let matchedCategory = null;
    for (const cat of categories) {
      const catRegex = new RegExp(`\\b${cat.name.toLowerCase()}\\b`, 'i');
      if (catRegex.test(lower)) {
        matchedCategory = cat;
        break;
      }
    }

    const period = resolvePeriod(lower, now);

    // INTENT 1: Comparison with last month
    // e.g. "Did I spend more than last month?", "Am I spending more or less than last month?", "Compare spending with last month"
    if (
      lower.includes('more than last month')
      || lower.includes('less than last month')
      || lower.includes('compare with last month')
      || lower.includes('compared to last month')
      || lower.includes('compare to last month')
    ) {
      const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      const prevDate = new Date(Date.UTC(now.getFullYear(), now.getMonth() - 1, 1));
      const prevMonthKey = `${prevDate.getUTCFullYear()}-${String(prevDate.getUTCMonth() + 1).padStart(2, '0')}`;

      const currRes = await db.query(
        `SELECT COALESCE(SUM(amount), 0)::numeric AS total
         FROM expenses
         WHERE user_id = $1 AND spent_on >= $2::date AND spent_on < ($2::date + INTERVAL '1 month')`,
        [userId, `${currentMonthKey}-01`],
      );
      const prevRes = await db.query(
        `SELECT COALESCE(SUM(amount), 0)::numeric AS total
         FROM expenses
         WHERE user_id = $1 AND spent_on >= $2::date AND spent_on < ($2::date + INTERVAL '1 month')`,
        [userId, `${prevMonthKey}-01`],
      );

      const currSpent = Number(currRes.rows[0].total);
      const prevSpent = Number(prevRes.rows[0].total);
      const diff = currSpent - prevSpent;

      let answer;
      if (prevSpent === 0 && currSpent === 0) {
        answer = `You haven't recorded any spending in either this month or last month.`;
      } else if (prevSpent === 0) {
        answer = `You spent ${formatCurrency(currSpent)} so far this month, but had no recorded expenses last month.`;
      } else {
        const percentChange = Math.abs(Math.round((diff / prevSpent) * 1000) / 10);
        if (diff > 0) {
          answer = `Yes, you spent more. You have spent ${formatCurrency(currSpent)} this month compared to ${formatCurrency(prevSpent)} last month (an increase of ${formatCurrency(diff)} or ${percentChange}%).`;
        } else if (diff < 0) {
          answer = `No, you spent less! You have spent ${formatCurrency(currSpent)} this month compared to ${formatCurrency(prevSpent)} last month (a savings of ${formatCurrency(Math.abs(diff))} or ${percentChange}%).`;
        } else {
          answer = `Your spending is exactly the same: ${formatCurrency(currSpent)} both this month and last month.`;
        }
      }

      return {
        answer,
        question: trimmed,
        intent: 'month_comparison',
        figures: {
          current_month: currentMonthKey,
          current_spent: currSpent,
          previous_month: prevMonthKey,
          previous_spent: prevSpent,
          difference: diff,
        },
        suggested_questions: SUGGESTED_QUESTIONS,
      };
    }

    // INTENT 2: Remaining Budget
    // e.g. "How much budget do I have left?", "remaining budget", "budget left"
    if (
      lower.includes('budget')
      && (lower.includes('left') || lower.includes('remain') || lower.includes('have i got') || lower.includes('how much can i spend'))
    ) {
      const monthKey = period.monthKey || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      const budgetRows = await getRemainingBudget(userId, monthKey);
      const overall = Array.isArray(budgetRows)
        ? budgetRows.find((b) => b.category_id === null)
        : budgetRows?.overall;

      if (!overall || Number(overall.budget_amount || overall.budgeted_amount || 0) === 0) {
        return {
          answer: `You do not have an overall budget set for ${period.label}. You can create a budget from the dashboard.`,
          question: trimmed,
          intent: 'remaining_budget',
          figures: { period: period.label, budgeted_amount: 0, remaining_amount: 0 },
          suggested_questions: SUGGESTED_QUESTIONS,
        };
      }

      const budgeted = Number(overall.budget_amount || overall.budgeted_amount);
      const spent = Number(overall.spent_amount);
      const remaining = Number(overall.remaining_amount);
      const percentageUsed = Math.min(100, Math.round((spent / budgeted) * 1000) / 10);

      const answer = remaining >= 0
        ? `You have ${formatCurrency(remaining)} left out of your ${formatCurrency(budgeted)} budget for ${period.label} (${percentageUsed}% used, ${formatCurrency(spent)} spent).`
        : `You have exceeded your ${period.label} budget by ${formatCurrency(Math.abs(remaining))} (budgeted ${formatCurrency(budgeted)}, spent ${formatCurrency(spent)}).`;

      return {
        answer,
        question: trimmed,
        intent: 'remaining_budget',
        figures: {
          period: period.label,
          budgeted_amount: budgeted,
          spent_amount: spent,
          remaining_amount: remaining,
          percentage_used: percentageUsed,
        },
        suggested_questions: SUGGESTED_QUESTIONS,
      };
    }

    // INTENT 3: Biggest / Largest expense
    // e.g. "What was my biggest expense this month?", "largest expense", "highest purchase"
    if (
      lower.includes('biggest')
      || lower.includes('largest')
      || lower.includes('highest')
      || lower.includes('most expensive')
    ) {
      let catFilter = '';
      const params = [userId, period.start, period.end];
      if (matchedCategory) {
        params.push(matchedCategory.id);
        catFilter = `AND e.category_id = $4`;
      }

      const res = await db.query(
        `SELECT e.amount, e.merchant, e.note, e.spent_on, c.name AS category_name
         FROM expenses e
         JOIN categories c ON c.id = e.category_id
         WHERE e.user_id = $1
           AND e.spent_on >= $2::date
           AND e.spent_on <= $3::date
           ${catFilter}
         ORDER BY e.amount DESC, e.spent_on DESC
         LIMIT 1`,
        params,
      );

      if (res.rows.length === 0) {
        const catNote = matchedCategory ? ` in ${matchedCategory.name}` : '';
        return {
          answer: `You had no expenses recorded${catNote} for ${period.label}.`,
          question: trimmed,
          intent: 'biggest_expense',
          figures: { period: period.label, expense: null },
          suggested_questions: SUGGESTED_QUESTIONS,
        };
      }

      const top = res.rows[0];
      const desc = top.merchant || top.note || top.category_name;
      const answer = `Your biggest expense for ${period.label} was ${formatCurrency(top.amount)} for "${desc}" in ${top.category_name} on ${formatDate(top.spent_on)}.`;

      return {
        answer,
        question: trimmed,
        intent: 'biggest_expense',
        figures: {
          period: period.label,
          amount: Number(top.amount),
          merchant: top.merchant,
          category: top.category_name,
          spent_on: formatDate(top.spent_on),
        },
        suggested_questions: SUGGESTED_QUESTIONS,
      };
    }

    // INTENT 4: Income
    // e.g. "How much did I earn this month?", "What was my income last month?", "Total earnings"
    if (
      lower.includes('earn')
      || lower.includes('income')
      || lower.includes('salary')
      || lower.includes('received')
    ) {
      const res = await db.query(
        `SELECT COALESCE(SUM(amount), 0)::numeric AS total, COUNT(*)::int AS count
         FROM income
         WHERE user_id = $1
           AND received_on >= $2::date
           AND received_on <= $3::date`,
        [userId, period.start, period.end],
      );

      const total = Number(res.rows[0].total);
      const count = res.rows[0].count;

      const answer = total > 0
        ? `You received ${formatCurrency(total)} across ${count} income ${count === 1 ? 'record' : 'records'} in ${period.label}.`
        : `You have no income recorded for ${period.label}.`;

      return {
        answer,
        question: trimmed,
        intent: 'income',
        figures: {
          period: period.label,
          total_income: total,
          records_count: count,
        },
        suggested_questions: SUGGESTED_QUESTIONS,
      };
    }

    // INTENT 5: Category spending
    // e.g. "How much did I spend on Food last month?", "spending on travel this week"
    if (
      matchedCategory
      && (lower.includes('spend') || lower.includes('spent') || lower.includes('cost') || lower.includes('how much') || lower.includes('expenses'))
    ) {
      const res = await db.query(
        `SELECT COALESCE(SUM(amount), 0)::numeric AS total, COUNT(*)::int AS count
         FROM expenses
         WHERE user_id = $1
           AND category_id = $2
           AND spent_on >= $3::date
           AND spent_on <= $4::date`,
        [userId, matchedCategory.id, period.start, period.end],
      );

      const total = Number(res.rows[0].total);
      const count = res.rows[0].count;

      const answer = total > 0
        ? `You spent ${formatCurrency(total)} on ${matchedCategory.name} across ${count} ${count === 1 ? 'transaction' : 'transactions'} in ${period.label}.`
        : `You had no expenses recorded for ${matchedCategory.name} in ${period.label}.`;

      return {
        answer,
        question: trimmed,
        intent: 'category_spending',
        figures: {
          category: matchedCategory.name,
          category_id: matchedCategory.id,
          period: period.label,
          total_spent: total,
          transaction_count: count,
        },
        suggested_questions: SUGGESTED_QUESTIONS,
      };
    }

    // INTENT 6: General spending by period
    // e.g. "How much did I spend this month?", "total expenses in October", "how much did I spend last week"
    if (
      lower.includes('spend')
      || lower.includes('spent')
      || lower.includes('expense')
      || lower.includes('how much')
      || lower.includes('total')
    ) {
      const res = await db.query(
        `SELECT COALESCE(SUM(amount), 0)::numeric AS total, COUNT(*)::int AS count
         FROM expenses
         WHERE user_id = $1
           AND spent_on >= $2::date
           AND spent_on <= $3::date`,
        [userId, period.start, period.end],
      );

      const total = Number(res.rows[0].total);
      const count = res.rows[0].count;

      const answer = total > 0
        ? `Your total spending for ${period.label} was ${formatCurrency(total)} across ${count} ${count === 1 ? 'expense' : 'expenses'}.`
        : `You had no expenses recorded for ${period.label}.`;

      return {
        answer,
        question: trimmed,
        intent: 'period_spending',
        figures: {
          period: period.label,
          total_spent: total,
          expense_count: count,
        },
        suggested_questions: SUGGESTED_QUESTIONS,
      };
    }

    // FALLTHROUGH: Unsupported questions
    return {
      answer: `I didn't quite understand that question. You can ask about your spending by category, total expenses, income, remaining budget, or comparisons with last month.`,
      question: trimmed,
      intent: 'unsupported',
      figures: {},
      suggested_questions: SUGGESTED_QUESTIONS,
    };
  });
}
