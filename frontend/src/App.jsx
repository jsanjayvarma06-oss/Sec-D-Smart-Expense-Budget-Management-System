import SpendingCharts from './SpendingCharts.jsx';
import { useCallback, useEffect, useState } from 'react';
import VoiceExpenseButton from './VoiceExpenseButton.jsx';
import SubscriptionsCard from './SubscriptionsCard.jsx';
import AdminPanel from './AdminPanel.jsx';
import TwoFactorSetup from './TwoFactorSetup.jsx';
import { parseSpokenExpense } from './voiceParser.js';

const currentMonth = new Date().toISOString().slice(0, 7);

function localToday() {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

const emptyExpense = {
  amount: '',
  category_id: '',
  spent_on: localToday(),
  merchant: '',
  note: '',
};

const SESSION_EXPIRED_EVENT = 'smart-expense:session-expired';

async function apiRequest(url, options = {}) {
  const response = await fetch(url, {
    credentials: 'include',
    ...options,
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers,
    },
  });

  if (!response.ok) {
    const result = await response.json().catch(() => ({}));

    // UC-01 alternate flow 9a: when the server says the session has ended
    // (idle timeout, expiry or logout elsewhere), send the user back to login.
    if (response.status === 401 && result.code === 'UNAUTHENTICATED' && url !== '/api/auth/me') {
      window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
    }

    throw new Error(
      result.message || result.error || `Request failed (${response.status})`,
    );
  }

  if (response.status === 204) return null;
  return response.json();
}

// FR11: when a saved expense is far above the usual amount for its category,
// say so and what the usual amount is, so the user can confirm or edit it.
function unusualSpendingNotice(expense, successMessage) {
  const anomaly = expense?.anomaly;

  if (!anomaly?.isUnusual) return successMessage;

  return `${successMessage} It is more than 3 times your usual spending in `
    + `this category (about ${formatCurrency(anomaly.averageAmount)}), so it `
    + 'is marked for review. Edit it if the amount is wrong, or mark it as '
    + 'reviewed if it is correct.';
}

function formatCurrency(amount) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2,
  }).format(Number(amount) || 0);
}

// Budget pace (story #93): when this month's budget will run out at the
// current daily spending, from the API's pace fields.
function BudgetPace({ budget }) {
  if (!budget || !budget.pace_status || budget.pace_status === 'exceeded') return null;

  if (budget.pace_status === 'early') {
    const runOut = new Date(`${budget.projected_run_out}T00:00:00`).toLocaleDateString('en-IN', {
      weekday: 'short', day: 'numeric', month: 'short',
    });
    const days = budget.days_early === 1 ? '1 day' : `${budget.days_early} days`;
    return (
      <p className="pace-note pace-early">
        At this pace it runs out on {runOut}, {days} early.
      </p>
    );
  }

  if (budget.pace_status === 'not_enough_data') {
    return <p className="pace-note muted">Spending pace shows from the 3rd of the month.</p>;
  }

  return (
    <p className="pace-note pace-ok">
      On track for the month
      {budget.daily_pace ? ` at ${formatCurrency(budget.daily_pace)} a day` : ''}.
    </p>
  );
}

function AuthScreen({ onLogin, notice = '' }) {
  const [mode, setMode] = useState('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState(notice);

  function switchMode(nextMode) {
    setMode(nextMode);
    setError('');
    setMessage('');
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');
    setMessage('');
    setBusy(true);

    try {
      if (mode === 'forgot') {
        const result = await apiRequest('/api/auth/forgot-password', {
          method: 'POST',
          body: JSON.stringify({ email }),
        });
        setMessage(result.message);
      } else if (mode === 'register') {
        await apiRequest('/api/auth/register', {
          method: 'POST',
          body: JSON.stringify({ name, email, password }),
        });

        setMessage('Account created. Please log in with your new credentials.');
        setMode('login');
        setPassword('');
      } else {
        await apiRequest('/api/auth/login', {
          method: 'POST',
          body: JSON.stringify({ email, password }),
        });

        await onLogin();
      }
    } catch (err) {
      setError(err.message || 'Authentication failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-card">
        <p className="eyebrow">PERSONAL FINANCE</p>
        <h1>Smart Expense &amp; Budget</h1>
        <p className="muted">
          {mode === 'login' && 'Log in to manage your finances.'}
          {mode === 'register' && 'Create an account to manage your budget.'}
          {mode === 'forgot' && "Enter your email and we'll send you a link to reset your password."}
        </p>

        <div className="auth-tabs">
          <button
            type="button"
            className={mode === 'login' ? 'active' : ''}
            onClick={() => {
              setMode('login');
              setError('');
              setMessage('');
            }}
          >
            Log in
          </button>

          <button
            type="button"
            className={mode === 'register' ? 'active' : ''}
            onClick={() => {
              setMode('register');
              setError('');
              setMessage('');
            }}
          >
            Register
          </button>
        </div>

        <form onSubmit={handleSubmit} className="auth-form">
          {mode === 'register' && (
            <label>
              Full name
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                autoComplete="name"
                minLength={2}
                maxLength={100}
                required
              />
            </label>
          )}

          <label>
            Email
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
              required
            />
          </label>

          {mode !== 'forgot' && (
            <label>
              Password
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete={
                  mode === 'login' ? 'current-password' : 'new-password'
                }
                minLength={8}
                maxLength={72}
                required
              />
            </label>
          )}

          {error && (
            <p className="error-message" role="alert">
              {error}
            </p>
          )}

          {message && (
            <p className="success-message" role="status">
              {message}
            </p>
          )}

          <button type="submit" disabled={busy}>
            {busy && 'Please wait…'}
            {!busy && mode === 'login' && 'Log in'}
            {!busy && mode === 'register' && 'Create account'}
            {!busy && mode === 'forgot' && 'Send reset link'}
          </button>

          {mode === 'login' && (
            <button type="button" className="link-button" onClick={() => switchMode('forgot')}>
              Forgot your password?
            </button>
          )}
          {mode === 'forgot' && (
            <button type="button" className="link-button" onClick={() => switchMode('login')}>
              Back to log in
            </button>
          )}
        </form>
      </section>
    </main>
  );
}

// Opened from the link in a password reset email (/reset-password?token=…).
function ResetPasswordScreen({ token, onDone }) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');
    if (password !== confirm) {
      setError('The two passwords do not match.');
      return;
    }

    setBusy(true);
    try {
      const result = await apiRequest('/api/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({ token, password }),
      });
      onDone(result.message);
    } catch (err) {
      setError(err.message || 'Could not reset the password.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-card">
        <p className="eyebrow">PERSONAL FINANCE</p>
        <h1>Choose a new password</h1>
        <p className="muted">After this you'll be logged out everywhere and can log in with the new password.</p>

        <form onSubmit={handleSubmit} className="auth-form">
          <label>
            New password
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="new-password"
              minLength={8}
              maxLength={72}
              required
            />
          </label>
          <label>
            Repeat new password
            <input
              type="password"
              value={confirm}
              onChange={(event) => setConfirm(event.target.value)}
              autoComplete="new-password"
              minLength={8}
              maxLength={72}
              required
            />
          </label>

          {error && (
            <p className="error-message" role="alert">
              {error}
            </p>
          )}

          <button type="submit" disabled={busy}>
            {busy ? 'Please wait…' : 'Change password'}
          </button>
          <button type="button" className="link-button" onClick={() => onDone('')}>
            Back to log in
          </button>
        </form>
      </section>
    </main>
  );
}

function Dashboard({ user, onLogout, onOpenAdmin, onUserChanged }) {
  const [month, setMonth] = useState(currentMonth);
  const [budgets, setBudgets] = useState([]);
  const [categories, setCategories] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [expenseForm, setExpenseForm] = useState(emptyExpense);
  const [voiceNote, setVoiceNote] = useState({ kind: '', text: '' });
  const [editingId, setEditingId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [budgetAmount, setBudgetAmount] = useState('');
  const [budgetSaving, setBudgetSaving] = useState(false);
  const [budgetAlerts, setBudgetAlerts] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [financialHealth, setFinancialHealth] = useState(null);
  const [recurringExpenses, setRecurringExpenses] = useState([]);
  const [recurringForm, setRecurringForm] = useState({
    category_id: '',
    amount: '',
    cycle: 'monthly',
    start_date: localToday(),
    note: '',
  });
  const [recurringSaving, setRecurringSaving] = useState(false);
  const [subscriptions, setSubscriptions] = useState([]);
  const [subscriptionSaving, setSubscriptionSaving] = useState('');
  const [categoryBudgetForm, setCategoryBudgetForm] = useState({
    category_id: '',
    amount: '',
  });
  const [categoryBudgetSaving, setCategoryBudgetSaving] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [categorySaving, setCategorySaving] = useState(false);

  const refreshData = useCallback(() => {
    setRefreshVersion((version) => version + 1);
  }, []);

  useEffect(() => {
    let active = true;

    async function loadDashboard() {
      setLoading(true);
      setError('');

      try {
        const [budgetResult, categoryResult, expenseResult, recurringResult, alertResult, healthResult] =
          await Promise.all([
            apiRequest(
              `/api/budgets/remaining?month=${encodeURIComponent(month)}`,
            ),
            apiRequest('/api/categories'),
            apiRequest('/api/expenses'),
            apiRequest('/api/recurring-expenses'),
            apiRequest(
              `/api/budgets/alerts?month=${encodeURIComponent(month)}`,
            ),
            apiRequest(
              `/api/financial-health?month=${encodeURIComponent(month)}`,
            ),
          ]);

        if (!active) return;

        setBudgets(budgetResult.remainingBudgets || []);
        setCategories(categoryResult.categories || []);
        setExpenses(expenseResult.expenses || []);
        setRecurringExpenses(recurringResult.recurringExpenses || []);
        setBudgetAlerts(alertResult.alerts || []);
        setFinancialHealth(healthResult.health || null);

        try {
          await apiRequest('/api/recurring-expenses/generate-due', {
            method: 'POST',
            body: JSON.stringify({ today: localToday() }),
          });

          const recurringResult = await apiRequest('/api/recurring-expenses');
          if (active) {
            setRecurringExpenses(recurringResult.recurringExpenses || []);
          }

          await apiRequest('/api/notifications/payment-reminders', {
            method: 'POST',
            body: JSON.stringify({ today: localToday() }),
          });
          await apiRequest('/api/insights/subscriptions/price-alerts', {
            method: 'POST',
            body: JSON.stringify({ today: localToday() }),
          });
          const subscriptionResult = await apiRequest(
            `/api/insights/subscriptions?today=${localToday()}`,
          );
          if (active) {
            setSubscriptions(subscriptionResult.subscriptions || []);
          }
          const notificationResult = await apiRequest('/api/notifications');
          if (active) {
            setNotifications(notificationResult.notifications || []);
          }
        } catch (notificationError) {
          console.error('Could not load payment reminders:', notificationError);
        }
      } catch (err) {
        if (active) {
          setError(err.message || 'Could not load dashboard data.');
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    loadDashboard();

    return () => {
      active = false;
    };
  }, [month, refreshVersion]);

  const overallBudget = budgets.find(
    (budget) => budget.category_id === null,
  );

  const categoryBudgets = budgets.filter(
    (budget) => budget.category_id !== null,
  );

  const monthExpenses = expenses.filter(
    (expense) => String(expense.spent_on).slice(0, 7) === month,
  );

  const monthSpent = monthExpenses.reduce(
    (total, expense) => total + Number(expense.amount || 0),
    0,
  );

  const sortedExpenses = [...expenses].sort((a, b) => {
    const dateCompare = String(b.spent_on).localeCompare(String(a.spent_on));
    if (dateCompare !== 0) return dateCompare;

    return String(b.created_at || '').localeCompare(
      String(a.created_at || ''),
    );
  });

  function updateField(event) {
    const { name, value } = event.target;

    setExpenseForm((current) => ({
      ...current,
      [name]: value,
    }));
  }

  // Voice entry (story #87): fill the form from a spoken sentence, for the
  // user to check before saving.
  function applyVoiceTranscript(transcript) {
    const parsed = parseSpokenExpense(transcript, categories.map((c) => c.name));
    if (!parsed.amount) {
      setVoiceNote({ kind: 'error', text: `Heard "${transcript}" but couldn't catch an amount. Try again, or type it in.` });
      return;
    }
    const category = categories.find((c) => c.name === parsed.categoryName);
    const spentOn = new Date();
    spentOn.setDate(spentOn.getDate() - parsed.daysAgo);
    setExpenseForm((current) => ({
      ...current,
      amount: String(parsed.amount),
      category_id: category ? category.id : current.category_id,
      merchant: parsed.merchant ?? current.merchant,
      note: parsed.note ?? current.note,
      spent_on: [spentOn.getFullYear(), String(spentOn.getMonth() + 1).padStart(2, '0'), String(spentOn.getDate()).padStart(2, '0')].join('-'),
    }));
    setVoiceNote({ kind: 'ok', text: `Heard "${transcript}". Check the details below, then click Add expense.${category ? '' : ' Pick a category.'}` });
  }

  function startEditing(expense) {
    setEditingId(expense.id);

    setExpenseForm({
      amount: String(expense.amount),
      category_id: expense.category_id,
      spent_on: String(expense.spent_on).slice(0, 10),
      merchant: expense.merchant || '',
      note: expense.note || '',
    });

    setMessage('');
    setError('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function cancelEditing() {
    setEditingId(null);
    setExpenseForm({ ...emptyExpense, spent_on: localToday() });
    setError('');
    setMessage('');
  }

  async function handleExpenseSubmit(event) {
    event.preventDefault();
    setError('');
    setMessage('');
    setVoiceNote({ kind: '', text: '' });

    if (!expenseForm.category_id) {
      setError('Please select a category.');
      return;
    }

    const amount = Number(expenseForm.amount);

    if (!Number.isFinite(amount) || amount <= 0) {
      setError('Amount must be greater than zero.');
      return;
    }

    if (expenseForm.spent_on > localToday()) {
      setError('Expense date cannot be in the future.');
      return;
    }

    setSaving(true);

    const payload = {
      amount,
      category_id: expenseForm.category_id,
      spent_on: expenseForm.spent_on,
      merchant: expenseForm.merchant.trim() || null,
      note: expenseForm.note.trim() || null,
    };

    try {
      if (editingId) {
        const result = await apiRequest(
          `/api/expenses/${encodeURIComponent(editingId)}`,
          {
            method: 'PUT',
            body: JSON.stringify(payload),
          },
        );

        setMessage(
          unusualSpendingNotice(result.expense, 'Expense updated successfully.'),
        );
      } else {
        const result = await apiRequest('/api/expenses', {
          method: 'POST',
          body: JSON.stringify(payload),
        });

        setMessage(
          unusualSpendingNotice(result.expense, 'Expense added successfully.'),
        );
      }

      setEditingId(null);
      setExpenseForm({ ...emptyExpense, spent_on: localToday() });
      refreshData();
    } catch (err) {
      setError(err.message || 'Could not save expense.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(expense) {
    const confirmed = window.confirm(
      `Delete this expense of ${formatCurrency(expense.amount)}? This cannot be undone.`,
    );

    if (!confirmed) return;

    setError('');
    setMessage('');

    try {
      await apiRequest(
        `/api/expenses/${encodeURIComponent(expense.id)}`,
        { method: 'DELETE' },
      );

      if (editingId === expense.id) cancelEditing();

      setMessage('Expense deleted successfully.');
      refreshData();
    } catch (err) {
      setError(err.message || 'Could not delete expense.');
    }
  }

  async function handleReviewExpense(expense) {
    setError('');
    setMessage('');

    try {
      await apiRequest(
        `/api/expenses/${encodeURIComponent(expense.id)}/review`,
        { method: 'PATCH' },
      );

      setExpenses((current) =>
        current.map((item) =>
          item.id === expense.id
            ? { ...item, is_flagged: false }
            : item,
        ),
      );

      setMessage('Expense marked as reviewed.');
    } catch (err) {
      setError(err.message || 'Could not review expense.');
    }
  }


  async function handleBudgetSubmit(event) {
    event.preventDefault();
    setError('');
    setMessage('');

    const amount = Number(budgetAmount);

    if (!Number.isFinite(amount) || amount <= 0) {
      setError('Budget must be greater than zero.');
      return;
    }

    setBudgetSaving(true);

    try {
      await apiRequest('/api/budgets', {
        method: 'POST',
        body: JSON.stringify({
          month,
          amount,
          category_id: null,
        }),
      });

      setBudgetAmount('');
      setMessage('Monthly budget saved successfully.');
      refreshData();
    } catch (err) {
      setError(err.message || 'Could not save monthly budget.');
    } finally {
      setBudgetSaving(false);
    }
  }

  async function handleCategoryBudgetSubmit(event) {
    event.preventDefault();
    setError('');
    setMessage('');

    const amount = Number(categoryBudgetForm.amount);

    if (!categoryBudgetForm.category_id) {
      setError('Please select a category.');
      return;
    }

    if (!Number.isFinite(amount) || amount <= 0) {
      setError('Category budget must be greater than zero.');
      return;
    }

    setCategoryBudgetSaving(true);

    try {
      await apiRequest('/api/budgets', {
        method: 'POST',
        body: JSON.stringify({
          month,
          amount,
          category_id: categoryBudgetForm.category_id,
        }),
      });

      setCategoryBudgetForm({ category_id: '', amount: '' });
      setMessage('Category budget saved successfully.');
      refreshData();
    } catch (err) {
      setError(err.message || 'Could not save category budget.');
    } finally {
      setCategoryBudgetSaving(false);
    }
  }

  async function handleCreateRecurringExpense(event) {
    event.preventDefault();
    setError('');
    setMessage('');
    setRecurringSaving(true);

    try {
      await apiRequest('/api/recurring-expenses', {
        method: 'POST',
        body: JSON.stringify({
          ...recurringForm,
          amount: Number(recurringForm.amount),
          note: recurringForm.note.trim() || null,
        }),
      });

      const result = await apiRequest(`/api/recurring-expenses?today=${localToday()}`);
      setRecurringExpenses(result.recurringExpenses || []);
      setRecurringForm({
        category_id: '',
        amount: '',
        cycle: 'monthly',
        start_date: localToday(),
        note: '',
      });
      setMessage('Recurring payment created successfully.');
    } catch (err) {
      setError(err.message || 'Could not create recurring payment.');
    } finally {
      setRecurringSaving(false);
    }
  }
  async function handleCategorySubmit(event) {
    event.preventDefault();
    setError('');
    setMessage('');

    const name = newCategoryName.trim();
    if (!name) {
      setError('Enter a category name.');
      return;
    }

    setCategorySaving(true);

    try {
      await apiRequest('/api/categories', {
        method: 'POST',
        body: JSON.stringify({ name }),
      });

      setNewCategoryName('');
      setMessage(`Category "${name}" added.`);
      refreshData();
    } catch (err) {
      setError(err.message || 'Could not add category.');
    } finally {
      setCategorySaving(false);
    }
  }

  async function handleCategoryDelete(category) {
    setError('');
    setMessage('');

    try {
      await apiRequest(`/api/categories/${category.id}`, { method: 'DELETE' });
      setMessage(`Category "${category.name}" deleted.`);
      refreshData();
    } catch (err) {
      setError(err.message || 'Could not delete category.');
    }
  }

  // "Make recurring" on a detected subscription (story #90). The merchant is
  // saved as the note, which is how the detector knows it is set up.
  async function handleMakeRecurring(subscription) {
    setError('');
    setMessage('');
    setSubscriptionSaving(subscription.merchant_key);

    try {
      await apiRequest('/api/recurring-expenses', {
        method: 'POST',
        body: JSON.stringify({
          category_id: subscription.category_id,
          amount: Number(subscription.latest_amount),
          cycle: subscription.cycle,
          start_date: subscription.next_expected_date,
          note: subscription.merchant,
        }),
      });

      const [recurringResult, subscriptionResult] = await Promise.all([
        apiRequest('/api/recurring-expenses'),
        apiRequest(`/api/insights/subscriptions?today=${localToday()}`),
      ]);
      setRecurringExpenses(recurringResult.recurringExpenses || []);
      setSubscriptions(subscriptionResult.subscriptions || []);
      setMessage(`${subscription.merchant} is now a recurring payment.`);
    } catch (err) {
      setError(err.message || 'Could not create recurring payment.');
    } finally {
      setSubscriptionSaving('');
    }
  }

  async function handleMarkNotificationRead(notification) {
    setError('');

    try {
      await apiRequest(`/api/notifications/${notification.id}/read`, {
        method: 'PATCH',
      });

      setNotifications((current) =>
        current.map((item) =>
          item.id === notification.id ? { ...item, is_read: true } : item,
        ),
      );
    } catch (err) {
      setError(err.message || 'Could not mark notification as read.');
    }
  }

  async function handleLogout() {
    setError('');

    try {
      await apiRequest('/api/auth/logout', { method: 'POST' });
      await onLogout();
    } catch (err) {
      setError(err.message || 'Could not log out.');
    }
  }
  return (
    <main className="dashboard">
      <header className="dashboard-header">
        <div>
          <p className="eyebrow">PERSONAL FINANCE</p>
          <h1>Smart Expense &amp; Budget</h1>
          <p className="muted">Welcome, {user.name}.</p>
        </div>

        <div className="header-actions">
          <label className="month-picker">
            Month
            <input
              type="month"
              value={month}
              onChange={(event) => setMonth(event.target.value)}
            />
          </label>
          {user.role === 'admin' && (
            <button
              type="button"
              className="secondary-button"
              onClick={onOpenAdmin}
            >
              Admin panel
            </button>
          )}
          <button
            type="button"
            className="secondary-button"
            onClick={handleLogout}
          >
            Log out
          </button>
        </div>
      </header>

      <section className="connection-panel">
        <span>
          API and database:{' '}
          <strong className="status status-ok">Connected</strong>
        </span>
        <button type="button" onClick={refreshData} disabled={loading}>
          {loading ? 'Refreshing…' : 'Refresh dashboard'}
        </button>
      </section>

      {error && (
        <p className="error-message" role="alert">
          {error}
        </p>
      )}

      {message && (
        <p className="success-message" role="status">
          {message}
        </p>
      )}

      {budgetAlerts.length > 0 && (
        <section className="budget-alerts" aria-label="Budget alerts">
          <h2>Budget alerts</h2>
          {budgetAlerts.map((alert) => (
            <div
              className="warning-message"
              role="alert"
              key={`${alert.budget_id}-${alert.threshold}`}
            >
              <strong>
                {alert.threshold}% — {alert.category_name || 'Overall budget'}:
              </strong>{' '}
              {alert.message}{' '}
              ({formatCurrency(alert.spent_amount)} spent of{' '}
              {formatCurrency(alert.budget_amount)};{' '}
              {alert.percentage_used}% used.)
            </div>
          ))}
        </section>
      )}

      <section className="budget-alerts" aria-label="Recurring payments">
        <h2>Recurring Payments</h2>
        <p>Create and view your weekly or monthly recurring payments.</p>

        <form onSubmit={handleCreateRecurringExpense} className="expense-form">
          <label>
            Category
            <select
              value={recurringForm.category_id}
              onChange={(event) =>
                setRecurringForm((current) => ({
                  ...current,
                  category_id: event.target.value,
                }))
              }
              required
            >
              <option value="">Select a category</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </label>

          <label>
            Amount
            <input
              type="number"
              min="0.01"
              step="0.01"
              value={recurringForm.amount}
              onChange={(event) =>
                setRecurringForm((current) => ({
                  ...current,
                  amount: event.target.value,
                }))
              }
              placeholder="Enter amount"
              required
            />
          </label>

          <label>
            Frequency
            <select
              value={recurringForm.cycle}
              onChange={(event) =>
                setRecurringForm((current) => ({
                  ...current,
                  cycle: event.target.value,
                }))
              }
            >
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
            </select>
          </label>

          <label>
            First due date
            <input
              type="date"
              value={recurringForm.start_date}
              onChange={(event) =>
                setRecurringForm((current) => ({
                  ...current,
                  start_date: event.target.value,
                }))
              }
              required
            />
          </label>

          <label>
            Note (optional)
            <input
              type="text"
              maxLength="255"
              value={recurringForm.note}
              onChange={(event) =>
                setRecurringForm((current) => ({
                  ...current,
                  note: event.target.value,
                }))
              }
              placeholder="e.g. Internet bill"
            />
          </label>

          <button
            type="submit"
            disabled={recurringSaving || categories.length === 0}
          >
            {recurringSaving ? 'Saving...' : 'Add recurring payment'}
          </button>
        </form>

        <h3>Saved recurring payments ({recurringExpenses.length})</h3>

        {recurringExpenses.length === 0 ? (
          <p>No recurring payments added yet.</p>
        ) : (
          <div className="summary-grid">
            {recurringExpenses.map((payment) => (
              <article className="summary-card" key={payment.id}>
                <h3>{payment.category_name || 'Recurring payment'}</h3>
                <p>Amount: {formatCurrency(payment.amount)}</p>
                <p>Frequency: {payment.cycle}</p>
                <p>Next due: {payment.next_due_date}</p>
                {payment.note && <p>Note: {payment.note}</p>}
                <p>Status: {payment.is_active ? 'Active' : 'Inactive'}</p>
              </article>
            ))}
          </div>
        )}
      </section>

      <SubscriptionsCard
        subscriptions={subscriptions}
        savingKey={subscriptionSaving}
        onMakeRecurring={handleMakeRecurring}
      />

      <section className="budget-alerts" aria-label="Notifications">
        <h2>
          Notifications ({notifications.filter((item) => !item.is_read).length} unread)
        </h2>

        {notifications.length === 0 ? (
          <p>No notifications yet. Budget alerts and payment reminders will appear here.</p>
        ) : (
          notifications.map((notification) => (
            <div
              className={notification.is_read ? "summary-card" : "warning-message"}
              key={notification.id}
            >
              <p>{notification.message}</p>
              {!notification.is_read && (
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => handleMarkNotificationRead(notification)}
                >
                  Mark as read
                </button>
              )}
            </div>
          ))
        )}
      </section>

      <section className="budget-alerts" aria-label="Financial health score">
        <h2>Financial Health Score</h2>
        {financialHealth ? (
          <>
            <div className="summary-grid">
              <article className="summary-card">
                <p>Score</p>
                <h2>{financialHealth.score}/100</h2>
                <p>{financialHealth.rating}</p>
              </article>
              <article className="summary-card">
                <p>Savings</p>
                <h2>{formatCurrency(financialHealth.savings)}</h2>
                <p>
                  Savings rate:{' '}
                  {financialHealth.savings_rate === null
                    ? 'Not available'
                    : `${financialHealth.savings_rate}%`}
                </p>
              </article>
              <article className="summary-card">
                <p>Monthly expenses</p>
                <h2>{formatCurrency(financialHealth.total_expenses)}</h2>
                <p>
                  Budget usage:{' '}
                  {financialHealth.budget_usage_rate === null
                    ? 'No budget set'
                    : `${financialHealth.budget_usage_rate}%`}
                </p>
              </article>
            </div>
            <h3>Why you received this score</h3>
            {financialHealth.explanation?.length ? (
              <ul>
                {financialHealth.explanation.map((reason, index) => (
                  <li key={`${index}-${reason}`}>{reason}</li>
                ))}
              </ul>
            ) : (
              <p className="muted">No explanation is available for this month.</p>
            )}
          </>
        ) : (
          <p className="muted">Financial health data is not available yet.</p>
        )}
      </section>

      <section className="summary-grid" aria-label="Budget summary">
        <article className="summary-card">
          <p>Total monthly budget</p>
          <h2>
            {overallBudget
              ? formatCurrency(overallBudget.budget_amount)
              : 'Not set'}
          </h2>
        </article>

        <article className="summary-card">
          <p>Spent this month</p>
          <h2>{formatCurrency(monthSpent)}</h2>
        </article>

        <article className="summary-card">
          <p>Remaining budget</p>
          <h2 className={overallBudget?.exceeded ? 'amount-negative' : ''}>
            {overallBudget
              ? formatCurrency(overallBudget.remaining_amount)
              : '—'}
          </h2>
          <BudgetPace budget={overallBudget} />
        </article>
      </section>
      
<SpendingCharts
  expenses={monthExpenses}
  allExpenses={expenses}
  month={month}
  categories={categories}
/>


      <section className="expense-section">
        <h2>
          {overallBudget ? 'Update monthly budget' : 'Set monthly budget'}
        </h2>
        <p className="muted">
          Set the overall spending limit for {month}. Category budgets must fit
          within this overall limit.
        </p>

        <form className="expense-form" onSubmit={handleBudgetSubmit}>
          <label>
            Monthly budget (₹)
            <input
              type="number"
              min="0.01"
              max="9999999999.99"
              step="0.01"
              value={budgetAmount}
              onChange={(event) => setBudgetAmount(event.target.value)}
              placeholder={
                overallBudget
                  ? String(overallBudget.budget_amount)
                  : 'e.g. 10000'
              }
              required
            />
          </label>

          <div className="expense-form-actions">
            <button type="submit" disabled={budgetSaving}>
              {budgetSaving
                ? 'Saving…'
                : overallBudget
                  ? 'Update budget'
                  : 'Save monthly budget'}
            </button>
          </div>
        </form>
      </section>

      <section className="expense-section">
        <h2>Your categories</h2>
        <p className="muted">
          Add your own categories next to the built-in ones. You can use them
          for expenses and budgets, and delete one once nothing uses it.
        </p>

        <form className="expense-form" onSubmit={handleCategorySubmit}>
          <label>
            New category
            <input
              type="text"
              maxLength={50}
              value={newCategoryName}
              onChange={(event) => setNewCategoryName(event.target.value)}
              placeholder="e.g. Pet care"
              required
            />
          </label>

          <div className="expense-form-actions">
            <button type="submit" disabled={categorySaving}>
              {categorySaving ? 'Adding…' : 'Add category'}
            </button>
          </div>
        </form>

        {categories.some((category) => category.user_id) && (
          <ul className="muted">
            {categories
              .filter((category) => category.user_id)
              .map((category) => (
                <li key={category.id}>
                  {category.name}{' '}
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => handleCategoryDelete(category)}
                  >
                    Delete
                  </button>
                </li>
              ))}
          </ul>
        )}
      </section>

      <section className="expense-section">
        <h2>Set category budget</h2>
        <p className="muted">
          Set a spending limit for one category in {month}. The combined
          category budgets cannot exceed the overall monthly budget.
        </p>

        <form
          className="expense-form"
          onSubmit={handleCategoryBudgetSubmit}
        >
          <label>
            Category
            <select
              value={categoryBudgetForm.category_id}
              onChange={(event) =>
                setCategoryBudgetForm((current) => ({
                  ...current,
                  category_id: event.target.value,
                }))
              }
              required
            >
              <option value="">Select a category</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </label>

          <label>
            Category budget (₹)
            <input
              type="number"
              min="0.01"
              max="9999999999.99"
              step="0.01"
              value={categoryBudgetForm.amount}
              onChange={(event) =>
                setCategoryBudgetForm((current) => ({
                  ...current,
                  amount: event.target.value,
                }))
              }
              placeholder="e.g. 1000"
              required
            />
          </label>

          <div className="expense-form-actions">
            <button
              type="submit"
              disabled={categoryBudgetSaving || categories.length === 0}
            >
              {categoryBudgetSaving ? 'Saving…' : 'Save category budget'}
            </button>
          </div>
        </form>
      </section>

      <section className="budget-section">
        <h2>Category budgets</h2>
        <p className="muted">Spending and remaining amounts for {month}.</p>

        {loading && <p role="status">Loading dashboard…</p>}

        {!loading && budgets.length === 0 && (
          <div className="empty-state">
            <h3>No budgets found</h3>
            <p>Create a monthly budget to see your remaining balance.</p>
          </div>
        )}

        {!loading && categoryBudgets.length > 0 && (
          <div className="budget-list">
            {categoryBudgets.map((budget) => {
              const amount = Number(budget.budget_amount) || 0;
              const spent = Number(budget.spent_amount) || 0;
              const percentage =
                amount > 0 ? Math.min(100, (spent / amount) * 100) : 0;

              return (
                <article className="budget-card" key={budget.budget_id}>
                  <div className="budget-card-heading">
                    <div>
                      <h3>{budget.category_name || 'Category'}</h3>
                      <p className="muted">
                        {formatCurrency(spent)} spent of{' '}
                        {formatCurrency(amount)}
                      </p>
                    </div>

                    <div className="budget-remaining">
                      <strong
                        className={
                          budget.exceeded ? 'amount-negative' : ''
                        }
                      >
                        {formatCurrency(budget.remaining_amount)}
                      </strong>
                      <span>remaining</span>
                    </div>
                  </div>

                  <div
                    className="progress-track"
                    role="progressbar"
                    aria-label={`${budget.category_name || 'Category'} budget used`}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={Math.round(percentage)}
                  >
                    <div
                      className={`progress-fill ${
                        budget.exceeded ? 'progress-exceeded' : ''
                      }`}
                      style={{ width: `${percentage}%` }}
                    />
                  </div>

                  <BudgetPace budget={budget} />

                  {budget.exceeded && (
                    <p className="warning-message">
                      This category budget has been exceeded.
                    </p>
                  )}
                </article>
              );
            })}
          </div>
        )}

        {overallBudget?.exceeded && (
          <p className="warning-message">
            Your overall monthly budget has been exceeded.
          </p>
        )}
      </section>

      <section className="expense-section">
        <h2>{editingId ? 'Edit expense' : 'Add an expense'}</h2>
        <p className="muted">
          Record your spending. Your remaining budget refreshes after saving.
        </p>

        {categories.length === 0 && !loading && (
          <p className="warning-message">
            No categories are available. Check the category API before adding
            an expense.
          </p>
        )}

        {!editingId && (
          <div className="voice-entry">
            <VoiceExpenseButton
              onTranscript={applyVoiceTranscript}
              onError={(text) => setVoiceNote({ kind: 'error', text })}
              disabled={categories.length === 0}
            />
            <span className="muted">Try: "Spent 120 on chai at the canteen"</span>
          </div>
        )}
        {voiceNote.text && (
          <p className={voiceNote.kind === 'error' ? 'error-message' : 'success-message'} role="status">
            {voiceNote.text}
          </p>
        )}

        <form className="expense-form" onSubmit={handleExpenseSubmit}>
          <label>
            Amount (₹)
            <input
              name="amount"
              type="number"
              min="0.01"
              max="9999999999.99"
              step="0.01"
              value={expenseForm.amount}
              onChange={updateField}
              placeholder="e.g. 250"
              required
            />
          </label>

          <label>
            Category
            <select
              name="category_id"
              value={expenseForm.category_id}
              onChange={updateField}
              required
            >
              <option value="">Select a category</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </label>

          <label>
            Date
            <input
              name="spent_on"
              type="date"
              value={expenseForm.spent_on}
              max={localToday()}
              onChange={updateField}
              required
            />
          </label>

          <label>
            Merchant (optional)
            <input
              name="merchant"
              value={expenseForm.merchant}
              onChange={updateField}
              maxLength={100}
              placeholder="e.g. Swiggy"
            />
          </label>

          <label className="expense-note-field">
            Note (optional)
            <textarea
              name="note"
              value={expenseForm.note}
              onChange={updateField}
              maxLength={255}
              rows={3}
              placeholder="Add a short note"
            />
          </label>

          <div className="expense-form-actions">
            <button
              type="submit"
              disabled={saving || categories.length === 0}
            >
              {saving
                ? 'Saving…'
                : editingId
                  ? 'Save changes'
                  : 'Add expense'}
            </button>

            {editingId && (
              <button
                type="button"
                className="secondary-button"
                onClick={cancelEditing}
                disabled={saving}
              >
                Cancel edit
              </button>
            )}
          </div>
        </form>
      </section>

      <section className="expense-section">
        <div className="expense-list-heading">
          <div>
            <h2>Expense history</h2>
            <p className="muted">
              Showing all your recorded expenses. Selected month: {month}.
            </p>
          </div>
          <strong>{monthExpenses.length} this month</strong>
        </div>

        {!loading && sortedExpenses.length === 0 && (
          <div className="empty-state">
            <h3>No expenses yet</h3>
            <p>Add your first expense using the form above.</p>
          </div>
        )}

        {sortedExpenses.length > 0 && (
          <div className="expense-table-wrapper">
            <table className="expense-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Expense</th>
                  <th>Category</th>
                  <th>Amount</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {sortedExpenses.map((expense) => (
  <tr key={expense.id}>
    <td>{String(expense.spent_on).slice(0, 10)}</td>
    <td>
      <strong>{expense.merchant || 'Expense'}</strong>
      {expense.note && (
        <p className="muted expense-note">{expense.note}</p>
      )}
      {expense.is_flagged && (
        <p className="expense-warning">
          ⚠ Unusual spending detected. Edit it if the amount is wrong, or mark
          it as reviewed if it is correct.
        </p>
      )}
    </td>
    <td>
      {expense.category_name ||
        categories.find(
          (category) => category.id === expense.category_id,
        )?.name ||
        'Category'}
    </td>
    <td className="expense-amount">
      {formatCurrency(expense.amount)}
    </td>
    <td>
      <div className="table-actions">
        {expense.is_flagged && (
          <button
            type="button"
            className="secondary-button"
            onClick={() => handleReviewExpense(expense)}
          >
            Mark as reviewed
          </button>
        )}
        <button
          type="button"
          className="secondary-button"
          onClick={() => startEditing(expense)}
        >
          Edit
        </button>
        <button
          type="button"
          className="danger-button"
          onClick={() => handleDelete(expense)}
        >
          Delete
        </button>
      </div>
    </td>
  </tr>
))}

              </tbody>
            </table>
          </div>
        )}
      </section>

      <TwoFactorSetup user={user} apiRequest={apiRequest} onEnabled={onUserChanged} />

      <footer className="dashboard-footer">
        <p className="muted">Signed in as {user.email}.</p>
        <button
          type="button"
          className="secondary-button"
          onClick={refreshData}
          disabled={loading}
        >
          Recalculate remaining budget
        </button>
      </footer>
    </main>
  );
}

export default function App() {
  const [apiStatus, setApiStatus] = useState('checking');
  const [user, setUser] = useState(null);
  const [checkingSession, setCheckingSession] = useState(true);
  const [authNotice, setAuthNotice] = useState('');
  const [resetToken, setResetToken] = useState(() => (
    window.location.pathname === '/reset-password'
      ? new URLSearchParams(window.location.search).get('token') || ''
      : ''
  ));

  const [adminOpen, setAdminOpen] = useState(() => window.location.pathname === '/admin');

  // /admin is the admin panel. Back and forward in the browser switch between it
  // and the dashboard.
  useEffect(() => {
    function handlePopState() {
      setAdminOpen(window.location.pathname === '/admin');
    }

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  function openAdmin(open) {
    window.history.pushState(null, '', open ? '/admin' : '/');
    setAdminOpen(open);
  }

  function finishReset(message) {
    window.history.replaceState(null, '', '/');
    setResetToken('');
    setAuthNotice(message);
  }

  const loadCurrentUser = useCallback(async () => {
    const result = await apiRequest('/api/auth/me');
    setAuthNotice('');
    setUser(result.user);
  }, []);

  useEffect(() => {
    function handleSessionExpired() {
      setAuthNotice('Your session has expired. Please log in again.');
      setUser(null);
    }

    window.addEventListener(SESSION_EXPIRED_EVENT, handleSessionExpired);
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, handleSessionExpired);
  }, []);

  useEffect(() => {
    let active = true;

    fetch('/api/health')
      .then((response) => {
        if (active) setApiStatus(response.ok ? 'ok' : 'error');
      })
      .catch(() => {
        if (active) setApiStatus('error');
      });

    apiRequest('/api/auth/me')
      .then((result) => {
        if (active) setUser(result.user);
      })
      .catch(() => {
        if (active) setUser(null);
      })
      .finally(() => {
        if (active) setCheckingSession(false);
      });

    return () => {
      active = false;
    };
  }, []);

  async function handleLogoutComplete() {
    setUser(null);
  }

  if (resetToken) {
    return <ResetPasswordScreen token={resetToken} onDone={finishReset} />;
  }

  if (checkingSession) {
    return (
      <main className="auth-page">
        <p role="status">Checking your session…</p>
      </main>
    );
  }

  if (!user) {
    return (
      <>
        <AuthScreen key={authNotice} onLogin={loadCurrentUser} notice={authNotice} />
        <p className="auth-api-status">
          API:{' '}
          <strong className={`status status-${apiStatus}`}>
            {apiStatus}
          </strong>
        </p>
      </>
    );
  }

  // Only admins get the panel; anyone else at /admin sees their dashboard. The
  // API refuses non-admins either way.
  if (adminOpen && user.role === 'admin') {
    return <AdminPanel user={user} apiRequest={apiRequest} onBack={() => openAdmin(false)} />;
  }

  return (
    <Dashboard
      user={user}
      onLogout={handleLogoutComplete}
      onOpenAdmin={() => openAdmin(true)}
      onUserChanged={loadCurrentUser}
    />
  );
}
